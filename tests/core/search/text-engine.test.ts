/**
 * TextSearchEngine 測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TextSearchEngine } from '../../../src/core/search/engines/text-engine.js';
import type { TextQuery } from '../../../src/core/search/types.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

describe('TextSearchEngine', () => {
  let engine: TextSearchEngine;
  let testDir: string;
  
  beforeEach(async () => {
    engine = new TextSearchEngine();
    testDir = join(process.cwd(), 'test-temp');
    
    // 建立測試目錄和檔案
    await mkdir(testDir, { recursive: true });
    
    await writeFile(join(testDir, 'test1.ts'), `
export function getUserById(id: number): User {
  return database.findUser(id);
}

export class UserService {
  async fetchUser(userId: number) {
    return await this.api.get(\`/users/\${userId}\`);
  }
}
`.trim());

    await writeFile(join(testDir, 'test2.js'), `
const userData = {
  name: 'John',
  age: 30
};

function processUser(user) {
  console.log('Processing user:', user.name);
}
`.trim());
  });
  
  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('基本搜尋功能', () => {
    it('應該能夠搜尋簡單文字', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'function',
        options: {
          scope: { type: 'directory', path: testDir },
          maxResults: 10
        }
      };

      const result = await engine.search(query);

      expect(result.matches).toHaveLength(2);
      expect(result.matches[0].content).toContain('function');
      expect(result.totalCount).toBe(2);
      expect(result.searchTime).toBeGreaterThan(0);
      expect(result.truncated).toBe(false);
    });

    it('應該能夠搜尋並返回上下文', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'export',
        options: {
          scope: { type: 'directory', path: testDir },
          maxResults: 10,
          showContext: true,
          contextLines: 1
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBeGreaterThan(0);
      const match = result.matches[0];
      expect(match.context).toBeDefined();
      expect(match.context.before).toBeDefined();
      expect(match.context.after).toBeDefined();
    });

    it('應該計算正確的匹配分數', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'function',
        options: {
          scope: { type: 'directory', path: testDir },
          maxResults: 10
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBeGreaterThan(0);
      result.matches.forEach(match => {
        expect(match.score).toBeGreaterThan(0);
        expect(match.score).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('搜尋選項', () => {
    it('應該支援大小寫敏感搜尋', async () => {
      const caseSensitiveQuery: TextQuery = {
        type: 'text',
        query: 'USER',
        options: {
          scope: { type: 'directory', path: testDir },
          caseSensitive: true,
          maxResults: 10
        }
      };

      const caseInsensitiveQuery: TextQuery = {
        type: 'text',
        query: 'USER',
        options: {
          scope: { type: 'directory', path: testDir },
          caseSensitive: false,
          maxResults: 10
        }
      };

      const sensitiveResult = await engine.search(caseSensitiveQuery);
      const insensitiveResult = await engine.search(caseInsensitiveQuery);

      expect(sensitiveResult.matches.length).toBeLessThanOrEqual(
        insensitiveResult.matches.length
      );
    });

    it('應該支援全字匹配', async () => {
      const wholeWordQuery: TextQuery = {
        type: 'text',
        query: 'user',
        options: {
          scope: { type: 'directory', path: testDir },
          wholeWord: true,
          maxResults: 10
        }
      };

      const partialWordQuery: TextQuery = {
        type: 'text',
        query: 'user',
        options: {
          scope: { type: 'directory', path: testDir },
          wholeWord: false,
          maxResults: 10
        }
      };

      const wholeWordResult = await engine.search(wholeWordQuery);
      const partialWordResult = await engine.search(partialWordQuery);

      expect(wholeWordResult.matches.length).toBeLessThanOrEqual(
        partialWordResult.matches.length
      );
    });

    it('應該支援正則表達式搜尋', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'export.*function',
        options: {
          scope: { type: 'directory', path: testDir },
          regex: true,
          maxResults: 10
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].content).toMatch(/export.*function/);
    });

    it('應該支援最大結果數限制', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'user',
        options: {
          scope: { type: 'directory', path: testDir },
          maxResults: 1
        }
      };

      const result = await engine.search(query);

      expect(result.matches.length).toBeLessThanOrEqual(1);
      if (result.totalCount > 1) {
        expect(result.truncated).toBe(true);
      }
    });
  });

  describe('錯誤處理', () => {
    it('應該處理無效的正則表達式', async () => {
      const query: TextQuery = {
        type: 'text',
        query: '[invalid regex',
        options: {
          scope: { type: 'directory', path: testDir },
          regex: true,
          maxResults: 10
        }
      };

      await expect(engine.search(query)).rejects.toThrow('無效的搜尋模式');
    });

    it('應該處理不存在的目錄', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'function',
        options: {
          scope: { type: 'directory', path: '/non/existent/path' },
          maxResults: 10
        }
      };

      const result = await engine.search(query);
      expect(result.matches).toHaveLength(0);
    });

    it('應該處理空查詢', async () => {
      const query: TextQuery = {
        type: 'text',
        query: '',
        options: {
          scope: { type: 'directory', path: testDir },
          maxResults: 10
        }
      };

      const result = await engine.search(query);
      expect(result.matches).toHaveLength(0);
    });
  });

  describe('效能', () => {
    it('應該在合理時間內完成搜尋', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'function',
        options: {
          scope: { type: 'directory', path: testDir },
          maxResults: 100
        }
      };

      const startTime = Date.now();
      const result = await engine.search(query);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // 應該在 1 秒內完成
      expect(result.searchTime).toBeLessThan(1000);
    });

    it('應該支援搜尋超時', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'function',
        options: {
          scope: { type: 'directory', path: testDir },
          maxResults: 10,
          timeout: 1 // 1ms 超時，應該會被觸發
        }
      };

      const result = await engine.search(query);
      // 即使超時，也應該返回結果（可能是部分結果）
      expect(result).toBeDefined();
      expect(result.matches).toBeDefined();
    });
  });

  describe('檔案過濾', () => {
    it('應該支援檔案類型過濾', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'function',
        options: {
          scope: { type: 'directory', path: testDir },
          includeFiles: ['*.ts'],
          maxResults: 10
        }
      };

      const result = await engine.search(query);

      // 所有結果都應該來自 .ts 檔案
      result.matches.forEach(match => {
        expect(match.file).toMatch(/\.ts$/);
      });
    });

    it('應該支援排除檔案模式', async () => {
      const query: TextQuery = {
        type: 'text',
        query: 'user',
        options: {
          scope: { type: 'directory', path: testDir },
          excludeFiles: ['*.js'],
          maxResults: 10
        }
      };

      const result = await engine.search(query);

      // 結果中不應該包含 .js 檔案
      result.matches.forEach(match => {
        expect(match.file).not.toMatch(/\.js$/);
      });
    });
  });
});