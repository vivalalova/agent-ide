/**
 * 符號索引實作
 * 管理程式碼符號的索引和查詢功能
 */
import type { Symbol, Scope, SymbolType } from '../../shared/types/index.js';
import type { FileInfo, SymbolSearchResult, SearchOptions } from './types.js';
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
export declare class SymbolIndex {
    private readonly symbolsByName;
    private readonly symbolsByType;
    private readonly symbolsByFile;
    private readonly symbolsByScope;
    private lastUpdated;
    /**
     * 新增符號到索引
     */
    addSymbol(symbol: Symbol, fileInfo: FileInfo): Promise<void>;
    /**
     * 批次新增符號到索引
     */
    addSymbols(symbols: readonly Symbol[], fileInfo: FileInfo): Promise<void>;
    /**
     * 移除符號從索引
     */
    removeSymbol(symbolName: string, filePath: string): Promise<void>;
    /**
     * 移除檔案的所有符號
     */
    removeFileSymbols(filePath: string): Promise<void>;
    /**
     * 更新符號資訊
     */
    updateSymbol(symbol: Symbol, fileInfo: FileInfo): Promise<void>;
    /**
     * 檢查符號是否存在
     */
    hasSymbol(symbolName: string): boolean;
    /**
     * 根據確切名稱查找符號
     */
    findSymbol(name: string, options?: SearchOptions): Promise<SymbolSearchResult[]>;
    /**
     * 根據符號類型查找
     */
    findSymbolsByType(type: SymbolType, options?: SearchOptions): Promise<SymbolSearchResult[]>;
    /**
     * 模糊搜尋符號
     */
    searchSymbols(pattern: string, options?: SearchOptions): Promise<SymbolSearchResult[]>;
    /**
     * 取得檔案的所有符號
     */
    getFileSymbols(filePath: string): Promise<readonly Symbol[]>;
    /**
     * 根據作用域查找符號
     */
    findSymbolsInScope(scope: Scope): Promise<readonly Symbol[]>;
    /**
     * 取得符號總數
     */
    getTotalSymbols(): number;
    /**
     * 取得統計資訊
     */
    getStats(): SymbolStats;
    /**
     * 清空所有符號
     */
    clear(): Promise<void>;
    /**
     * 新增符號項目到各個索引
     */
    private addToIndex;
    /**
     * 從其他索引中移除符號
     */
    private removeFromOtherIndexes;
    /**
     * 轉換索引項目為搜尋結果
     */
    private convertToSearchResults;
    /**
     * 模糊匹配演算法
     */
    private fuzzyMatch;
    /**
     * 計算精確匹配的分數
     */
    private calculateExactScore;
    /**
     * 生成作用域索引鍵
     */
    private getScopeKey;
}
//# sourceMappingURL=symbol-index.d.ts.map