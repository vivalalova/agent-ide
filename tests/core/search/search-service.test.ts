/**
 * SearchService 測試
 * 測試搜尋服務的各項功能
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SearchService } from '../../../src/core/search/service.js';
import type { TextQuery, SearchResult, SearchContext } from '../../../src/core/search/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock filesystem for testing
vi.mock('fs/promises');
vi.mock('../../../src/core/search/engines/text-engine.js');

const mockFs = vi.mocked(fs);

describe('SearchService', () => {
  let searchService: SearchService;
  
  beforeEach(() => {
    searchService = new SearchService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('基本搜尋功能', () => {
    it('應該能建立 SearchService 實例', () => {
      expect(searchService).toBeInstanceOf(SearchService);
    });

    it('應該能執行簡單文字搜尋', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'test function',
        options: {
          scope: { type: 'project' },
          maxResults: 10
        }
      };

      // Mock TextSearchEngine 的搜尋結果
      const mockResult: SearchResult = {
        matches: [
          {
            filePath: '/test/file1.ts',
            content: 'test function example',
            lineNumber: 5,
            columnNumber: 1,
            context: {
              before: [],
              after: []
            }
          }
        ],
        totalCount: 1,
        searchTime: 50,
        truncated: false
      };

      // Mock the text engine
      const mockTextEngine = {
        search: vi.fn().mockResolvedValue(mockResult)
      };
      
      // Replace the internal text engine
      (searchService as any).textEngine = mockTextEngine;

      const result = await searchService.searchText(query);
      
      expect(result).toEqual(mockResult);
      expect(mockTextEngine.search).toHaveBeenCalledWith(query);
    });

    it('應該能處理空搜尋結果', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'nonexistent',
        options: {
          scope: { type: 'project' },
          maxResults: 10
        }
      };

      const mockResult: SearchResult = {
        matches: [],
        totalCount: 0,
        searchTime: 10,
        truncated: false
      };

      const mockTextEngine = {
        search: vi.fn().mockResolvedValue(mockResult)
      };
      
      (searchService as any).textEngine = mockTextEngine;

      const result = await searchService.searchText(query);
      
      expect(result.matches).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('應該能處理搜尋錯誤', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          maxResults: 10
        }
      };

      const mockTextEngine = {
        search: vi.fn().mockRejectedValue(new Error('搜尋引擎錯誤'))
      };
      
      (searchService as any).textEngine = mockTextEngine;

      await expect(searchService.searchText(query)).rejects.toThrow('文字搜尋失敗: 搜尋引擎錯誤');
    });
  });

  describe('搜尋歷史管理', () => {
    it('應該能更新搜尋歷史', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'test query',
        options: {
          scope: { type: 'project' },
          maxResults: 10
        }
      };

      const mockResult: SearchResult = {
        matches: [],
        totalCount: 0,
        searchTime: 10,
        truncated: false
      };

      const mockTextEngine = {
        search: vi.fn().mockResolvedValue(mockResult)
      };
      
      (searchService as any).textEngine = mockTextEngine;

      await searchService.searchText(query);
      
      const stats = searchService.getSearchStats();
      expect(stats.totalSearches).toBe(1);
      expect(stats.recentSearches).toHaveLength(1);
      expect(stats.recentSearches[0].query).toBe('test query');
    });

    it('應該避免重複的搜尋歷史', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'duplicate query',
        options: {
          scope: { type: 'project' },
          maxResults: 10
        }
      };

      const mockResult: SearchResult = {
        matches: [],
        totalCount: 0,
        searchTime: 10,
        truncated: false
      };

      const mockTextEngine = {
        search: vi.fn().mockResolvedValue(mockResult)
      };
      
      (searchService as any).textEngine = mockTextEngine;

      // 執行兩次相同搜尋
      await searchService.searchText(query);
      await searchService.searchText(query);
      
      const history = (searchService as any).searchHistory;
      expect(history.filter((q: string) => q === 'duplicate query')).toHaveLength(1);
    });

    it('應該能清除搜尋歷史', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          maxResults: 10
        }
      };

      const mockResult: SearchResult = {
        matches: [],
        totalCount: 0,
        searchTime: 10,
        truncated: false
      };

      const mockTextEngine = {
        search: vi.fn().mockResolvedValue(mockResult)
      };
      
      (searchService as any).textEngine = mockTextEngine;

      await searchService.searchText(query);
      
      expect(searchService.getSearchStats().totalSearches).toBe(1);
      
      searchService.clearSearchHistory();
      
      expect(searchService.getSearchStats().recentSearches).toHaveLength(0);
    });
  });

  describe('批次搜尋功能', () => {
    it('應該能執行批次搜尋', async () => {
      const queries = [
        {
          type: 'text' as const,
          query: 'function',
          options: { scope: { type: 'project' as const }, maxResults: 10 }
        },
        {
          type: 'text' as const,
          query: 'class',
          options: { scope: { type: 'project' as const }, maxResults: 10 }
        }
      ];

      const mockResult: SearchResult = {
        matches: [],
        totalCount: 0,
        searchTime: 10,
        truncated: false
      };

      const mockTextEngine = {
        search: vi.fn().mockResolvedValue(mockResult)
      };
      
      (searchService as any).textEngine = mockTextEngine;

      const result = await searchService.batchSearch(queries);
      
      expect(result.results).toHaveLength(2);
      expect(result.allSucceeded).toBe(true);
      expect(mockTextEngine.search).toHaveBeenCalledTimes(2);
    });

    it('應該能處理批次搜尋中的錯誤', async () => {
      const queries = [
        {
          type: 'text' as const,
          query: 'function',
          options: { scope: { type: 'project' as const }, maxResults: 10 }
        },
        {
          type: 'text' as const,
          query: 'class',
          options: { scope: { type: 'project' as const }, maxResults: 10 }
        }
      ];

      const mockTextEngine = {
        search: vi.fn()
          .mockResolvedValueOnce({
            matches: [],
            totalCount: 0,
            searchTime: 10,
            truncated: false
          })
          .mockRejectedValueOnce(new Error('搜尋失敗'))
      };
      
      (searchService as any).textEngine = mockTextEngine;

      const result = await searchService.batchSearch(queries);
      
      expect(result.results).toHaveLength(2);
      expect(result.allSucceeded).toBe(false);
      expect(result.results[1].totalCount).toBe(0); // 錯誤結果
    });

    it('應該拒絕不支援的搜尋類型', async () => {
      const queries = [
        {
          type: 'unsupported' as any,
          query: 'test',
          options: { scope: { type: 'project' as const }, maxResults: 10 }
        }
      ];

      const result = await searchService.batchSearch(queries);
      
      expect(result.allSucceeded).toBe(false);
    });
  });

  describe('搜尋建議功能', () => {
    it('應該能從搜尋歷史生成建議', async () => {
      // 先執行一些搜尋以建立歷史
      const query: TextQuery = {
        type: 'text',
        query: 'function test',
        options: {
          scope: { type: 'project' },
          maxResults: 10
        }
      };

      const mockResult: SearchResult = {
        matches: [],
        totalCount: 0,
        searchTime: 10,
        truncated: false
      };

      const mockTextEngine = {
        search: vi.fn().mockResolvedValue(mockResult)
      };
      
      (searchService as any).textEngine = mockTextEngine;

      await searchService.searchText(query);
      
      const suggestions = await searchService.getSuggestions('func');
      
      expect(suggestions.some(s => s.text === 'function test')).toBe(true);
      expect(suggestions.some(s => s.type === 'history')).toBe(true);
    });

    it('應該能生成完成建議', async () => {
      const suggestions = await searchService.getSuggestions('func');
      
      expect(suggestions.some(s => s.text === 'function')).toBe(true);
      expect(suggestions.some(s => s.type === 'completion')).toBe(true);
    });

    it('應該能根據上下文生成建議', async () => {
      const context: SearchContext = {
        currentFile: '/test/myComponent.ts',
        currentSymbol: {
          name: 'MyComponent',
          type: 'class' as any,
          position: { line: 1, column: 1 },
          scope: { type: 'global' },
          modifiers: []
        }
      };

      const suggestions = await searchService.getSuggestions('My', context);
      
      expect(suggestions.some(s => s.text === 'MyComponent')).toBe(true);
      expect(suggestions.some(s => s.type === 'context')).toBe(true);
    });

    it('應該限制建議數量', async () => {
      // 建立大量搜尋歷史
      const mockTextEngine = {
        search: vi.fn().mockResolvedValue({
          matches: [],
          totalCount: 0,
          searchTime: 10,
          truncated: false
        })
      };
      
      (searchService as any).textEngine = mockTextEngine;

      for (let i = 0; i < 20; i++) {
        await searchService.searchText({
          type: 'text',
          query: `test query ${i}`,
          options: { scope: { type: 'project' }, maxResults: 10 }
        });
      }
      
      const suggestions = await searchService.getSuggestions('test');
      
      expect(suggestions.length).toBeLessThanOrEqual(10);
    });
  });

  describe('統計功能', () => {
    it('應該能正確計算搜尋統計', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          maxResults: 10
        }
      };

      const mockTextEngine = {
        search: vi.fn().mockResolvedValue({
          matches: [],
          totalCount: 0,
          searchTime: 100,
          truncated: false
        })
      };
      
      (searchService as any).textEngine = mockTextEngine;

      // 執行多次搜尋
      await searchService.searchText(query);
      await searchService.searchText(query);
      
      const stats = searchService.getSearchStats();
      
      expect(stats.totalSearches).toBe(2);
      expect(stats.averageSearchTime).toBeGreaterThan(0);
      expect(stats.recentSearches).toHaveLength(1); // 去重後只有一個
    });

    it('應該能獲取熱門搜尋', async () => {
      const mockTextEngine = {
        search: vi.fn().mockResolvedValue({
          matches: [],
          totalCount: 0,
          searchTime: 10,
          truncated: false
        })
      };
      
      (searchService as any).textEngine = mockTextEngine;

      // 執行不同頻率的搜尋
      await searchService.searchText({
        type: 'text',
        query: 'popular query',
        options: { scope: { type: 'project' }, maxResults: 10 }
      });
      await searchService.searchText({
        type: 'text',
        query: 'popular query',
        options: { scope: { type: 'project' }, maxResults: 10 }
      });
      await searchService.searchText({
        type: 'text',
        query: 'rare query',
        options: { scope: { type: 'project' }, maxResults: 10 }
      });
      
      const stats = searchService.getSearchStats();
      
      expect(stats.topQueries[0].query).toBe('popular query');
      expect(stats.topQueries[0].count).toBe(2);
    });
  });

  describe('便捷搜尋方法', () => {
    it('應該能執行快速文字搜尋', async () => {
      const mockTextEngine = {
        search: vi.fn().mockResolvedValue({
          matches: [],
          totalCount: 0,
          searchTime: 10,
          truncated: false
        })
      };
      
      (searchService as any).textEngine = mockTextEngine;

      await searchService.quickTextSearch('test query');
      
      expect(mockTextEngine.search).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'text',
          query: 'test query',
          options: expect.objectContaining({
            scope: { type: 'project' },
            maxResults: 100
          })
        })
      );
    });

    it('應該能在指定目錄中搜尋', async () => {
      const mockTextEngine = {
        search: vi.fn().mockResolvedValue({
          matches: [],
          totalCount: 0,
          searchTime: 10,
          truncated: false
        })
      };
      
      (searchService as any).textEngine = mockTextEngine;

      await searchService.searchInDirectory('test', '/src/components');
      
      expect(mockTextEngine.search).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            scope: {
              type: 'directory',
              path: '/src/components',
              recursive: true
            }
          })
        })
      );
    });

    it('應該能執行正則表達式搜尋', async () => {
      const mockTextEngine = {
        search: vi.fn().mockResolvedValue({
          matches: [],
          totalCount: 0,
          searchTime: 10,
          truncated: false
        })
      };
      
      (searchService as any).textEngine = mockTextEngine;

      await searchService.regexSearch('function\\s+\\w+');
      
      expect(mockTextEngine.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'function\\s+\\w+',
          options: expect.objectContaining({
            regex: true
          })
        })
      );
    });
  });

  describe('尚未實作的功能', () => {
    it('符號搜尋應該拋出錯誤', async () => {
      const symbolQuery = {
        type: 'symbol' as const,
        symbolType: 'function' as any,
        name: 'test',
        options: { scope: { type: 'project' as const }, maxResults: 10 }
      };

      await expect(searchService.searchSymbols(symbolQuery)).rejects.toThrow('符號搜尋尚未實作');
    });

    it('模式搜尋應該拋出錯誤', async () => {
      const patternQuery = {
        type: 'pattern' as const,
        pattern: 'test pattern',
        options: { scope: { type: 'project' as const }, maxResults: 10 }
      };

      await expect(searchService.searchByPattern(patternQuery)).rejects.toThrow('模式搜尋尚未實作');
    });

    it('語義搜尋應該拋出錯誤', async () => {
      await expect(searchService.searchSemantic('test')).rejects.toThrow('語義搜尋尚未實作');
    });
  });

  describe('錯誤處理', () => {
    it('應該處理非 Error 物件的錯誤', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          maxResults: 10
        }
      };

      const mockTextEngine = {
        search: vi.fn().mockRejectedValue('字串錯誤')
      };
      
      (searchService as any).textEngine = mockTextEngine;

      await expect(searchService.searchText(query)).rejects.toThrow('文字搜尋失敗: 字串錯誤');
    });
  });

  describe('效能測試', () => {
    it('應該在合理時間內完成搜尋', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          maxResults: 100
        }
      };

      const mockTextEngine = {
        search: vi.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve({
            matches: [],
            totalCount: 0,
            searchTime: 50,
            truncated: false
          }), 10))
        )
      };
      
      (searchService as any).textEngine = mockTextEngine;

      const startTime = Date.now();
      await searchService.searchText(query);
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeLessThan(1000); // 應該在 1 秒內完成
    });

    it('應該正確計算平均搜尋時間', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          maxResults: 10
        }
      };

      const mockTextEngine = {
        search: vi.fn()
          .mockResolvedValueOnce({
            matches: [],
            totalCount: 0,
            searchTime: 100,
            truncated: false
          })
          .mockResolvedValueOnce({
            matches: [],
            totalCount: 0,
            searchTime: 200,
            truncated: false
          })
      };
      
      (searchService as any).textEngine = mockTextEngine;

      await searchService.searchText(query);
      await searchService.searchText({ ...query, query: 'test2' });
      
      const stats = searchService.getSearchStats();
      
      // 平均時間應該介於兩次搜尋時間之間
      expect(stats.averageSearchTime).toBeGreaterThan(0);
    });
  });
});