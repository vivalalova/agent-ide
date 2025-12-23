/**
 * 統一的符號查找器
 * 整合 AST 分析和文字匹配，提供跨檔案符號查找能力
 */

import { SymbolType, type Symbol } from '@shared/types/symbol.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ScopedFindReferencesOptions } from '@infrastructure/parser/interface.js';
import { ScopedReferenceKind } from '@infrastructure/parser/interface.js';

import {
  SymbolReferenceType,
  ClassMemberType,
  type SymbolReference,
  type CallSite,
  type ClassMember,
  type SymbolDefinition,
  symbolToKey,
  serializeSymbolKey
} from './types.js';
import { TextMatcher } from './text-matcher.js';
import { CallSiteParser } from './call-site-parser.js';

/**
 * 符號查找器
 */
export class SymbolFinder {
  private readonly textMatcher: TextMatcher;
  private readonly callSiteParser: CallSiteParser;

  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem
  ) {
    this.textMatcher = new TextMatcher();
    this.callSiteParser = new CallSiteParser();
  }

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

      // 優先使用 Parser 的 getDocumentation 方法（AST 精確解析）
      // 若 Parser 不支援或返回 null，fallback 到行號回掃邏輯
      let documentation: string | undefined;
      if (parser.getDocumentation) {
        const doc = parser.getDocumentation(
          content,
          symbol.name,
          symbol.type,
          symbol.location.range.start.line
        );
        documentation = doc?.rawText;
      }
      if (!documentation) {
        documentation = this.extractDocumentationByLineScanning(content, symbol);
      }

      return {
        symbol,
        signature: this.extractSignature(content, symbol),
        documentation
      };
    } catch {
      return null;
    }
  }

  /**
   * 批次查找符號的引用（使用完整 Symbol 資訊，可區分同名符號）
   *
   * 時間複雜度：O(M x N)，M=檔案數，N=符號數
   * 優化點：M 次檔案讀取/解析（一次遍歷 M 檔查找 N 符號），
   * 而非 N x M 次（N 符號各遍歷 M 檔）
   *
   * @param symbols 要查找的符號陣列（包含完整的作用域資訊）
   * @param projectFiles 專案檔案列表
   * @returns Map<序列化的SymbolKey, 引用列表>，可使用 deserializeSymbolKey 還原
   *
   * @example
   * ```typescript
   * const results = await finder.findReferencesMultiple(symbols, files);
   * for (const symbol of symbols) {
   *   const key = serializeSymbolKey(symbolToKey(symbol));
   *   const refs = results.get(key) ?? [];
   * }
   * ```
   */
  async findReferencesMultiple(
    symbols: ReadonlyArray<Symbol>,
    projectFiles: readonly string[]
  ): Promise<Map<string, SymbolReference[]>> {
    const results = new Map<string, SymbolReference[]>();

    // 建立 symbolKey -> symbol 的對應，用於後續精確匹配
    const symbolKeyMap = new Map<string, Symbol>();
    for (const symbol of symbols) {
      const key = serializeSymbolKey(symbolToKey(symbol));
      results.set(key, []);
      symbolKeyMap.set(key, symbol);
    }

    // 同時建立 name -> symbols 的對應，用於快速過濾
    const symbolsByName = new Map<string, Symbol[]>();
    for (const symbol of symbols) {
      const existing = symbolsByName.get(symbol.name) || [];
      existing.push(symbol);
      symbolsByName.set(symbol.name, existing);
    }

    // 一次遍歷所有檔案
    for (const filePath of projectFiles) {
      const content = await this.readFile(filePath);
      if (!content) {
        continue;
      }

      const parser = this.getParser(filePath);
      const lines = content.split('\n');

      // 對每個目標符號查找引用
      for (const [key, symbol] of symbolKeyMap) {
        // 對於 class method，需要使用 class name 作為 containerName
        // symbol.scope 是 method 的 function scope，其 parent 是 class scope
        let containerName: string | undefined;
        if (symbol.scope?.type === 'function' && symbol.scope?.parent?.type === 'class') {
          containerName = symbol.scope.parent.name;
        } else {
          containerName = symbol.scope?.name;
        }

        // 優先使用 findScopedReferences（精確匹配作用域）
        if (parser && typeof parser.findScopedReferences === 'function') {
          const scopedRefs = parser.findScopedReferences(content, symbol.name, { className: containerName });

          if (scopedRefs) {
            const refs = results.get(key)!;
            for (const ref of scopedRefs) {
              const lineIndex = ref.location.range.start.line - 1;
              const context = lineIndex >= 0 && lineIndex < lines.length
                ? lines[lineIndex]
                : undefined;

              refs.push({
                symbolName: symbol.name,
                location: { filePath, range: ref.location.range },
                type: this.scopedReferenceKindToType(ref.kind),
                context,
                containerName: ref.containerName,
                isMethodCall: ref.kind === ScopedReferenceKind.Call
              });
            }
            continue;
          }
        }

        // Fallback：使用完整符號資訊查找
        if (parser) {
          try {
            const ast = await parser.parse(content, filePath);
            const references = await parser.findReferences(ast, symbol);

            const refs = results.get(key)!;
            for (const ref of references) {
              const lineIndex = ref.location.range.start.line - 1;
              const context = lineIndex >= 0 && lineIndex < lines.length
                ? lines[lineIndex]
                : undefined;

              refs.push({
                symbolName: symbol.name,
                location: ref.location,
                type: ref.type === 'definition'
                  ? SymbolReferenceType.Definition
                  : SymbolReferenceType.Usage,
                context
              });
            }
          } catch {
            // Parser 失敗，降級到文字匹配
            const textRefs = this.textMatcher.findReferencesByText(filePath, content, symbol.name);
            const refs = results.get(key)!;
            refs.push(...textRefs);
          }
        } else {
          // 無 Parser，使用文字匹配
          const textRefs = this.textMatcher.findReferencesByText(filePath, content, symbol.name);
          const refs = results.get(key)!;
          refs.push(...textRefs);
        }
      }
    }

    return results;
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
      return this.textMatcher.findReferencesByText(filePath, content, symbolName);
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
            start: { line: 1, column: 1 },
            end: { line: 1, column: 1 }
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
      return this.textMatcher.findReferencesByText(filePath, content, symbolName);
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
      return this.textMatcher.findReferencesByTextFiltered(filePath, content, symbol.name);
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
      return this.textMatcher.findReferencesByTextFiltered(filePath, content, symbol.name);
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

  // ===== 作用域感知的符號查找（優先使用 Parser 語義分析） =====

  /**
   * 使用 Parser 的 findScopedReferences 方法查找符號引用（作用域感知版本）
   *
   * 此方法優先使用 Parser 的語義分析能力來精確匹配符號，
   * 可以區分不同類別的同名方法。
   *
   * @example
   * ```typescript
   * // 區分 Dog.bark() 和 Car.bark()
   * const refs = await finder.findScopedReferencesInFile(
   *   'src/animals.ts',
   *   'bark',
   *   { className: 'Dog' }
   * );
   * ```
   *
   * @param filePath 檔案路徑
   * @param symbolName 符號名稱
   * @param options 作用域查找選項（可限定類別等）
   * @returns 符號引用陣列
   */
  async findScopedReferencesInFile(
    filePath: string,
    symbolName: string,
    options?: ScopedFindReferencesOptions
  ): Promise<SymbolReference[]> {
    const content = await this.readFile(filePath);
    if (!content) {
      return [];
    }

    const parser = this.getParser(filePath);

    // 優先使用 Parser 的 findScopedReferences 方法
    if (parser && typeof parser.findScopedReferences === 'function') {
      const scopedRefs = parser.findScopedReferences(content, symbolName, options);

      if (scopedRefs) {
        const lines = content.split('\n');

        return scopedRefs.map(ref => {
          const lineIndex = ref.location.range.start.line - 1;
          const context = lineIndex >= 0 && lineIndex < lines.length
            ? lines[lineIndex]
            : undefined;

          // 轉換 ScopedReferenceKind 到 SymbolReferenceType
          const type = this.scopedReferenceKindToType(ref.kind);

          return {
            symbolName,
            location: {
              filePath,
              range: ref.location.range
            },
            type,
            context,
            containerName: ref.containerName,
            isMethodCall: ref.kind === ScopedReferenceKind.Call
          };
        });
      }
    }

    // Fallback：使用原有的文字匹配（帶過濾）
    return this.textMatcher.findReferencesByTextFiltered(filePath, content, symbolName);
  }

  /**
   * 在多個檔案中查找符號引用（作用域感知版本）
   *
   * @param symbolName 符號名稱
   * @param projectFiles 專案檔案列表
   * @param options 作用域查找選項
   * @returns 所有找到的引用
   */
  async findScopedReferences(
    symbolName: string,
    projectFiles: readonly string[],
    options?: ScopedFindReferencesOptions
  ): Promise<SymbolReference[]> {
    const allReferences: SymbolReference[] = [];

    for (const filePath of projectFiles) {
      const refs = await this.findScopedReferencesInFile(filePath, symbolName, options);
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

      // 使用 CallSiteParser 查找呼叫點
      return this.callSiteParser.findCallSitesInFile(filePath, content, functionName);
    } catch {
      return [];
    }
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
   * 轉換 ScopedReferenceKind 到 SymbolReferenceType
   */
  private scopedReferenceKindToType(kind: ScopedReferenceKind): SymbolReferenceType {
    switch (kind) {
      case ScopedReferenceKind.Write:
        return SymbolReferenceType.Definition;
      case ScopedReferenceKind.Call:
      case ScopedReferenceKind.Read:
      default:
        return SymbolReferenceType.Usage;
    }
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
   * 提取文件註解（行號回掃方式）
   * 這是 fallback 方法，當 Parser 不支援 getDocumentation 時使用
   */
  private extractDocumentationByLineScanning(content: string, symbol: Symbol): string | undefined {
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
}

/**
 * 建立 SymbolFinder 實例
 */
export function createSymbolFinder(parserRegistry: ParserRegistry, fileSystem: IFileSystem): SymbolFinder {
  return new SymbolFinder(parserRegistry, fileSystem);
}
