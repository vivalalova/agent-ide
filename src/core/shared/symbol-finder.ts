/**
 * 統一的符號查找器
 * 整合 AST 分析和文字匹配，提供跨檔案符號查找能力
 */

import type { Range, Location } from '@shared/types/core.js';
import { SymbolType, type Symbol } from '@shared/types/symbol.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';

/**
 * 符號引用
 */
export interface SymbolReference {
  readonly symbolName: string;
  readonly location: Location;
  readonly type: SymbolReferenceType;
  /** 引用所在行的完整程式碼（用於輸出顯示） */
  readonly context?: string;
  /** 所屬容器名稱（class、interface 等，用於作用域識別） */
  readonly containerName?: string;
  /** 是否為方法呼叫（用於區分同名方法） */
  readonly isMethodCall?: boolean;
  /** 呼叫者類型名稱（用於精確匹配方法所屬類別） */
  readonly receiverType?: string;
}

/**
 * 符號引用類型
 */
export enum SymbolReferenceType {
  Definition = 'definition',
  Usage = 'usage',
  Import = 'import',
  Export = 'export'
}

/**
 * 函式呼叫點
 */
export interface CallSite {
  readonly functionName: string;
  readonly location: Location;
  readonly arguments: readonly CallSiteArgument[];
  readonly isMethodCall: boolean;
  readonly receiver?: string;
}

/**
 * 呼叫點參數
 */
export interface CallSiteArgument {
  readonly index: number;
  readonly name?: string;
  readonly value: string;
  readonly range: Range;
}

/**
 * 類別成員
 */
export interface ClassMember {
  readonly name: string;
  readonly type: ClassMemberType;
  readonly location: Location;
  readonly modifiers: readonly string[];
  readonly valueType?: string;
}

/**
 * 類別成員類型
 */
export enum ClassMemberType {
  Method = 'method',
  Property = 'property',
  Getter = 'getter',
  Setter = 'setter',
  Constructor = 'constructor'
}

/**
 * 符號定義
 */
export interface SymbolDefinition {
  readonly symbol: Symbol;
  readonly signature?: string;
  readonly documentation?: string;
}

/**
 * 符號查找器
 */
export class SymbolFinder {
  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem
  ) {}

  /**
   * 查找符號定義
   */
  async findDefinition(filePath: string, symbolName: string): Promise<SymbolDefinition | null> {
    const content = await this.readFile(filePath);
    if (!content) {
      return null;
    }

    const parser = this.getParser(filePath);
    if (!parser) {
      return null;
    }

    try {
      const ast = await parser.parse(content, filePath);
      const symbols = await parser.extractSymbols(ast);

      const symbol = symbols.find(s => s.name === symbolName);
      if (!symbol) {
        return null;
      }

      return {
        symbol,
        signature: this.extractSignature(content, symbol),
        documentation: this.extractDocumentation(content, symbol)
      };
    } catch {
      return null;
    }
  }

  /**
   * 批次查找符號的引用（一次遍歷所有檔案，減少重複解析）
   * 時間複雜度：O(M × N)，M=檔案數，N=符號數
   * 優化點：M 次檔案讀取/解析（一次遍歷 M 檔查找 N 符號），
   * 而非 N×M 次（N 符號各遍歷 M 檔）
   */
  async findReferencesMultiple(
    symbolNames: ReadonlySet<string>,
    projectFiles: readonly string[]
  ): Promise<Map<string, SymbolReference[]>> {
    const results = new Map<string, SymbolReference[]>();

    // 初始化結果 Map
    for (const name of symbolNames) {
      results.set(name, []);
    }

    // 一次遍歷所有檔案
    for (const filePath of projectFiles) {
      const content = await this.readFile(filePath);
      if (!content) {
        continue;
      }

      const parser = this.getParser(filePath);
      if (!parser) {
        // 降級到文字匹配
        this.findReferencesMultipleByText(filePath, content, symbolNames, results);
        continue;
      }

      try {
        const ast = await parser.parse(content, filePath);

        // 對每個目標符號查找引用
        for (const symbolName of symbolNames) {
          const dummySymbol: Symbol = {
            name: symbolName,
            type: SymbolType.Variable,
            location: {
              filePath,
              range: {
                start: { line: 1, column: 1, offset: undefined },
                end: { line: 1, column: 1, offset: undefined }
              }
            },
            scope: undefined,
            modifiers: []
          };

          const references = await parser.findReferences(ast, dummySymbol);
          const refs = results.get(symbolName);
          if (!refs) {
            continue;
          }

          for (const ref of references) {
            refs.push({
              symbolName,
              location: ref.location,
              type: ref.type === 'definition'
                ? SymbolReferenceType.Definition
                : SymbolReferenceType.Usage
            });
          }
        }
      } catch {
        // Parser 失敗，降級到文字匹配
        this.findReferencesMultipleByText(filePath, content, symbolNames, results);
      }
    }

    return results;
  }

  /**
   * 批次文字匹配查找（降級方法）
   */
  private findReferencesMultipleByText(
    filePath: string,
    content: string,
    symbolNames: ReadonlySet<string>,
    results: Map<string, SymbolReference[]>
  ): void {
    const lines = content.split('\n');

    for (const symbolName of symbolNames) {
      const regex = new RegExp(`\\b${this.escapeRegex(symbolName)}\\b`, 'g');
      const refs = results.get(symbolName);
      if (!refs) {
        continue;
      }

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        let match;

        while ((match = regex.exec(line)) !== null) {
          refs.push({
            symbolName,
            location: {
              filePath,
              range: {
                start: { line: lineIndex + 1, column: match.index + 1, offset: undefined },
                end: { line: lineIndex + 1, column: match.index + 1 + symbolName.length, offset: undefined }
              }
            },
            type: SymbolReferenceType.Usage,
            context: line.trim()
          });
        }
      }
    }
  }

  /**
   * 查找檔案中的符號引用
   */
  async findReferencesInFile(filePath: string, symbolName: string): Promise<SymbolReference[]> {
    const content = await this.readFile(filePath);
    if (!content) {
      return [];
    }

    const parser = this.getParser(filePath);
    if (!parser) {
      // 降級到文字匹配
      return this.findReferencesByText(filePath, content, symbolName);
    }

    try {
      const ast = await parser.parse(content, filePath);

      // 建立虛擬符號用於查找
      const dummySymbol: Symbol = {
        name: symbolName,
        type: SymbolType.Variable,
        location: {
          filePath,
          range: {
            start: { line: 1, column: 1, offset: undefined },
            end: { line: 1, column: 1, offset: undefined }
          }
        },
        scope: undefined,
        modifiers: []
      };

      const references = await parser.findReferences(ast, dummySymbol);
      const lines = content.split('\n');

      return references.map(ref => {
        const lineIndex = ref.location.range.start.line - 1;
        // 保留原始行內容（不 trim），讓 diff 輸出保持正確的縮排
        const context = lineIndex >= 0 && lineIndex < lines.length
          ? lines[lineIndex]
          : undefined;

        return {
          symbolName,
          location: ref.location,
          type: ref.type === 'definition'
            ? SymbolReferenceType.Definition
            : SymbolReferenceType.Usage,
          context
        };
      });
    } catch {
      // Parser 失敗，降級到文字匹配
      return this.findReferencesByText(filePath, content, symbolName);
    }
  }

  /**
   * 使用完整符號資訊查找檔案中的引用（作用域感知版本）
   *
   * 此方法會：
   * 1. 使用完整的符號資訊（包含類型、作用域等）進行精確匹配
   * 2. 過濾掉註解和字串中的符號
   * 3. 包含完整的程式碼上下文
   *
   * @param filePath 檔案路徑
   * @param symbol 完整的符號資訊
   * @returns 符號引用陣列
   */
  async findReferencesInFileWithSymbol(filePath: string, symbol: Symbol): Promise<SymbolReference[]> {
    const content = await this.readFile(filePath);
    if (!content) {
      return [];
    }

    const parser = this.getParser(filePath);
    if (!parser) {
      // 降級到文字匹配（但會過濾字串和註解）
      return this.findReferencesByTextFiltered(filePath, content, symbol.name);
    }

    try {
      const ast = await parser.parse(content, filePath);

      // 使用完整符號資訊進行查找
      const references = await parser.findReferences(ast, symbol);
      const lines = content.split('\n');

      return references.map(ref => {
        const lineIndex = ref.location.range.start.line - 1;
        // 保留原始行內容（不 trim），讓 diff 輸出保持正確的縮排
        const context = lineIndex >= 0 && lineIndex < lines.length
          ? lines[lineIndex]
          : undefined;

        return {
          symbolName: symbol.name,
          location: ref.location,
          type: ref.type === 'definition'
            ? SymbolReferenceType.Definition
            : SymbolReferenceType.Usage,
          context
        };
      });
    } catch {
      // Parser 失敗，降級到文字匹配
      return this.findReferencesByTextFiltered(filePath, content, symbol.name);
    }
  }

  /**
   * 在多個檔案中查找符號引用（使用完整符號資訊）
   *
   * @param symbol 完整的符號資訊
   * @param projectFiles 專案檔案列表
   * @returns 所有找到的引用
   */
  async findReferencesWithSymbol(symbol: Symbol, projectFiles: readonly string[]): Promise<SymbolReference[]> {
    const allReferences: SymbolReference[] = [];

    for (const filePath of projectFiles) {
      const refs = await this.findReferencesInFileWithSymbol(filePath, symbol);
      allReferences.push(...refs);
    }

    return allReferences;
  }

  /**
   * 查找函式的所有呼叫點
   */
  async findCallSites(functionName: string, projectFiles: readonly string[]): Promise<CallSite[]> {
    const results: CallSite[] = [];

    for (const filePath of projectFiles) {
      const callSites = await this.findCallSitesInFile(filePath, functionName);
      results.push(...callSites);
    }

    return results;
  }

  /**
   * 查找檔案中的函式呼叫點
   * 排除註解和字串中的呼叫
   */
  async findCallSitesInFile(filePath: string, functionName: string): Promise<CallSite[]> {
    const content = await this.readFile(filePath);
    if (!content) {
      return [];
    }

    const parser = this.getParser(filePath);
    if (!parser) {
      return [];
    }

    try {
      // 驗證檔案可解析（確保語法正確）
      await parser.parse(content, filePath);

      // 查找所有函式呼叫
      const callSites: CallSite[] = [];
      const lines = content.split('\n');

      // 使用正則表達式查找呼叫點
      // 匹配 receiver.method() 形式，其中 receiver 可以是:
      // - 單一識別符：foo.get()
      // - this.property：this.sessions.get()
      // - 鏈式呼叫：obj.prop.method.get()
      const callPattern = new RegExp(
        `(?:((?:\\w+\\.)*\\w+)\\.)?${this.escapeRegex(functionName)}\\s*\\(`,
        'g'
      );

      // 函式定義的關鍵字模式（用於排除函式定義）
      const definitionKeywords = /(?:^|[\s{;])(async\s+)?(function\s+|static\s+|private\s+|public\s+|protected\s+|get\s+|set\s+)/;

      // 追蹤多行註解狀態
      let inBlockComment = false;

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];

        // 處理多行註解狀態
        if (inBlockComment) {
          const closeCommentIndex = line.indexOf('*/');
          if (closeCommentIndex >= 0) {
            inBlockComment = false;
            // 繼續處理 */ 後的內容（但這行後面的匹配會在下面的迴圈處理）
          } else {
            continue; // 整行在多行註解中，跳過
          }
        }

        // 檢查這行是否開始多行註解（在行尾未關閉）
        const openCommentIndex = line.indexOf('/*');
        if (openCommentIndex >= 0) {
          const closeCommentIndex = line.indexOf('*/', openCommentIndex + 2);
          if (closeCommentIndex < 0) {
            // 多行註解在這行開始但未結束
            inBlockComment = true;
          }
        }

        let match;

        while ((match = callPattern.exec(line)) !== null) {
          const receiver = match[1];
          const startColumn = match.index + 1;
          const matchPosition = match.index;

          // 排除註解中的呼叫
          if (this.isInComment(line, matchPosition, lines, lineIndex)) {
            continue;
          }

          // 排除字串中的呼叫
          if (this.isInString(line, matchPosition)) {
            continue;
          }

          // 排除函式定義：檢查前面是否有定義關鍵字
          const beforeMatch = line.substring(0, match.index);
          if (definitionKeywords.test(beforeMatch)) {
            continue;
          }

          // 排除方法定義：檢查是否在類別中定義方法（沒有 receiver 且後面有返回類型）
          if (!receiver) {
            // 找到對應的右括號（支援多行）
            const argsStart = match.index + match[0].length - 1;
            const multilineResult = this.findMatchingCloseParenMultiline(lines, lineIndex, argsStart);
            if (multilineResult.index >= 0) {
              // 檢查右括號後是否有冒號（表示返回類型，即方法定義）
              const closingLine = lines[multilineResult.line];
              const afterParen = closingLine.substring(multilineResult.index + 1).trim();
              if (afterParen.startsWith(':') || afterParen.startsWith('{')) {
                continue;
              }
            }
          }

          // 解析參數（支援多行）
          const argsStart = match.index + match[0].length - 1;
          const multilineArgs = this.extractArgumentsStringMultiline(lines, lineIndex, argsStart);
          const args = this.parseArgumentsMultiline(multilineArgs.content, lineIndex + 1, argsStart);

          callSites.push({
            functionName,
            location: {
              filePath,
              range: {
                start: { line: lineIndex + 1, column: startColumn, offset: undefined },
                end: { line: multilineArgs.endLine + 1, column: multilineArgs.endColumn + 1, offset: undefined }
              }
            },
            arguments: args,
            isMethodCall: !!receiver,
            receiver
          });
        }
      }

      return callSites;
    } catch {
      return [];
    }
  }

  /**
   * 檢查位置是否在註解中（支援單行和多行註解）
   */
  private isInComment(
    line: string,
    position: number,
    _lines: readonly string[],
    _lineIndex: number
  ): boolean {
    // 檢查單行註解（//）
    const singleLineCommentIndex = line.indexOf('//');
    if (singleLineCommentIndex >= 0 && singleLineCommentIndex < position) {
      // 確保 // 不在字串中
      if (!this.isInString(line, singleLineCommentIndex)) {
        return true;
      }
    }

    // 檢查多行註解（/* */）
    // 找到位置之前最近的 /* 和 */
    let searchStart = 0;
    while (searchStart < position) {
      const openIndex = line.indexOf('/*', searchStart);
      if (openIndex < 0 || openIndex >= position) {
        break;
      }

      // 確保 /* 不在字串中
      if (this.isInString(line, openIndex)) {
        searchStart = openIndex + 2;
        continue;
      }

      // 找對應的 */
      const closeIndex = line.indexOf('*/', openIndex + 2);
      if (closeIndex < 0 || closeIndex >= position) {
        // 位置在未關閉的多行註解中
        return true;
      }

      searchStart = closeIndex + 2;
    }

    return false;
  }

  /**
   * 查找類別成員
   */
  async findClassMembers(filePath: string, className: string): Promise<ClassMember[]> {
    const content = await this.readFile(filePath);
    if (!content) {
      return [];
    }

    const parser = this.getParser(filePath);
    if (!parser) {
      return [];
    }

    try {
      const ast = await parser.parse(content, filePath);
      const symbols = await parser.extractSymbols(ast);

      // 查找類別
      const classSymbol = symbols.find(s => s.name === className && s.type === 'class');
      if (!classSymbol) {
        return [];
      }

      // 查找類別成員
      return symbols
        .filter(s => {
          // 檢查是否在類別範圍內
          const classRange = classSymbol.location.range;
          const symbolRange = s.location.range;

          return s.location.filePath === filePath
            && symbolRange.start.line >= classRange.start.line
            && symbolRange.end.line <= classRange.end.line
            && s.name !== className;
        })
        .map(s => ({
          name: s.name,
          type: this.symbolTypeToMemberType(s.type),
          location: s.location,
          modifiers: [...s.modifiers],
          valueType: undefined
        }));
    } catch {
      return [];
    }
  }

  /**
   * 讀取檔案內容
   */
  private async readFile(filePath: string): Promise<string | null> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      return typeof content === 'string' ? content : content.toString('utf-8');
    } catch {
      return null;
    }
  }

  /**
   * 取得對應的 Parser
   */
  private getParser(filePath: string) {
    const extension = this.getFileExtension(filePath);
    return this.parserRegistry.getParser(extension);
  }

  /**
   * 取得檔案副檔名
   */
  private getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot >= 0 ? filePath.substring(lastDot) : '';
  }

  /**
   * 使用文字匹配查找引用（降級方法）
   */
  private findReferencesByText(filePath: string, content: string, symbolName: string): SymbolReference[] {
    const references: SymbolReference[] = [];
    const lines = content.split('\n');
    const regex = new RegExp(`\\b${this.escapeRegex(symbolName)}\\b`, 'g');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      let match;

      while ((match = regex.exec(line)) !== null) {
        const startColumn = match.index + 1;

        references.push({
          symbolName,
          location: {
            filePath,
            range: {
              start: { line: lineIndex + 1, column: startColumn, offset: undefined },
              end: { line: lineIndex + 1, column: startColumn + symbolName.length, offset: undefined }
            }
          },
          type: SymbolReferenceType.Usage,
          // 保留原始行內容（不 trim），讓 diff 輸出保持正確的縮排
          context: line
        });
      }
    }

    return references;
  }

  /**
   * 使用文字匹配查找引用（過濾字串和註解版本）
   *
   * 此方法會過濾掉：
   * 1. 字串字面值中的符號（單引號、雙引號、模板字串）
   * 2. 單行註解中的符號（// 和 #）
   * 3. 多行註解中的符號
   */
  private findReferencesByTextFiltered(filePath: string, content: string, symbolName: string): SymbolReference[] {
    const references: SymbolReference[] = [];
    const lines = content.split('\n');
    const regex = new RegExp(`\\b${this.escapeRegex(symbolName)}\\b`, 'g');
    let inBlockComment = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      let match;

      // 追蹤多行註解狀態
      if (inBlockComment) {
        const closeCommentIndex = line.indexOf('*/');
        if (closeCommentIndex >= 0) {
          inBlockComment = false;
        } else {
          continue; // 整行在多行註解中，跳過
        }
      }

      while ((match = regex.exec(line)) !== null) {
        const position = match.index;

        // 檢查是否在字串中
        if (this.isInString(line, position)) {
          continue;
        }

        // 檢查是否在單行註解中
        if (this.isInSingleLineComment(line, position)) {
          continue;
        }

        // 檢查是否在多行註解開始後
        const openCommentIndex = line.lastIndexOf('/*', position);
        if (openCommentIndex >= 0) {
          const closeCommentIndex = line.indexOf('*/', openCommentIndex);
          if (closeCommentIndex < 0 || closeCommentIndex > position) {
            // 在未關閉的多行註解中
            if (closeCommentIndex < 0) {
              inBlockComment = true;
            }
            continue;
          }
        }

        const startColumn = position + 1;

        references.push({
          symbolName,
          location: {
            filePath,
            range: {
              start: { line: lineIndex + 1, column: startColumn, offset: undefined },
              end: { line: lineIndex + 1, column: startColumn + symbolName.length, offset: undefined }
            }
          },
          type: SymbolReferenceType.Usage,
          // 保留原始行內容（不 trim），讓 diff 輸出保持正確的縮排
          context: line
        });
      }
    }

    return references;
  }

  /**
   * 檢查位置是否在字串字面值中
   */
  private isInString(line: string, position: number): boolean {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplate = false;

    for (let i = 0; i < position; i++) {
      const char = line[i];
      const prevChar = i > 0 ? line[i - 1] : '';

      // 跳過轉義字元
      if (prevChar === '\\') {
        continue;
      }

      if (char === '\'' && !inDoubleQuote && !inTemplate) {
        inSingleQuote = !inSingleQuote;
      } else if (char === '"' && !inSingleQuote && !inTemplate) {
        inDoubleQuote = !inDoubleQuote;
      } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
        inTemplate = !inTemplate;
      }
    }

    return inSingleQuote || inDoubleQuote || inTemplate;
  }

  /**
   * 檢查位置是否在單行註解中
   */
  private isInSingleLineComment(line: string, position: number): boolean {
    const beforePosition = line.substring(0, position);

    // TypeScript/JavaScript 單行註解
    if (beforePosition.includes('//')) {
      return true;
    }

    // Python/Shell 單行註解
    if (beforePosition.includes('#')) {
      // 排除 # 在字串中的情況
      const hashIndex = beforePosition.indexOf('#');
      if (!this.isInString(line, hashIndex)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 提取函式簽名
   */
  private extractSignature(content: string, symbol: Symbol): string | undefined {
    const lines = content.split('\n');
    const line = lines[symbol.location.range.start.line - 1];
    return line?.trim();
  }

  /**
   * 提取文件註解
   */
  private extractDocumentation(content: string, symbol: Symbol): string | undefined {
    const lines = content.split('\n');
    const lineIndex = symbol.location.range.start.line - 2; // 前一行

    if (lineIndex < 0) {
      return undefined;
    }

    // 查找 JSDoc 或區塊註解
    const docLines: string[] = [];
    let i = lineIndex;

    while (i >= 0) {
      const line = lines[i].trim();

      if (line.endsWith('*/')) {
        // 找到註解結尾，開始收集
        docLines.unshift(line);
        i--;

        while (i >= 0 && !lines[i].trim().startsWith('/**') && !lines[i].trim().startsWith('/*')) {
          docLines.unshift(lines[i].trim());
          i--;
        }

        if (i >= 0) {
          docLines.unshift(lines[i].trim());
        }
        break;
      } else if (line.startsWith('//')) {
        // 單行註解
        docLines.unshift(line.substring(2).trim());
        i--;
      } else if (line === '') {
        i--;
      } else {
        break;
      }
    }

    return docLines.length > 0 ? docLines.join('\n') : undefined;
  }

  /**
   * 提取參數字串（單行版本，保留向後相容）
   */
  private extractArgumentsString(line: string, startIndex: number): string {
    let depth = 1;
    let i = startIndex + 1;
    let result = '';

    while (i < line.length && depth > 0) {
      const char = line[i];

      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
      }

      if (depth > 0) {
        result += char;
      }
      i++;
    }

    return result;
  }

  /**
   * 提取參數字串（支援多行）
   * @returns { content: 完整參數字串, endLine: 結束行索引, endColumn: 結束欄位 }
   */
  private extractArgumentsStringMultiline(
    lines: readonly string[],
    startLine: number,
    startIndex: number
  ): { content: string; endLine: number; endColumn: number } {
    let depth = 1;
    let lineIndex = startLine;
    let charIndex = startIndex + 1;
    let result = '';

    while (lineIndex < lines.length && depth > 0) {
      const line = lines[lineIndex];

      while (charIndex < line.length && depth > 0) {
        const char = line[charIndex];

        if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
        }

        if (depth > 0) {
          result += char;
        }
        charIndex++;
      }

      if (depth > 0 && lineIndex < lines.length - 1) {
        // 保留換行符號
        result += '\n';
        lineIndex++;
        charIndex = 0;
      } else {
        break;
      }
    }

    return {
      content: result,
      endLine: lineIndex,
      endColumn: charIndex - 1
    };
  }

  /**
   * 解析參數（支援多行）
   */
  private parseArgumentsMultiline(argsString: string, baseLine: number, baseColumn: number): CallSiteArgument[] {
    if (!argsString.trim()) {
      return [];
    }

    const args: CallSiteArgument[] = [];
    const parts = this.splitArguments(argsString);

    let currentLine = baseLine;
    let column = baseColumn + 1;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const trimmed = part.trim();

      // 計算參數中的換行數
      const newlines = (part.match(/\n/g) || []).length;

      // 檢查是否是具名參數
      const namedMatch = trimmed.match(/^(\w+)\s*[:=]\s*(.+)$/s);

      args.push({
        index: i,
        name: namedMatch ? namedMatch[1] : undefined,
        value: namedMatch ? namedMatch[2].trim() : trimmed,
        range: {
          start: { line: currentLine, column, offset: undefined },
          end: { line: currentLine + newlines, column: column + part.length, offset: undefined }
        }
      });

      // 更新行號和欄位
      if (newlines > 0) {
        currentLine += newlines;
        // 計算最後一行的欄位位置
        const lastNewlineIndex = part.lastIndexOf('\n');
        column = part.length - lastNewlineIndex;
      } else {
        column += part.length + 1; // +1 for comma
      }
    }

    return args;
  }

  /**
   * 找到匹配的右括號位置（單行版本，保留向後相容）
   */
  private findMatchingCloseParen(line: string, openParenIndex: number): number {
    let depth = 1;
    let i = openParenIndex + 1;

    while (i < line.length && depth > 0) {
      const char = line[i];
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
      i++;
    }

    return -1;
  }

  /**
   * 找到匹配的右括號位置（支援多行）
   * @returns { line: 行索引, index: 該行的字元索引 }
   */
  private findMatchingCloseParenMultiline(
    lines: readonly string[],
    startLine: number,
    openParenIndex: number
  ): { line: number; index: number } {
    let depth = 1;
    let lineIndex = startLine;
    let charIndex = openParenIndex + 1;

    while (lineIndex < lines.length && depth > 0) {
      const line = lines[lineIndex];

      while (charIndex < line.length && depth > 0) {
        const char = line[charIndex];
        if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
          if (depth === 0) {
            return { line: lineIndex, index: charIndex };
          }
        }
        charIndex++;
      }

      lineIndex++;
      charIndex = 0;
    }

    return { line: -1, index: -1 };
  }

  /**
   * 解析參數
   */
  private parseArguments(argsString: string, line: number, baseColumn: number): CallSiteArgument[] {
    if (!argsString.trim()) {
      return [];
    }

    const args: CallSiteArgument[] = [];
    const parts = this.splitArguments(argsString);

    let column = baseColumn + 1;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const trimmed = part.trim();

      // 檢查是否是具名參數
      const namedMatch = trimmed.match(/^(\w+)\s*[:=]\s*(.+)$/);

      args.push({
        index: i,
        name: namedMatch ? namedMatch[1] : undefined,
        value: namedMatch ? namedMatch[2] : trimmed,
        range: {
          start: { line, column, offset: undefined },
          end: { line, column: column + part.length, offset: undefined }
        }
      });

      column += part.length + 1; // +1 for comma
    }

    return args;
  }

  /**
   * 分割參數（考慮巢狀括號）
   */
  private splitArguments(argsString: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;

    for (const char of argsString) {
      if (char === '(' || char === '[' || char === '{') {
        depth++;
        current += char;
      } else if (char === ')' || char === ']' || char === '}') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      result.push(current);
    }

    return result;
  }

  /**
   * 符號類型轉換為成員類型
   */
  private symbolTypeToMemberType(type: SymbolType): ClassMemberType {
    switch (type) {
      case 'function':
        return ClassMemberType.Method;
      case 'variable':
      case 'property':
        return ClassMemberType.Property;
      default:
        return ClassMemberType.Property;
    }
  }

  /**
   * 跳脫正則表達式特殊字元
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * 建立 SymbolFinder 實例
 */
export function createSymbolFinder(parserRegistry: ParserRegistry, fileSystem: IFileSystem): SymbolFinder {
  return new SymbolFinder(parserRegistry, fileSystem);
}
