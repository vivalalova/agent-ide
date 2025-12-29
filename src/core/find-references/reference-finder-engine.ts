/**
 * 符號引用查找引擎
 * 提供跨檔案符號引用查找的高階 API
 *
 * 注意：核心實作位於 @core/foundations/symbol-finder
 * 本引擎提供 CLI 介面的簡化包裝
 */

import type { Symbol } from '@shared/types/symbol.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ScopedFindReferencesOptions } from '@infrastructure/parser/interface.js';
import {
  SymbolFinder,
  createSymbolFinder,
  type SymbolReference,
  type CallSite,
  type ClassMember,
  type SymbolDefinition
} from '@core/foundations/symbol-finder/index.js';

/**
 * 符號引用查找引擎
 * 封裝 SymbolFinder 提供更簡潔的 API
 */
export class ReferenceFinderEngine {
  private readonly symbolFinder: SymbolFinder;

  constructor(
    parserRegistry: ParserRegistry,
    fileSystem: IFileSystem
  ) {
    this.symbolFinder = createSymbolFinder(parserRegistry, fileSystem);
  }

  /**
   * 查找符號定義
   * @param filePath 檔案路徑
   * @param symbolName 符號名稱
   * @returns 符號定義資訊
   */
  async findDefinition(filePath: string, symbolName: string): Promise<SymbolDefinition | null> {
    return this.symbolFinder.findDefinition(filePath, symbolName);
  }

  /**
   * 查找符號的所有引用
   * @param symbolName 符號名稱
   * @param projectFiles 專案檔案列表
   * @param options 作用域查找選項
   * @returns 符號引用陣列
   */
  async findReferences(
    symbolName: string,
    projectFiles: readonly string[],
    options?: ScopedFindReferencesOptions
  ): Promise<SymbolReference[]> {
    return this.symbolFinder.findScopedReferences(symbolName, projectFiles, options);
  }

  /**
   * 使用完整符號資訊查找引用
   * 可區分不同作用域的同名符號
   *
   * @param symbol 完整的符號資訊
   * @param projectFiles 專案檔案列表
   * @returns 符號引用陣列
   */
  async findReferencesWithSymbol(
    symbol: Symbol,
    projectFiles: readonly string[]
  ): Promise<SymbolReference[]> {
    return this.symbolFinder.findReferencesWithSymbol(symbol, projectFiles);
  }

  /**
   * 批次查找多個符號的引用
   * 優化效能：一次遍歷所有檔案查找多個符號
   *
   * @param symbols 要查找的符號陣列
   * @param projectFiles 專案檔案列表
   * @returns Map<序列化的SymbolKey, 引用列表>
   */
  async findReferencesMultiple(
    symbols: ReadonlyArray<Symbol>,
    projectFiles: readonly string[]
  ): Promise<Map<string, SymbolReference[]>> {
    return this.symbolFinder.findReferencesMultiple(symbols, projectFiles);
  }

  /**
   * 查找函式的所有呼叫點
   * @param functionName 函式名稱
   * @param projectFiles 專案檔案列表
   * @returns 呼叫點陣列
   */
  async findCallSites(
    functionName: string,
    projectFiles: readonly string[]
  ): Promise<CallSite[]> {
    return this.symbolFinder.findCallSites(functionName, projectFiles);
  }

  /**
   * 查找類別成員
   * @param filePath 檔案路徑
   * @param className 類別名稱
   * @returns 類別成員陣列
   */
  async findClassMembers(filePath: string, className: string): Promise<ClassMember[]> {
    return this.symbolFinder.findClassMembers(filePath, className);
  }
}

/**
 * 建立引用查找引擎實例
 * @param parserRegistry Parser 註冊表
 * @param fileSystem 檔案系統
 * @returns 引用查找引擎實例
 */
export function createReferenceFinderEngine(
  parserRegistry: ParserRegistry,
  fileSystem: IFileSystem
): ReferenceFinderEngine {
  return new ReferenceFinderEngine(parserRegistry, fileSystem);
}
