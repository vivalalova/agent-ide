/**
 * 搜尋服務主要實作
 * 注意：文字搜尋已移除，請使用 IndexEngine 進行符號和結構化搜尋
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

import type { IFileSystem } from '@infrastructure/storage/index.js';

/**
 * 搜尋服務
 * 注意：文字搜尋功能已移除，請使用 CLI 的 grep 或 IndexEngine 進行搜尋
 */
export class SearchService {
  private searchHistory: string[] = [];
  private queryFrequency = new Map<string, number>();
  private searchStats: Partial<SearchStats> = {
    totalSearches: 0,
    averageSearchTime: 0,
    recentSearches: []
  };

  constructor(_fileSystem: IFileSystem) {
    // 文字搜尋已移除
  }

  // ===== 核心搜尋方法 =====

  /**
   * 通用搜尋方法 - 已棄用
   * @deprecated 請使用 IndexEngine 進行符號搜尋
   */
  async search(_query: { pattern: string; type: string; paths?: string[]; options?: any }): Promise<SearchResult> {
    throw new Error('文字搜尋已移除，請使用 grep 或 IndexEngine 進行符號搜尋');
  }

  /**
   * 執行文字搜尋 - 已棄用
   * @deprecated 請使用 grep
   */
  async searchText(_query: TextQuery): Promise<SearchResult> {
    throw new Error('文字搜尋已移除，請使用 grep');
  }

  /**
   * 執行符號搜尋
   * TODO: 整合 IndexEngine
   */
  async searchSymbols(_query: SymbolQuery): Promise<SymbolSearchResult> {
    throw new Error('請使用 IndexEngine 進行符號搜尋');
  }

  /**
   * 執行結構化模式搜尋
   * TODO: 實作 AST 模式匹配
   */
  async searchByPattern(_query: PatternQuery): Promise<PatternSearchResult> {
    throw new Error('請使用 IndexEngine 進行結構化搜尋');
  }

  /**
   * 執行語義搜尋
   * TODO: 實作語義分析
   */
  async searchSemantic(_query: string, _context?: SearchContext): Promise<SemanticSearchResult> {
    throw new Error('語義搜尋尚未實作');
  }

  /**
   * 批次搜尋 - 已棄用
   */
  async batchSearch(_queries: SearchQuery[]): Promise<BatchSearchResult> {
    throw new Error('批次搜尋已移除');
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
      cacheHitRate: 0,
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
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + substitutionCost
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

    const commonPatterns = [
      'function ',
      'class ',
      'interface ',
      'import ',
      'export ',
      'const ',
      'let ',
      'async '
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

    if (context.currentSymbol) {
      suggestions.push({
        text: context.currentSymbol.name,
        type: 'context',
        score: 0.9,
        description: '當前符號'
      });
    }

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
    return Array.from(this.queryFrequency.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  // ===== 便捷方法 - 已棄用 =====

  /**
   * @deprecated 請使用 grep
   */
  async quickTextSearch(_query: string, _options?: Partial<SearchOptions>): Promise<SearchResult> {
    throw new Error('文字搜尋已移除，請使用 grep');
  }

  /**
   * @deprecated 請使用 grep
   */
  async searchInDirectory(_query: string, _directory: string, _recursive?: boolean): Promise<SearchResult> {
    throw new Error('文字搜尋已移除，請使用 grep');
  }

  /**
   * @deprecated 請使用 grep
   */
  async regexSearch(_pattern: string, _options?: Partial<SearchOptions>): Promise<SearchResult> {
    throw new Error('文字搜尋已移除，請使用 grep');
  }
}
