/**
 * 統一的符號查找器
 * 整合 AST 分析和文字匹配，提供跨檔案符號查找能力
 */

import { SymbolType, type Symbol } from '@shared/types/symbol.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import {
  SymbolReferenceType,
  ClassMemberType,
  type SymbolReference,
  type CallSite,
  type ClassMember,
  type SymbolDefinition
} from './types.js';
import { TextMatcher } from './text-matcher.js';
import { CallSiteFinder } from './call-site-finder.js';

/**
 * 符號查找器
 */
export class SymbolFinder {
  private readonly textMatcher: TextMatcher;
  private readonly callSiteFinder: CallSiteFinder;

  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem
  ) {
    this.textMatcher = new TextMatcher();
    this.callSiteFinder = new CallSiteFinder(parserRegistry, fileSystem);
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
   * 時間複雜度：O(M x N)，M=檔案數，N=符號數
   * 優化點：M 次檔案讀取/解析（一次遍歷 M 檔查找 N 符號），
   * 而非 NxM 次（N 符號各遍歷 M 檔）
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
        this.textMatcher.findReferencesMultipleByText(filePath, content, symbolNames, results);
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
        this.textMatcher.findReferencesMultipleByText(filePath, content, symbolNames, results);
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
  async findReferencesWithSymbol(
    symbol: Symbol,
    projectFiles: readonly string[]
  ): Promise<SymbolReference[]> {
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
    return this.callSiteFinder.findCallSites(functionName, projectFiles);
  }

  /**
   * 查找檔案中的函式呼叫點
   * 排除註解和字串中的呼叫
   */
  async findCallSitesInFile(filePath: string, functionName: string): Promise<CallSite[]> {
    return this.callSiteFinder.findCallSitesInFile(filePath, functionName);
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
export function createSymbolFinder(
  parserRegistry: ParserRegistry,
  fileSystem: IFileSystem
): SymbolFinder {
  return new SymbolFinder(parserRegistry, fileSystem);
}
