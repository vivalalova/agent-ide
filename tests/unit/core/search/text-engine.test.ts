import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextSearchEngine } from '@core/search/engines/text-engine';
import type { TextQuery, TextSearchOptions } from '@core/search/types';
import { readFile } from 'fs/promises';
import { glob } from 'glob';

// Mock fs/promises 和 glob
vi.mock('fs/promises', () => ({
  readFile: vi.fn()
}));

vi.mock('glob', () => ({
  glob: vi.fn()
}));

describe('TextSearchEngine', () => {
  let engine: TextSearchEngine;

  beforeEach(() => {
    engine = new TextSearchEngine();
    vi.clearAllMocks();
  });

  describe('基本文字搜尋', () => {
    it('應該能夠執行簡單的文字搜尋', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'function test() {\n  console.log("hello");\n}';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' }
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].content).toContain('test');
      expect(result.matches[0].file).toBe('/test/file1.ts');
      expect(result.totalCount).toBeGreaterThan(0);
      expect(result.searchTime).toBeGreaterThanOrEqual(0);
      expect(result.truncated).toBe(false);
    });

    it('應該在沒有匹配時返回空結果', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'function test() {}';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'notfound',
        options: {
          scope: { type: 'project' }
        }
      };

      const result = await engine.search(query);

      expect(result.matches).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('應該處理多個匹配項', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'test\ntest\ntest';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' }
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBe(3);
      expect(result.totalCount).toBe(3);
    });
  });

  describe('大小寫敏感搜尋', () => {
    it('應該支援大小寫不敏感搜尋（預設）', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'TEST test TeSt';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          caseSensitive: false
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBe(3);
    });

    it('應該支援大小寫敏感搜尋', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'TEST test TeSt';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          caseSensitive: true
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBe(1);
      expect(result.matches[0].content).toBe('test');
    });
  });

  describe('全字匹配', () => {
    it('應該支援全字匹配', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'test testing testable';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          wholeWord: true
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBe(1);
      expect(result.matches[0].content).toBe('test');
    });

    it('應該在非全字匹配時找到部分匹配', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'test testing testable';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          wholeWord: false
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBe(3);
    });
  });

  describe('正則表達式搜尋', () => {
    it('應該支援正則表達式搜尋', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'test123\ntest456\nabc789';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test\\d+',
        options: {
          scope: { type: 'project' },
          regex: true
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBe(2);
      expect(result.matches[0].content).toMatch(/test\d+/);
    });

    it('應該在正則表達式無效時拋出錯誤', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'test';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: '[invalid(',
        options: {
          scope: { type: 'project' },
          regex: true
        }
      };

      await expect(engine.search(query)).rejects.toThrow();
    });
  });

  describe('搜尋範圍', () => {
    it('應該支援檔案範圍搜尋', async () => {
      const mockContent = 'test content';
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: {
            type: 'file',
            path: '/test/specific.ts'
          }
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('應該支援目錄範圍搜尋', async () => {
      const mockFiles = ['/test/dir/file1.ts', '/test/dir/file2.ts'];
      const mockContent = 'test content';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: {
            type: 'directory',
            path: '/test/dir',
            recursive: true
          }
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('應該支援專案範圍搜尋', async () => {
      const mockFiles = ['/project/file1.ts', '/project/file2.ts'];
      const mockContent = 'test content';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' }
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBeGreaterThan(0);
    });
  });

  describe('結果限制', () => {
    it('應該限制最大結果數量', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = Array(100).fill('test').join('\n');

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          maxResults: 10
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBeLessThanOrEqual(10);
      expect(result.truncated).toBe(true);
    });

    it('應該在結果未超過限制時設置 truncated 為 false', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'test\ntest\ntest';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          maxResults: 100
        }
      };

      const result = await engine.search(query);

      expect(result.truncated).toBe(false);
    });
  });

  describe('上下文資訊', () => {
    it('應該包含匹配上下文', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'line1\nline2\ntest\nline4\nline5';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          showContext: true,
          contextLines: 2
        }
      };

      const result = await engine.search(query);

      expect(result.matches[0].context).toBeDefined();
      expect(result.matches[0].context.before).toHaveLength(2);
      expect(result.matches[0].context.after).toHaveLength(2);
      expect(result.matches[0].context.before).toContain('line1');
      expect(result.matches[0].context.before).toContain('line2');
      expect(result.matches[0].context.after).toContain('line4');
      expect(result.matches[0].context.after).toContain('line5');
    });

    it('應該在檔案開頭處理上下文', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'test\nline2\nline3';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          showContext: true,
          contextLines: 2
        }
      };

      const result = await engine.search(query);

      expect(result.matches[0].context.before).toHaveLength(0);
      expect(result.matches[0].context.after.length).toBeGreaterThan(0);
    });

    it('應該在檔案結尾處理上下文', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'line1\nline2\ntest';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          showContext: true,
          contextLines: 2
        }
      };

      const result = await engine.search(query);

      expect(result.matches[0].context.after).toHaveLength(0);
      expect(result.matches[0].context.before.length).toBeGreaterThan(0);
    });
  });

  describe('匹配資訊', () => {
    it('應該包含正確的行號和列號', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'line1\n  test content\nline3';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' }
        }
      };

      const result = await engine.search(query);

      expect(result.matches[0].line).toBe(2);
      expect(result.matches[0].column).toBe(3); // '  test' - 'test' 在第 3 列（從 1 開始）
    });

    it('應該包含正確的範圍資訊', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'test';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' }
        }
      };

      const result = await engine.search(query);

      expect(result.matches[0].range).toBeDefined();
      expect(result.matches[0].range.start.line).toBe(1);
      expect(result.matches[0].range.start.column).toBe(1);
      expect(result.matches[0].range.end.line).toBe(1);
      expect(result.matches[0].range.end.column).toBe(5); // 'test' 長度為 4，結束在第 5 列
    });

    it('應該計算匹配分數', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'test';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' }
        }
      };

      const result = await engine.search(query);

      expect(result.matches[0].score).toBeGreaterThan(0);
      expect(result.matches[0].score).toBeLessThanOrEqual(1);
    });
  });

  describe('反向搜尋', () => {
    it('應該支援反向搜尋（排除包含模式的檔案）', async () => {
      const mockFiles = ['/test/file1.ts', '/test/file2.ts'];
      const mockContent1 = 'test content';
      const mockContent2 = 'other content';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile)
        .mockResolvedValueOnce(mockContent1)
        .mockResolvedValueOnce(mockContent2);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          invert: true
        }
      };

      const result = await engine.search(query);

      // 反向搜尋應該返回不包含 'test' 的檔案
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].file).toBe('/test/file2.ts');
    });
  });

  describe('模糊搜尋', () => {
    it('應該支援模糊搜尋', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'test content';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'tst',
        options: {
          scope: { type: 'project' },
          fuzzy: true
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBeGreaterThan(0);
    });
  });

  describe('檔案過濾', () => {
    it('應該支援包含檔案過濾器', async () => {
      const mockFiles = ['/test/file1.ts', '/test/file2.js', '/test/file3.ts'];
      const mockContent = 'test';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          includeFiles: ['*.ts']
        }
      };

      const result = await engine.search(query);

      // 應該只搜尋 .ts 檔案
      const fileExtensions = result.matches.map(m => m.file.split('.').pop());
      expect(fileExtensions.every(ext => ext === 'ts')).toBe(true);
    });

    it('應該支援排除檔案過濾器', async () => {
      const mockFiles = ['/test/file1.ts', '/test/file2.test.ts'];
      const mockContent = 'test';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          excludeFiles: ['*.test.ts']
        }
      };

      const result = await engine.search(query);

      // 應該排除 .test.ts 檔案
      const hasTestFiles = result.matches.some(m => m.file.includes('.test.ts'));
      expect(hasTestFiles).toBe(false);
    });
  });

  describe('邊界情況', () => {
    it('應該處理空查詢', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'test content';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: '',
        options: {
          scope: { type: 'project' }
        }
      };

      const result = await engine.search(query);

      expect(result.matches).toHaveLength(0);
    });

    it('應該處理空檔案', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = '';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' }
        }
      };

      const result = await engine.search(query);

      expect(result.matches).toHaveLength(0);
    });

    it('應該處理沒有檔案的情況', async () => {
      vi.mocked(glob).mockResolvedValue([]);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' }
        }
      };

      const result = await engine.search(query);

      expect(result.matches).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('應該在檔案讀取失敗時繼續搜尋其他檔案', async () => {
      const mockFiles = ['/test/file1.ts', '/test/file2.ts'];
      const mockContent = 'test content';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile)
        .mockRejectedValueOnce(new Error('Read error'))
        .mockResolvedValueOnce(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' }
        }
      };

      const result = await engine.search(query);

      // 應該仍然返回第二個檔案的結果
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('應該處理特殊字符', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'test [special] content';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: '[special]',
        options: {
          scope: { type: 'project' },
          regex: false
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].content).toBe('[special]');
    });
  });

  describe('效能', () => {
    it('應該記錄搜尋時間', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'test';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' }
        }
      };

      const result = await engine.search(query);

      expect(result.searchTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.searchTime).toBe('number');
    });

    it('應該在超時時停止搜尋', async () => {
      const mockFiles = Array(100).fill(0).map((_, i) => `/test/file${i}.ts`);
      const mockContent = 'test content';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockImplementation(async () => {
        // 模擬慢速讀取
        await new Promise(resolve => setTimeout(resolve, 100));
        return mockContent;
      });

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' },
          timeout: 50 // 50ms 超時
        }
      };

      const result = await engine.search(query);

      // 由於超時，可能不會處理所有檔案
      expect(result.searchTime).toBeLessThan(500); // 應該遠小於處理所有檔案的時間
    });
  });

  describe('結果排序', () => {
    it('應該按分數排序結果', async () => {
      const mockFiles = ['/test/file1.ts'];
      const mockContent = 'test testing';

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(readFile).mockResolvedValue(mockContent);

      const query: TextQuery = {
        type: 'text',
        query: 'test',
        options: {
          scope: { type: 'project' }
        }
      };

      const result = await engine.search(query);

      // 結果應該按分數降序排列
      for (let i = 0; i < result.matches.length - 1; i++) {
        expect(result.matches[i].score).toBeGreaterThanOrEqual(result.matches[i + 1].score);
      }
    });
  });
});
