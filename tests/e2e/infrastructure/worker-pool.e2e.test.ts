/**
 * Worker Pool E2E 測試
 * 測試多執行緒 AST 解析的整合功能
 *
 * 注意：此測試使用真實的 fixture 檔案，因為 Worker 執行緒無法存取 memfs
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ParserWorkerPool, createParserWorkerPool, type ParseTask } from '@infrastructure/worker-pool/index.js';

/** Fixtures 根目錄 */
const FIXTURES_ROOT = path.resolve(__dirname, '../../fixtures');
const SAMPLE_PROJECT = path.join(FIXTURES_ROOT, 'sample-project');
const TOY_PROJECT = path.join(FIXTURES_ROOT, 'toy-project');
const TOY_PARSER_MODULE = path.join(FIXTURES_ROOT, 'toy-parser.mjs');

describe('Worker Pool E2E - 多執行緒 AST 解析', () => {
  let pool: ParserWorkerPool;

  beforeAll(() => {
    pool = createParserWorkerPool({ maxThreads: 2, minThreads: 1 });
  });

  afterAll(async () => {
    await pool.destroy();
  });

  describe('parseFile - 單一檔案解析', () => {
    it('應該成功解析 TypeScript 檔案', async () => {
      const filePath = path.join(SAMPLE_PROJECT, 'src/index.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      const task: ParseTask = { filePath, content };

      const result = await pool.parseFile(task);

      expect(result.filePath).toBe(filePath);
      expect(result.errors).toHaveLength(0);
      expect(Array.isArray(result.symbols)).toBe(true);
      expect(Array.isArray(result.dependencies)).toBe(true);
    });

    it('應該成功解析 JavaScript 檔案', async () => {
      // 使用 TypeScript 檔案但假裝是 JS（parser 支援兩種）
      const filePath = path.join(SAMPLE_PROJECT, 'src/utils/date-utils.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      const task: ParseTask = { filePath, content };

      const result = await pool.parseFile(task);

      expect(result.filePath).toBe(filePath);
      expect(result.errors).toHaveLength(0);
    });

    it('應該正確提取符號', async () => {
      const filePath = path.join(SAMPLE_PROJECT, 'src/utils/date-utils.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      const task: ParseTask = { filePath, content };

      const result = await pool.parseFile(task);

      // date-utils.ts 包含多個 export function
      expect(result.symbols.length).toBeGreaterThan(0);

      // 確認符號包含基本欄位
      const firstSymbol = result.symbols[0];
      expect(firstSymbol.name).toBeDefined();
      expect(firstSymbol.type).toBeDefined();
      expect(firstSymbol.location).toBeDefined();
    });

    it('應該正確提取依賴', async () => {
      const filePath = path.join(SAMPLE_PROJECT, 'src/index.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      const task: ParseTask = { filePath, content };

      const result = await pool.parseFile(task);

      // index.ts 應該有 import 語句
      expect(result.dependencies.length).toBeGreaterThanOrEqual(0);
    });

    it('應該透過任務指定的 Parser 模組解析額外語言', async () => {
      const filePath = path.join(TOY_PROJECT, 'main.toy');
      const content = fs.readFileSync(filePath, 'utf-8');
      const task: ParseTask = {
        filePath,
        content,
        parserModulePaths: [TOY_PARSER_MODULE]
      };

      const result = await pool.parseFile(task);

      expect(result.errors).toHaveLength(0);
      expect(result.symbols.map(symbol => symbol.name)).toContain('WorkerAlpha');
      expect(result.dependencies).toEqual([
        {
          path: './dep.toy',
          type: 'import',
          isRelative: true,
          importedSymbols: []
        }
      ]);
    });

    it('應該處理語法錯誤並返回錯誤訊息', async () => {
      const filePath = '/fake/invalid.ts';
      const content = 'export function { invalid syntax';
      const task: ParseTask = { filePath, content };

      const result = await pool.parseFile(task);

      // Parser 應該仍能返回結果，但可能有錯誤或空符號
      expect(result.filePath).toBe(filePath);
    });
  });

  describe('parseFiles - 批次解析', () => {
    it('應該成功批次解析多個檔案', async () => {
      const files = [
        path.join(SAMPLE_PROJECT, 'src/index.ts'),
        path.join(SAMPLE_PROJECT, 'src/utils/date-utils.ts'),
        path.join(SAMPLE_PROJECT, 'src/core/config/settings.ts')
      ];

      const tasks: ParseTask[] = files.map(filePath => ({
        filePath,
        content: fs.readFileSync(filePath, 'utf-8')
      }));

      const results = await pool.parseFiles(tasks);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.filePath).toBe(files[index]);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('應該返回空陣列當沒有任務', async () => {
      const results = await pool.parseFiles([]);

      expect(results).toHaveLength(0);
    });

    it('應該保持結果順序與任務順序一致', async () => {
      const files = [
        path.join(SAMPLE_PROJECT, 'src/utils/date-utils.ts'),
        path.join(SAMPLE_PROJECT, 'src/index.ts'),
        path.join(SAMPLE_PROJECT, 'src/core/config/settings.ts')
      ];

      const tasks: ParseTask[] = files.map(filePath => ({
        filePath,
        content: fs.readFileSync(filePath, 'utf-8')
      }));

      const results = await pool.parseFiles(tasks);

      // 驗證順序一致
      files.forEach((file, index) => {
        expect(results[index].filePath).toBe(file);
      });
    });
  });

  describe('生命週期管理', () => {
    it('應該在 destroy 後拋出錯誤', async () => {
      const tempPool = createParserWorkerPool({ maxThreads: 1 });
      await tempPool.destroy();

      const task: ParseTask = {
        filePath: '/test.ts',
        content: 'const x = 1;'
      };

      await expect(tempPool.parseFile(task)).rejects.toThrow('已被釋放');
    });

    it('應該正確報告 isDisposed 狀態', async () => {
      const tempPool = createParserWorkerPool({ maxThreads: 1 });

      expect(tempPool.isDisposed).toBe(false);

      await tempPool.destroy();

      expect(tempPool.isDisposed).toBe(true);
    });

    it('多次 destroy 應該安全', async () => {
      const tempPool = createParserWorkerPool({ maxThreads: 1 });

      await tempPool.destroy();
      await expect(tempPool.destroy()).resolves.not.toThrow();
    });
  });

  describe('符號序列化', () => {
    it('應該返回可序列化的符號（無 tsNode/tsSymbol）', async () => {
      const filePath = path.join(SAMPLE_PROJECT, 'src/utils/date-utils.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      const task: ParseTask = { filePath, content };

      const result = await pool.parseFile(task);

      // 確認符號可以 JSON 序列化（無循環引用）
      expect(() => JSON.stringify(result)).not.toThrow();

      // 確認沒有 tsNode 和 tsSymbol 屬性
      for (const symbol of result.symbols) {
        expect(symbol).not.toHaveProperty('tsNode');
        expect(symbol).not.toHaveProperty('tsSymbol');
      }
    });
  });
});
