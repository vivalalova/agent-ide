import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchService } from '@core/search/service';
import type { TextQuery, SymbolQuery, PatternQuery, SearchContext, CodePattern } from '@core/search/types';
import { TextSearchEngine } from '@core/search/engines/text-engine';

// Mock TextSearchEngine
vi.mock('@core/search/engines/text-engine', () => {
  return {
    TextSearchEngine: class MockTextSearchEngine {
      search = vi.fn().mockResolvedValue({
        matches: [],
        totalCount: 0,
        searchTime: 10,
        truncated: false
      });
    }
  };
});

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(() => {
    service = new SearchService();
    vi.clearAllMocks();
  });

  describe('基本搜尋功能', () => {
    it('應該能夠執行通用搜尋', async () => {
      const result = await service.search({
        pattern: 'test',
        type: 'text',
        paths: ['/test/path'],
        options: {}
      });

      expect(result).toBeDefined();
      expect(result.matches).toBeDefined();
      expect(result.totalCount).toBeDefined();
      expect(result.searchTime).toBeDefined();
    });

    it('應該能夠執行文字搜尋', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' }
        }
      };

      const result = await service.searchText(query);

      expect(result).toBeDefined();
      expect(result.matches).toBeDefined();
    });

    it('應該在文字搜尋失敗時拋出錯誤', async () => {
      // 創建新的 service 實例，讓 mock 生效
      const newService = new SearchService();

      // 取得 mock 的 textEngine 並讓它拋出錯誤
      // @ts-ignore - 訪問私有屬性進行測試
      const mockEngine = newService.textEngine;
      mockEngine.search.mockRejectedValueOnce(new Error('Search failed'));

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' }
        }
      };

      await expect(newService.searchText(query)).rejects.toThrow('文字搜尋失敗');
    });
  });

  describe('符號搜尋', () => {
    it('應該拋出未實作錯誤', async () => {
      const query: SymbolQuery = {
        type: 'symbol',
        query: 'MyClass',
        name: 'MyClass'
      };

      await expect(service.searchSymbols(query)).rejects.toThrow('符號搜尋尚未實作');
    });
  });

  describe('模式搜尋', () => {
    it('應該拋出未實作錯誤', async () => {
      const pattern: CodePattern = {
        type: 'regex',
        pattern: 'test.*'
      };

      const query: PatternQuery = {
        type: 'pattern',
        query: 'test',
        pattern
      };

      await expect(service.searchByPattern(query)).rejects.toThrow('模式搜尋尚未實作');
    });
  });

  describe('語義搜尋', () => {
    it('應該拋出未實作錯誤', async () => {
      await expect(service.searchSemantic('test query')).rejects.toThrow('語義搜尋尚未實作');
    });
  });

  describe('批次搜尋', () => {
    it('應該能夠執行批次搜尋', async () => {
      const queries = [
        { type: 'text' as const, query: 'test1', options: { scope: { type: 'project' as const } } },
        { type: 'text' as const, query: 'test2', options: { scope: { type: 'project' as const } } }
      ];

      const result = await service.batchSearch(queries);

      expect(result).toBeDefined();
      expect(result.results).toHaveLength(2);
      expect(result.totalTime).toBeGreaterThanOrEqual(0);
      expect(result.allSucceeded).toBe(true);
    });

    it('應該在部分搜尋失敗時繼續執行', async () => {
      const queries = [
        { type: 'text' as const, query: 'test1', options: { scope: { type: 'project' as const } } },
        { type: 'symbol' as const, query: 'MyClass', options: { scope: { type: 'project' as const } } }, // 會失敗
        { type: 'text' as const, query: 'test3', options: { scope: { type: 'project' as const } } }
      ];

      const result = await service.batchSearch(queries);

      expect(result.results).toHaveLength(3);
      expect(result.allSucceeded).toBe(false);
    });

    it('應該在遇到不支援的搜尋類型時處理錯誤', async () => {
      const queries = [
        { type: 'invalid' as any, query: 'test', options: { scope: { type: 'project' as const } } }
      ];

      const result = await service.batchSearch(queries);

      expect(result.results).toHaveLength(1);
      expect(result.allSucceeded).toBe(false);
    });
  });

  describe('搜尋建議', () => {
    it('應該返回搜尋建議', async () => {
      const suggestions = await service.getSuggestions('te');

      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('應該從搜尋歷史中獲取建議', async () => {
      // 先執行一些搜尋以建立歷史
      await service.searchText({
        type: 'text',
        query: 'test',
        options: { scope: { type: 'project' } }
      });
      await service.searchText({
        type: 'text',
        query: 'testing',
        options: { scope: { type: 'project' } }
      });

      const suggestions = await service.getSuggestions('test');

      expect(suggestions.length).toBeGreaterThan(0);
      const historySuggestions = suggestions.filter(s => s.type === 'history');
      expect(historySuggestions.length).toBeGreaterThan(0);
    });

    it('應該生成完成建議', async () => {
      const suggestions = await service.getSuggestions('func');

      expect(suggestions.length).toBeGreaterThan(0);
      const completionSuggestions = suggestions.filter(s => s.type === 'completion');
      expect(completionSuggestions.length).toBeGreaterThan(0);
    });

    it('應該生成上下文建議', async () => {
      const context: SearchContext = {
        currentFile: '/test/myfile.ts',
        currentSymbol: {
          name: 'MyClass',
          kind: 'class',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 10, column: 1, offset: 100 }
          },
          location: {
            file: '/test/myfile.ts',
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 10, column: 1, offset: 100 }
            }
          }
        }
      };

      const suggestions = await service.getSuggestions('My', context);

      expect(suggestions.length).toBeGreaterThan(0);
      const contextSuggestions = suggestions.filter(s => s.type === 'context');
      expect(contextSuggestions.length).toBeGreaterThan(0);
    });

    it('應該限制建議數量為 10', async () => {
      // 建立大量搜尋歷史
      for (let i = 0; i < 20; i++) {
        await service.searchText({
          type: 'text',
          query: `test${i}`,
          options: { scope: { type: 'project' } }
        });
      }

      const suggestions = await service.getSuggestions('test');

      expect(suggestions.length).toBeLessThanOrEqual(10);
    });

    it('應該按分數排序建議', async () => {
      const suggestions = await service.getSuggestions('test');

      for (let i = 0; i < suggestions.length - 1; i++) {
        expect(suggestions[i].score).toBeGreaterThanOrEqual(suggestions[i + 1].score);
      }
    });
  });

  describe('搜尋統計', () => {
    it('應該返回搜尋統計', () => {
      const stats = service.getSearchStats();

      expect(stats).toBeDefined();
      expect(stats.totalSearches).toBeDefined();
      expect(stats.averageSearchTime).toBeDefined();
      expect(stats.cacheHitRate).toBeDefined();
      expect(stats.topQueries).toBeDefined();
      expect(stats.recentSearches).toBeDefined();
    });

    it('應該追蹤總搜尋次數', async () => {
      const initialStats = service.getSearchStats();
      const initialCount = initialStats.totalSearches;

      await service.searchText({
        type: 'text',
        query: 'test',
        options: { scope: { type: 'project' } }
      });

      const updatedStats = service.getSearchStats();
      expect(updatedStats.totalSearches).toBe(initialCount + 1);
    });

    it('應該追蹤平均搜尋時間', async () => {
      await service.searchText({
        type: 'text',
        query: 'test1',
        options: { scope: { type: 'project' } }
      });
      await service.searchText({
        type: 'text',
        query: 'test2',
        options: { scope: { type: 'project' } }
      });

      const stats = service.getSearchStats();
      expect(stats.averageSearchTime).toBeGreaterThanOrEqual(0);
    });

    it('應該追蹤熱門查詢', async () => {
      await service.searchText({
        type: 'text',
        query: 'popular',
        options: { scope: { type: 'project' } }
      });
      await service.searchText({
        type: 'text',
        query: 'popular',
        options: { scope: { type: 'project' } }
      });
      await service.searchText({
        type: 'text',
        query: 'popular',
        options: { scope: { type: 'project' } }
      });

      const stats = service.getSearchStats();
      expect(stats.topQueries.length).toBeGreaterThan(0);
      expect(stats.topQueries[0].query).toBe('popular');
      expect(stats.topQueries[0].count).toBe(3);
    });

    it('應該追蹤最近搜尋', async () => {
      await service.searchText({
        type: 'text',
        query: 'recent1',
        options: { scope: { type: 'project' } }
      });
      await service.searchText({
        type: 'text',
        query: 'recent2',
        options: { scope: { type: 'project' } }
      });

      const stats = service.getSearchStats();
      expect(stats.recentSearches.length).toBeGreaterThan(0);
      expect(stats.recentSearches[0].query).toBe('recent2');
      expect(stats.recentSearches[1].query).toBe('recent1');
    });

    it('應該限制熱門查詢數量為 10', async () => {
      for (let i = 0; i < 20; i++) {
        await service.searchText({
          type: 'text',
          query: `query${i}`,
          options: { scope: { type: 'project' } }
        });
      }

      const stats = service.getSearchStats();
      expect(stats.topQueries.length).toBeLessThanOrEqual(10);
    });
  });

  describe('搜尋歷史', () => {
    it('應該能夠清除搜尋歷史', async () => {
      await service.searchText({
        type: 'text',
        query: 'test',
        options: { scope: { type: 'project' } }
      });

      service.clearSearchHistory();

      const stats = service.getSearchStats();
      expect(stats.recentSearches).toHaveLength(0);
      expect(stats.topQueries).toHaveLength(0);
    });

    it('應該避免歷史中的重複項', async () => {
      await service.searchText({
        type: 'text',
        query: 'duplicate',
        options: { scope: { type: 'project' } }
      });
      await service.searchText({
        type: 'text',
        query: 'duplicate',
        options: { scope: { type: 'project' } }
      });
      await service.searchText({
        type: 'text',
        query: 'duplicate',
        options: { scope: { type: 'project' } }
      });

      const stats = service.getSearchStats();
      const duplicateSearches = stats.recentSearches.filter(s => s.query === 'duplicate');
      expect(duplicateSearches).toHaveLength(1);
    });

    it('應該將最近的搜尋移到開頭', async () => {
      await service.searchText({
        type: 'text',
        query: 'first',
        options: { scope: { type: 'project' } }
      });
      await service.searchText({
        type: 'text',
        query: 'second',
        options: { scope: { type: 'project' } }
      });
      await service.searchText({
        type: 'text',
        query: 'first',
        options: { scope: { type: 'project' } }
      });

      const stats = service.getSearchStats();
      expect(stats.recentSearches[0].query).toBe('first');
    });

    it('應該限制搜尋歷史長度為 100', async () => {
      for (let i = 0; i < 150; i++) {
        await service.searchText({
          type: 'text',
          query: `query${i}`,
          options: { scope: { type: 'project' } }
        });
      }

      const suggestions = await service.getSuggestions('query');
      const historySuggestions = suggestions.filter(s => s.type === 'history');
      expect(historySuggestions.length).toBeLessThanOrEqual(100);
    });

    it('應該限制最近搜尋數量為 50', async () => {
      for (let i = 0; i < 100; i++) {
        await service.searchText({
          type: 'text',
          query: `query${i}`,
          options: { scope: { type: 'project' } }
        });
      }

      const stats = service.getSearchStats();
      expect(stats.recentSearches.length).toBeLessThanOrEqual(50);
    });
  });

  describe('便捷方法', () => {
    it('應該支援快速文字搜尋', async () => {
      const result = await service.quickTextSearch('test');

      expect(result).toBeDefined();
      expect(result.matches).toBeDefined();
    });

    it('應該支援在指定目錄中搜尋', async () => {
      const result = await service.searchInDirectory('test', '/test/dir', true);

      expect(result).toBeDefined();
      expect(result.matches).toBeDefined();
    });

    it('應該支援正則表達式搜尋', async () => {
      const result = await service.regexSearch('test\\d+');

      expect(result).toBeDefined();
      expect(result.matches).toBeDefined();
    });

    it('應該在快速搜尋中使用預設選項', async () => {
      const result = await service.quickTextSearch('test');

      expect(result).toBeDefined();
    });

    it('應該允許覆蓋快速搜尋的選項', async () => {
      const result = await service.quickTextSearch('test', {
        maxResults: 10,
        caseSensitive: true
      });

      expect(result).toBeDefined();
    });
  });

  describe('相似度計算', () => {
    it('應該計算字串相似度', async () => {
      // 透過搜尋建議間接測試相似度計算
      await service.searchText({
        type: 'text',
        query: 'testing',
        options: { scope: { type: 'project' } }
      });

      const suggestions = await service.getSuggestions('test');
      const historySuggestions = suggestions.filter(s => s.type === 'history');

      expect(historySuggestions.length).toBeGreaterThan(0);
      expect(historySuggestions[0].score).toBeGreaterThan(0);
      expect(historySuggestions[0].score).toBeLessThanOrEqual(1);
    });
  });

  describe('統計更新', () => {
    it('應該在每次搜尋時增加計數', async () => {
      const initialStats = service.getSearchStats();
      const initialCount = initialStats.totalSearches;

      await service.searchText({
        type: 'text',
        query: 'test',
        options: { scope: { type: 'project' } }
      });
      await service.searchText({
        type: 'text',
        query: 'test2',
        options: { scope: { type: 'project' } }
      });

      const updatedStats = service.getSearchStats();
      expect(updatedStats.totalSearches).toBe(initialCount + 2);
    });

    it('應該正確計算平均搜尋時間', async () => {
      // 創建新的 service 實例
      const newService = new SearchService();

      // @ts-ignore - 訪問私有屬性進行測試
      const mockEngine = newService.textEngine;
      mockEngine.search
        .mockResolvedValueOnce({
          matches: [],
          totalCount: 0,
          searchTime: 10,
          truncated: false
        })
        .mockResolvedValueOnce({
          matches: [],
          totalCount: 0,
          searchTime: 20,
          truncated: false
        });

      await newService.searchText({
        type: 'text',
        query: 'test1',
        options: { scope: { type: 'project' } }
      });
      await newService.searchText({
        type: 'text',
        query: 'test2',
        options: { scope: { type: 'project' } }
      });

      const stats = newService.getSearchStats();
      expect(stats.averageSearchTime).toBeGreaterThan(0);
    });
  });

  describe('邊界情況', () => {
    it('應該處理空查詢', async () => {
      const result = await service.searchText({
        type: 'text',
        query: '',
        options: { scope: { type: 'project' } }
      });

      expect(result).toBeDefined();
    });

    it('應該處理空部分查詢的建議', async () => {
      const suggestions = await service.getSuggestions('');

      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('應該在沒有搜尋歷史時返回空統計', () => {
      const stats = service.getSearchStats();

      expect(stats.totalSearches).toBe(0);
      expect(stats.averageSearchTime).toBe(0);
      expect(stats.topQueries).toHaveLength(0);
      expect(stats.recentSearches).toHaveLength(0);
    });

    it('應該處理 undefined 的上下文', async () => {
      const suggestions = await service.getSuggestions('test', undefined);

      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('應該處理空的上下文物件', async () => {
      const context: SearchContext = {};

      const suggestions = await service.getSuggestions('test', context);

      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });

  describe('查詢頻率追蹤', () => {
    it('應該追蹤查詢頻率', async () => {
      await service.searchText({
        type: 'text',
        query: 'frequent',
        options: { scope: { type: 'project' } }
      });
      await service.searchText({
        type: 'text',
        query: 'frequent',
        options: { scope: { type: 'project' } }
      });
      await service.searchText({
        type: 'text',
        query: 'rare',
        options: { scope: { type: 'project' } }
      });

      const stats = service.getSearchStats();
      const frequentQuery = stats.topQueries.find(q => q.query === 'frequent');
      const rareQuery = stats.topQueries.find(q => q.query === 'rare');

      expect(frequentQuery).toBeDefined();
      expect(frequentQuery?.count).toBe(2);
      expect(rareQuery).toBeDefined();
      expect(rareQuery?.count).toBe(1);
    });

    it('應該在清除歷史時清除頻率統計', async () => {
      await service.searchText({
        type: 'text',
        query: 'test',
        options: { scope: { type: 'project' } }
      });

      service.clearSearchHistory();

      const stats = service.getSearchStats();
      expect(stats.topQueries).toHaveLength(0);
    });
  });

  describe('時間戳記錄', () => {
    it('應該為最近搜尋記錄時間戳', async () => {
      await service.searchText({
        type: 'text',
        query: 'test',
        options: { scope: { type: 'project' } }
      });

      const stats = service.getSearchStats();
      expect(stats.recentSearches[0].timestamp).toBeInstanceOf(Date);
    });
  });
});
