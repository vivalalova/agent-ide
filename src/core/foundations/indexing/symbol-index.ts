/**
 * 符號索引實作
 * 管理程式碼符號的索引和查詢功能
 */

import type { Symbol, Scope, SymbolType } from '@shared/types/index.js';
import type {
  FileInfo,
  FileIndexEntry,
  SymbolIndexEntry,
  SymbolSearchResult,
  SearchOptions
} from './types.js';

/**
 * 符號統計資訊
 */
export interface SymbolStats {
  readonly totalSymbols: number;
  readonly symbolsByType: ReadonlyMap<SymbolType, number>;
  readonly symbolsByFile: ReadonlyMap<string, number>;
  readonly lastUpdated: Date;
}

/**
 * 符號索引類別
 * 負責管理程式碼符號的索引和高效查詢
 */
export class SymbolIndex {
  // 主索引：符號名稱 -> 符號項目列表
  private readonly symbolsByName = new Map<string, SymbolIndexEntry[]>();

  // 類型索引：符號類型 -> 符號項目列表
  private readonly symbolsByType = new Map<SymbolType, SymbolIndexEntry[]>();

  // 檔案索引：檔案路徑 -> 符號項目列表
  private readonly symbolsByFile = new Map<string, SymbolIndexEntry[]>();

  // 作用域索引：作用域 -> 符號項目列表
  private readonly symbolsByScope = new Map<string, SymbolIndexEntry[]>();

  // 檔案層級反向索引：filePath -> 該檔案符號涉及的 SymbolType / 作用域 key 集合。
  // 讓 removeFileSymbols/removeFromOtherIndexes 只需走該檔案實際涉及的少數 key，
  // 不必對 symbolsByType/symbolsByScope 做全專案 key 全表掃描。
  // 集合只會隨 addToIndex 增長，移除時允許保留 stale key（superset，安全）：
  // removeFileSymbols/removeFromOtherIndexes 內部都會先檢查 fileInfo.filePath 才動作，
  // 多掃到一個已無該檔案項目的 key 只是空跑一次迴圈，不影響正確性。
  private readonly fileTypeKeys = new Map<string, Set<SymbolType>>();
  private readonly fileScopeKeys = new Map<string, Set<string>>();

  // 檔案內符號去重鍵集合：filePath -> Set<symbolEntryKey>，讓 addToIndex 的重複偵測
  // 從 O(n) 陣列掃描降為 O(1) Set 查詢；key 涵蓋 isSameSymbolEntry 比較的全部欄位
  // （filePath 已由 map 的第一層 key 保證相同，不需重複放進 key 本身）
  private readonly fileEntryKeys = new Map<string, Set<string>>();

  private lastUpdated = new Date();

  /**
   * 新增符號到索引
   */
  async addSymbol(symbol: Symbol, fileInfo: FileInfo): Promise<void> {
    const entry: SymbolIndexEntry = {
      symbol,
      fileInfo,
      dependencies: []
    };

    this.addToIndex(entry);
    this.lastUpdated = new Date();
  }

  /**
   * 批次新增符號到索引
   */
  async addSymbols(symbols: readonly Symbol[], fileInfo: FileInfo): Promise<void> {
    for (const symbol of symbols) {
      const entry: SymbolIndexEntry = {
        symbol,
        fileInfo,
        dependencies: []
      };
      this.addToIndex(entry);
    }
    this.lastUpdated = new Date();
  }

  /**
   * 移除符號從索引
   */
  async removeSymbol(symbolName: string, filePath: string): Promise<void> {
    // 從名稱索引中移除
    const nameEntries = this.symbolsByName.get(symbolName);
    if (nameEntries) {
      const filtered = nameEntries.filter(entry =>
        entry.fileInfo.filePath !== filePath ||
        entry.symbol.name !== symbolName
      );

      if (filtered.length === 0) {
        this.symbolsByName.delete(symbolName);
      } else {
        this.symbolsByName.set(symbolName, filtered);
      }
    }

    // 從其他索引中移除
    this.removeFromOtherIndexes(symbolName, filePath);
    this.lastUpdated = new Date();
  }

  /**
   * 移除檔案的所有符號
   * 直接批次清理各索引，避免逐一呼叫 removeSymbol 的 N+1 問題
   */
  async removeFileSymbols(filePath: string): Promise<void> {
    const fileEntries = this.symbolsByFile.get(filePath);
    if (!fileEntries) {
      return;
    }

    // 收集該檔案所有符號名稱，用於批次移除
    const symbolNames = new Set(fileEntries.map(entry => entry.symbol.name));

    // 從名稱索引中批次移除
    for (const symbolName of symbolNames) {
      const nameEntries = this.symbolsByName.get(symbolName);
      if (nameEntries) {
        const filtered = nameEntries.filter(entry =>
          entry.fileInfo.filePath !== filePath
        );
        if (filtered.length === 0) {
          this.symbolsByName.delete(symbolName);
        } else {
          this.symbolsByName.set(symbolName, filtered);
        }
      }
    }

    // 從類型索引中批次移除：只走該檔案實際涉及過的類型 key（反向索引），
    // 不必遍歷 symbolsByType 全部 key
    const typeKeys = this.fileTypeKeys.get(filePath);
    if (typeKeys) {
      for (const type of typeKeys) {
        const entries = this.symbolsByType.get(type);
        if (!entries) {
          continue;
        }
        for (let i = entries.length - 1; i >= 0; i--) {
          if (entries[i].fileInfo.filePath === filePath) {
            entries.splice(i, 1);
          }
        }
        if (entries.length === 0) {
          this.symbolsByType.delete(type);
        }
      }
      this.fileTypeKeys.delete(filePath);
    }

    // 從作用域索引中批次移除：同樣只走該檔案涉及過的作用域 key
    const scopeKeys = this.fileScopeKeys.get(filePath);
    if (scopeKeys) {
      for (const scopeKey of scopeKeys) {
        const entries = this.symbolsByScope.get(scopeKey);
        if (!entries) {
          continue;
        }
        for (let i = entries.length - 1; i >= 0; i--) {
          if (entries[i].fileInfo.filePath === filePath) {
            entries.splice(i, 1);
          }
        }
        if (entries.length === 0) {
          this.symbolsByScope.delete(scopeKey);
        }
      }
      this.fileScopeKeys.delete(filePath);
    }

    // 最後移除檔案索引與去重鍵集合
    this.symbolsByFile.delete(filePath);
    this.fileEntryKeys.delete(filePath);
    this.lastUpdated = new Date();
  }

  /**
   * 更新符號資訊
   */
  async updateSymbol(symbol: Symbol, fileInfo: FileInfo): Promise<void> {
    // 先移除舊的符號
    await this.removeSymbol(symbol.name, fileInfo.filePath);
    // 再新增新的符號
    await this.addSymbol(symbol, fileInfo);
  }

  /**
   * 檢查符號是否存在
   */
  hasSymbol(symbolName: string): boolean {
    return this.symbolsByName.has(symbolName);
  }

  /**
   * 根據確切名稱查找符號
   */
  async findSymbol(name: string, options?: SearchOptions): Promise<SymbolSearchResult[]> {
    const entries = this.symbolsByName.get(name) || [];
    return this.convertToSearchResults(entries, options);
  }

  /**
   * 根據符號類型查找
   */
  async findSymbolsByType(type: SymbolType, options?: SearchOptions): Promise<SymbolSearchResult[]> {
    const entries = this.symbolsByType.get(type) || [];
    return this.convertToSearchResults(entries, options);
  }

  /**
   * 模糊搜尋符號
   */
  async searchSymbols(pattern: string, options?: SearchOptions): Promise<SymbolSearchResult[]> {
    const results: SymbolSearchResult[] = [];
    const caseSensitive = options?.caseSensitive ?? false;
    const fuzzy = options?.fuzzy ?? true;
    const maxResults = options?.maxResults ?? 100;
    const symbolTypes = options?.symbolTypes;

    if (maxResults <= 0) {
      return results;
    }

    const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();

    for (const [name, entries] of this.symbolsByName) {
      const targetName = caseSensitive ? name : name.toLowerCase();

      let matches = false;
      let score = 0;

      if (fuzzy) {
        const fuzzyResult = this.fuzzyMatch(searchPattern, targetName);
        if (fuzzyResult.matches) {
          matches = true;
          score = fuzzyResult.score;
        }
      } else {
        if (targetName.includes(searchPattern)) {
          matches = true;
          score = this.calculateExactScore(searchPattern, targetName);
        }
      }

      if (matches) {
        for (const entry of entries) {
          if (symbolTypes && !symbolTypes.includes(entry.symbol.type)) {
            continue;
          }

          results.push({
            symbol: entry.symbol,
            fileInfo: entry.fileInfo,
            score
          });
        }
      }
    }

    // 根據分數排序後再截斷結果
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  /**
   * 獲取所有符號
   */
  async getAllSymbols(): Promise<SymbolSearchResult[]> {
    const results: SymbolSearchResult[] = [];

    // 遍歷所有符號項目
    for (const entries of this.symbolsByName.values()) {
      for (const entry of entries) {
        results.push({
          symbol: entry.symbol,
          fileInfo: entry.fileInfo,
          score: 1.0
        });
      }
    }

    return results;
  }

  /**
   * 取得檔案的所有符號
   */
  async getFileSymbols(filePath: string): Promise<readonly Symbol[]> {
    const entries = this.symbolsByFile.get(filePath) || [];
    return entries.map(entry => entry.symbol);
  }

  /**
   * 根據作用域查找符號
   */
  async findSymbolsInScope(scope: Scope): Promise<readonly Symbol[]> {
    const scopeKey = this.getScopeKey(scope);
    const entries = this.symbolsByScope.get(scopeKey) || [];
    return entries.map(entry => entry.symbol);
  }

  /**
   * 取得符號總數
   */
  getTotalSymbols(): number {
    let total = 0;
    for (const entries of this.symbolsByName.values()) {
      total += entries.length;
    }
    return total;
  }

  /**
   * 取得統計資訊
   */
  getStats(): SymbolStats {
    const symbolsByType = new Map<SymbolType, number>();
    const symbolsByFile = new Map<string, number>();
    let totalSymbols = 0;

    for (const entries of this.symbolsByName.values()) {
      for (const entry of entries) {
        totalSymbols++;

        // 統計類型
        const typeCount = symbolsByType.get(entry.symbol.type) || 0;
        symbolsByType.set(entry.symbol.type, typeCount + 1);

        // 統計檔案
        const fileCount = symbolsByFile.get(entry.fileInfo.filePath) || 0;
        symbolsByFile.set(entry.fileInfo.filePath, fileCount + 1);
      }
    }

    return {
      totalSymbols,
      symbolsByType,
      symbolsByFile,
      lastUpdated: this.lastUpdated
    };
  }

  /**
   * 清空所有符號
   */
  async clear(): Promise<void> {
    this.symbolsByName.clear();
    this.symbolsByType.clear();
    this.symbolsByFile.clear();
    this.symbolsByScope.clear();
    this.fileTypeKeys.clear();
    this.fileScopeKeys.clear();
    this.fileEntryKeys.clear();
    this.lastUpdated = new Date();
  }

  /**
   * 從 FileIndexEntry map 水合符號索引（用於快取載入）
   * O(n) 重建，不需重新 parse 檔案
   */
  hydrateFromFileEntries(fileEntries: Map<string, FileIndexEntry>): void {
    this.symbolsByName.clear();
    this.symbolsByType.clear();
    this.symbolsByFile.clear();
    this.symbolsByScope.clear();
    this.fileTypeKeys.clear();
    this.fileScopeKeys.clear();
    this.fileEntryKeys.clear();

    for (const entry of fileEntries.values()) {
      if (!entry.isIndexed) {
        continue;
      }
      for (const symbol of entry.symbols) {
        const indexEntry: SymbolIndexEntry = {
          symbol,
          fileInfo: entry.fileInfo,
          dependencies: []
        };
        this.addToIndex(indexEntry);
      }
    }

    this.lastUpdated = new Date();
  }

  /**
   * 新增符號項目到各個索引
   */
  private addToIndex(entry: SymbolIndexEntry): void {
    const { symbol, fileInfo } = entry;

    const fileEntries = this.symbolsByFile.get(fileInfo.filePath) || [];
    let entryKeys = this.fileEntryKeys.get(fileInfo.filePath);
    if (!entryKeys) {
      entryKeys = new Set();
      this.fileEntryKeys.set(fileInfo.filePath, entryKeys);
    }

    // O(1) 去重（取代原本 fileEntries.some(isSameSymbolEntry) 的 O(n) 陣列掃描）；
    // key 涵蓋 isSameSymbolEntry 比較的全部欄位（filePath 已由 map 第一層 key 保證相同）
    const entryKey = this.symbolEntryKey(entry);
    if (entryKeys.has(entryKey)) {
      return;
    }
    entryKeys.add(entryKey);

    // 名稱索引
    const nameEntries = this.symbolsByName.get(symbol.name) || [];
    nameEntries.push(entry);
    this.symbolsByName.set(symbol.name, nameEntries);

    // 類型索引
    const typeEntries = this.symbolsByType.get(symbol.type) || [];
    typeEntries.push(entry);
    this.symbolsByType.set(symbol.type, typeEntries);
    this.addToFileKeySet(this.fileTypeKeys, fileInfo.filePath, symbol.type);

    // 檔案索引
    fileEntries.push(entry);
    this.symbolsByFile.set(fileInfo.filePath, fileEntries);

    // 作用域索引
    if (symbol.scope) {
      const scopeKey = this.getScopeKey(symbol.scope);
      const scopeEntries = this.symbolsByScope.get(scopeKey) || [];
      scopeEntries.push(entry);
      this.symbolsByScope.set(scopeKey, scopeEntries);
      this.addToFileKeySet(this.fileScopeKeys, fileInfo.filePath, scopeKey);
    }
  }

  /** 將 key 加入 filePath 對應的集合（不存在則建立），供 fileTypeKeys/fileScopeKeys 共用 */
  private addToFileKeySet<K>(map: Map<string, Set<K>>, filePath: string, key: K): void {
    let set = map.get(filePath);
    if (!set) {
      set = new Set<K>();
      map.set(filePath, set);
    }
    set.add(key);
  }

  /**
   * 符號項目去重鍵：涵蓋 isSameSymbolEntry 比較的全部欄位（除 filePath，已由外層
   * fileEntryKeys/symbolsByFile 的 map key 保證相同），任一欄位變動即為不同符號
   */
  private symbolEntryKey(entry: SymbolIndexEntry): string {
    const range = entry.symbol.location.range;
    return [
      entry.symbol.name,
      entry.symbol.type,
      range.start.line,
      range.start.column,
      range.end.line,
      range.end.column
    ].join(' ');
  }

  /**
   * 從其他索引中移除符號
   * 使用反向 splice，確保同檔案內同名符號的所有 entry 都會被移除。
   */
  private removeFromOtherIndexes(symbolName: string, filePath: string): void {
    // 從類型索引中移除：只走該檔案涉及過的類型 key（反向索引），不遍歷全部類型
    const typeKeys = this.fileTypeKeys.get(filePath);
    if (typeKeys) {
      for (const type of typeKeys) {
        const entries = this.symbolsByType.get(type);
        if (!entries) {
          continue;
        }
        for (let i = entries.length - 1; i >= 0; i--) {
          if (entries[i].fileInfo.filePath === filePath && entries[i].symbol.name === symbolName) {
            entries.splice(i, 1);
          }
        }
        if (entries.length === 0) {
          this.symbolsByType.delete(type);
        }
      }
    }

    // 從檔案索引中移除，同步清掉對應的去重鍵
    const fileEntries = this.symbolsByFile.get(filePath);
    if (fileEntries) {
      const entryKeys = this.fileEntryKeys.get(filePath);
      for (let i = fileEntries.length - 1; i >= 0; i--) {
        if (fileEntries[i].symbol.name === symbolName) {
          entryKeys?.delete(this.symbolEntryKey(fileEntries[i]));
          fileEntries.splice(i, 1);
        }
      }
      if (fileEntries.length === 0) {
        this.symbolsByFile.delete(filePath);
        this.fileEntryKeys.delete(filePath);
      }
    }

    // 從作用域索引中移除：只走該檔案涉及過的作用域 key
    const scopeKeys = this.fileScopeKeys.get(filePath);
    if (scopeKeys) {
      for (const scopeKey of scopeKeys) {
        const entries = this.symbolsByScope.get(scopeKey);
        if (!entries) {
          continue;
        }
        for (let i = entries.length - 1; i >= 0; i--) {
          if (entries[i].fileInfo.filePath === filePath && entries[i].symbol.name === symbolName) {
            entries.splice(i, 1);
          }
        }
        if (entries.length === 0) {
          this.symbolsByScope.delete(scopeKey);
        }
      }
    }
  }

  /**
   * 轉換索引項目為搜尋結果
   */
  private convertToSearchResults(entries: SymbolIndexEntry[], options?: SearchOptions): SymbolSearchResult[] {
    const maxResults = options?.maxResults ?? 100;
    const symbolTypes = options?.symbolTypes;
    const results: SymbolSearchResult[] = [];

    for (const entry of entries) {
      if (results.length >= maxResults) {
        break;
      }

      if (symbolTypes && !symbolTypes.includes(entry.symbol.type)) {
        continue;
      }

      results.push({
        symbol: entry.symbol,
        fileInfo: entry.fileInfo,
        score: 1.0 // 完全匹配的分數
      });
    }

    return results;
  }

  /**
   * 模糊匹配演算法
   */
  private fuzzyMatch(pattern: string, target: string): { matches: boolean; score: number } {
    if (pattern === '') {
      return { matches: true, score: 0.1 };
    }

    if (target === '') {
      return { matches: false, score: 0 };
    }

    // 簡化的模糊匹配實現
    let patternIndex = 0;
    let targetIndex = 0;
    let matches = 0;

    while (patternIndex < pattern.length && targetIndex < target.length) {
      if (pattern[patternIndex] === target[targetIndex]) {
        matches++;
        patternIndex++;
      }
      targetIndex++;
    }

    const matchesAll = patternIndex === pattern.length;
    const finalScore = matchesAll ? matches / Math.max(pattern.length, target.length) : 0;

    return {
      matches: matchesAll,
      score: finalScore
    };
  }

  /**
   * 計算精確匹配的分數
   */
  private calculateExactScore(pattern: string, target: string): number {
    if (target === pattern) {
      return 1.0; // 完全匹配
    }

    if (target.startsWith(pattern)) {
      return 0.8; // 前綴匹配
    }

    if (target.includes(pattern)) {
      return 0.6; // 包含匹配
    }

    return 0.1; // 其他情況
  }

  /**
   * 生成作用域索引鍵
   */
  private getScopeKey(scope: Scope): string {
    const path: string[] = [];
    let current: Scope | undefined = scope;

    while (current) {
      path.unshift(`${current.type}:${current.name || 'anonymous'}`);
      current = current.parent;
    }

    return path.join('/');
  }
}
