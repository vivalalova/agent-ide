/**
 * 搜尋服務主要實作
 * 統一管理各種搜尋引擎和搜尋邏輯
 */
import type { SearchQuery, TextQuery, SymbolQuery, PatternQuery, SearchResult, SymbolSearchResult, PatternSearchResult, SemanticSearchResult, BatchSearchResult, SearchSuggestion, SearchContext, SearchStats, SearchOptions } from './types.js';
/**
 * 搜尋服務
 * 提供統一的搜尋介面，整合各種搜尋引擎
 */
export declare class SearchService {
    private textEngine;
    private searchHistory;
    private queryFrequency;
    private searchStats;
    constructor();
    /**
     * 通用搜尋方法 - 根據查詢類型分發到對應引擎
     */
    search(query: {
        pattern: string;
        type: string;
        paths?: string[];
        options?: any;
    }): Promise<SearchResult>;
    /**
     * 執行文字搜尋
     */
    searchText(query: TextQuery): Promise<SearchResult>;
    /**
     * 執行符號搜尋
     * TODO: 整合 SymbolIndex
     */
    searchSymbols(query: SymbolQuery): Promise<SymbolSearchResult>;
    /**
     * 執行結構化模式搜尋
     * TODO: 實作 AST 模式匹配
     */
    searchByPattern(query: PatternQuery): Promise<PatternSearchResult>;
    /**
     * 執行語義搜尋
     * TODO: 實作語義分析
     */
    searchSemantic(query: string, context?: SearchContext): Promise<SemanticSearchResult>;
    /**
     * 批次搜尋
     */
    batchSearch(queries: SearchQuery[]): Promise<BatchSearchResult>;
    /**
     * 獲取搜尋建議
     */
    getSuggestions(partial: string, context?: SearchContext): Promise<SearchSuggestion[]>;
    /**
     * 獲取搜尋統計
     */
    getSearchStats(): SearchStats;
    /**
     * 清除搜尋歷史
     */
    clearSearchHistory(): void;
    /**
     * 更新搜尋歷史
     */
    private updateSearchHistory;
    /**
     * 增加搜尋計數
     */
    private incrementSearchCount;
    /**
     * 更新統計資訊
     */
    private updateStats;
    /**
     * 計算字串相似度
     */
    private calculateSimilarity;
    /**
     * 計算編輯距離
     */
    private levenshteinDistance;
    /**
     * 生成完成建議
     */
    private generateCompletions;
    /**
     * 生成上下文建議
     */
    private generateContextSuggestions;
    /**
     * 獲取熱門搜尋
     */
    private getTopQueries;
    /**
     * 快速文字搜尋
     */
    quickTextSearch(query: string, options?: Partial<SearchOptions>): Promise<SearchResult>;
    /**
     * 在指定目錄中搜尋
     */
    searchInDirectory(query: string, directory: string, recursive?: boolean): Promise<SearchResult>;
    /**
     * 正則表達式搜尋
     */
    regexSearch(pattern: string, options?: Partial<SearchOptions>): Promise<SearchResult>;
}
//# sourceMappingURL=service.d.ts.map