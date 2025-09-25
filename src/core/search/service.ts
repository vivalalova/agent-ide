/**
 * 搜尋服務主要實作
 * 統一管理各種搜尋引擎和搜尋邏輯
 */

import type {
  SearchQuery,
  TextQuery,
  SymbolQuery,
  PatternQuery,
  SearchResult,
  SymbolSearchResult,
  PatternSearchResult,
  SemanticSearchResult,
  BatchSearchResult,
  SearchSuggestion,
  SearchContext,
  SearchStats,
  SearchOptions
} from './types.js';

import { TextSearchEngine } from './engines/text-engine.js';

/**
 * 搜尋服務
 * 提供統一的搜尋介面，整合各種搜尋引擎
 */
export class SearchService {
  private textEngine: TextSearchEngine;
  private searchHistory: string[] = [];
  private queryFrequency = new Map<string, number>();
  private searchStats: Partial<SearchStats> = {
    totalSearches: 0,
    averageSearchTime: 0,
    recentSearches: []
  };

  constructor() {
    this.textEngine = new TextSearchEngine();
  }

  // ===== 核心搜尋方法 =====

  /**
   * 執行文字搜尋
   */
  async searchText(query: TextQuery): Promise<SearchResult> {
    const startTime = Date.now();
    this.incrementSearchCount();

    try {
      const result = await this.textEngine.search(query);

      // 更新搜尋歷史
      this.updateSearchHistory(query.query);

      // 更新統計 - 優先使用引擎返回的時間
      const searchTime = result.searchTime || (Date.now() - startTime);
      this.updateStats(searchTime);

      return result;
    } catch (error) {
      throw new Error(`文字搜尋失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 執行符號搜尋
   * TODO: 整合 SymbolIndex
   */
  async searchSymbols(query: SymbolQuery): Promise<SymbolSearchResult> {
    throw new Error('符號搜尋尚未實作');
  }

  /**
   * 執行結構化模式搜尋
   * TODO: 實作 AST 模式匹配
   */
  async searchByPattern(query: PatternQuery): Promise<PatternSearchResult> {
    throw new Error('模式搜尋尚未實作');
  }

  /**
   * 執行語義搜尋
   * TODO: 實作語義分析
   */
  async searchSemantic(query: string, context?: SearchContext): Promise<SemanticSearchResult> {
    throw new Error('語義搜尋尚未實作');
  }

  /**
   * 批次搜尋
   */
  async batchSearch(queries: SearchQuery[]): Promise<BatchSearchResult> {
    const startTime = Date.now();
    const results: SearchResult[] = [];
    let allSucceeded = true;

    for (const query of queries) {
      try {
        let result: SearchResult;
        
        switch (query.type) {
          case 'text':
            result = await this.searchText(query as TextQuery);
            break;
          case 'symbol':
            result = await this.searchSymbols(query as SymbolQuery);
            break;
          case 'pattern':
            result = await this.searchByPattern(query as PatternQuery);
            break;
          default:
            throw new Error(`不支援的搜尋類型: ${query.type}`);
        }
        
        results.push(result);
      } catch (error) {
        console.error(`批次搜尋失敗:`, error);
        allSucceeded = false;
        
        // 添加錯誤結果
        results.push({
          matches: [],
          totalCount: 0,
          searchTime: 0,
          truncated: false
        });
      }
    }

    return {
      results,
      totalTime: Date.now() - startTime,
      allSucceeded
    };
  }

  // ===== 輔助搜尋功能 =====

  /**
   * 獲取搜尋建議
   */
  async getSuggestions(partial: string, context?: SearchContext): Promise<SearchSuggestion[]> {
    const suggestions: SearchSuggestion[] = [];

    // 1. 從搜尋歷史中獲取建議
    const historySuggestions = this.searchHistory
      .filter(query => query.toLowerCase().includes(partial.toLowerCase()))
      .map(query => ({
        text: query,
        type: 'history' as const,
        score: this.calculateSimilarity(partial, query),
        description: '搜尋歷史'
      }));

    suggestions.push(...historySuggestions);

    // 2. 基本完成建議
    if (partial.length > 0) {
      const completions = this.generateCompletions(partial);
      suggestions.push(...completions);
    }

    // 3. 上下文建議
    if (context) {
      const contextSuggestions = await this.generateContextSuggestions(partial, context);
      suggestions.push(...contextSuggestions);
    }

    // 排序和限制數量
    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  /**
   * 獲取搜尋統計
   */
  getSearchStats(): SearchStats {
    return {
      totalSearches: this.searchStats.totalSearches || 0,
      averageSearchTime: this.searchStats.averageSearchTime || 0,
      cacheHitRate: 0, // TODO: 實作快取
      topQueries: this.getTopQueries(),
      recentSearches: this.searchStats.recentSearches || []
    };
  }

  /**
   * 清除搜尋歷史
   */
  clearSearchHistory(): void {
    this.searchHistory = [];
    this.queryFrequency.clear();
    this.searchStats.recentSearches = [];
  }

  // ===== 私有輔助方法 =====

  /**
   * 更新搜尋歷史
   */
  private updateSearchHistory(query: string): void {
    // 更新頻率統計
    this.queryFrequency.set(query, (this.queryFrequency.get(query) || 0) + 1);

    // 避免重複
    const index = this.searchHistory.indexOf(query);
    if (index > -1) {
      this.searchHistory.splice(index, 1);
    }

    // 添加到開頭
    this.searchHistory.unshift(query);

    // 限制歷史長度
    if (this.searchHistory.length > 100) {
      this.searchHistory.pop();
      // 清理不再在歷史中的查詢頻率
      const historySet = new Set(this.searchHistory);
      for (const [q] of this.queryFrequency) {
        if (!historySet.has(q)) {
          this.queryFrequency.delete(q);
        }
      }
    }

    // 更新最近搜尋
    if (!this.searchStats.recentSearches) {
      this.searchStats.recentSearches = [];
    }

    // 避免重複 - 先移除現有的相同查詢
    const existingIndex = this.searchStats.recentSearches.findIndex(s => s.query === query);
    if (existingIndex > -1) {
      this.searchStats.recentSearches.splice(existingIndex, 1);
    }

    this.searchStats.recentSearches.unshift({
      query,
      timestamp: new Date()
    });

    // 限制最近搜尋數量
    if (this.searchStats.recentSearches.length > 50) {
      this.searchStats.recentSearches.pop();
    }
  }

  /**
   * 增加搜尋計數
   */
  private incrementSearchCount(): void {
    this.searchStats.totalSearches = (this.searchStats.totalSearches || 0) + 1;
  }

  /**
   * 更新統計資訊
   */
  private updateStats(searchTime: number): void {
    const currentAvg = this.searchStats.averageSearchTime || 0;
    const totalSearches = this.searchStats.totalSearches || 1;
    
    this.searchStats.averageSearchTime = 
      (currentAvg * (totalSearches - 1) + searchTime) / totalSearches;
  }

  /**
   * 計算字串相似度
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) {
      return 1.0;
    }

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * 計算編輯距離
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() =>
      Array(str1.length + 1).fill(null)
    );

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * 生成完成建議
   */
  private generateCompletions(partial: string): SearchSuggestion[] {
    const suggestions: SearchSuggestion[] = [];

    // 常見搜尋模式
    const commonPatterns = [
      'function ',
      'class ',
      'interface ',
      'import ',
      'export ',
      'const ',
      'let ',
      'var ',
      'async ',
      'await ',
      'return ',
      'throw ',
      'try ',
      'catch '
    ];

    for (const pattern of commonPatterns) {
      if (pattern.startsWith(partial.toLowerCase())) {
        suggestions.push({
          text: pattern.trim(),
          type: 'completion',
          score: 0.8,
          description: '常用模式'
        });
      }
    }

    return suggestions;
  }

  /**
   * 生成上下文建議
   */
  private async generateContextSuggestions(
    partial: string,
    context: SearchContext
  ): Promise<SearchSuggestion[]> {
    const suggestions: SearchSuggestion[] = [];

    // 如果有當前符號，建議相關搜尋
    if (context.currentSymbol) {
      suggestions.push({
        text: context.currentSymbol.name,
        type: 'context',
        score: 0.9,
        description: '當前符號'
      });
    }

    // 如果有當前檔案，建議檔案相關搜尋
    if (context.currentFile) {
      const fileName = context.currentFile.split('/').pop()?.replace(/\.\w+$/, '');
      if (fileName && fileName.includes(partial)) {
        suggestions.push({
          text: fileName,
          type: 'context',
          score: 0.85,
          description: '當前檔案'
        });
      }
    }

    return suggestions;
  }

  /**
   * 獲取熱門搜尋
   */
  private getTopQueries(): Array<{ query: string; count: number }> {
    // 使用頻率統計並排序返回前 10 個
    return Array.from(this.queryFrequency.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  // ===== 便捷方法 =====

  /**
   * 快速文字搜尋
   */
  async quickTextSearch(
    query: string,
    options?: Partial<SearchOptions>
  ): Promise<SearchResult> {
    const textQuery: TextQuery = {
      type: 'text',
      query,
      options: {
        scope: { type: 'project' },
        maxResults: 100,
        showContext: true,
        contextLines: 2,
        ...options
      }
    };

    return this.searchText(textQuery);
  }

  /**
   * 在指定目錄中搜尋
   */
  async searchInDirectory(
    query: string,
    directory: string,
    recursive = true
  ): Promise<SearchResult> {
    return this.quickTextSearch(query, {
      scope: {
        type: 'directory',
        path: directory,
        recursive
      }
    });
  }

  /**
   * 正則表達式搜尋
   */
  async regexSearch(
    pattern: string,
    options?: Partial<SearchOptions>
  ): Promise<SearchResult> {
    const textQuery: TextQuery = {
      type: 'text',
      query: pattern,
      options: {
        scope: { type: 'project' },
        maxResults: 100,
        regex: true,
        caseSensitive: false,
        ...options
      }
    };

    return this.searchText(textQuery);
  }
}