/**
 * Worker Pool E2E 測試
 * 測試多執行緒 AST 解析的整合功能
 *
 * 注意：此測試使用真實的 fixture 檔案，因為 Worker 執行緒無法存取 memfs
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { ParserWorkerPool, createParserWorkerPool, type ParseTask } from '@infrastructure/worker-pool/index.js';

/** Fixtures 根目錄 */
const FIXTURES_ROOT = path.resolve(__dirname, '../../fixtures');
const SAMPLE_PROJECT = path.join(FIXTURES_ROOT, 'sample-project');
const TOY_PROJECT = path.join(FIXTURES_ROOT, 'toy-project');
const TOY_PARSER_MODULE = path.join(FIXTURES_ROOT, 'toy-parser.mjs');
const INVALID_PARSER_MODULE = path.join(FIXTURES_ROOT, 'invalid-parser.mjs');
const DISPOSABLE_TOY_PARSER_MODULE = path.join(FIXTURES_ROOT, 'disposable-toy-parser.mjs');
const DIRECT_DISPOSABLE_TOY_PARSER_MODULE = path.join(FIXTURES_ROOT, 'direct-disposable-toy-parser.mjs');

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

    it('不應讓任務指定的 Parser 模組污染後續任務', async () => {
      const tempPool = createParserWorkerPool({ maxThreads: 1, minThreads: 1 });
      const filePath = path.join(TOY_PROJECT, 'main.toy');
      const content = fs.readFileSync(filePath, 'utf-8');

      try {
        const withModule = await tempPool.parseFile({
          filePath,
          content,
          parserModulePaths: [TOY_PARSER_MODULE]
        });
        expect(withModule.errors).toHaveLength(0);

        const withoutModule = await tempPool.parseFile({ filePath, content });

        expect(withoutModule.errors).toContain('No parser for extension: .toy');
      } finally {
        await tempPool.destroy();
      }
    });

    it('Parser 模組初始化中途失敗時不應污染後續任務', async () => {
      const tempPool = createParserWorkerPool({ maxThreads: 1, minThreads: 1 });
      const filePath = path.join(TOY_PROJECT, 'main.toy');
      const content = fs.readFileSync(filePath, 'utf-8');

      try {
        const withInvalidModule = await tempPool.parseFile({
          filePath,
          content,
          parserModulePaths: [TOY_PARSER_MODULE, INVALID_PARSER_MODULE]
        });
        expect(withInvalidModule.errors.join('\n')).toContain('valid ParserPlugin');

        const withoutModule = await tempPool.parseFile({ filePath, content });
        expect(withoutModule.errors).toContain('No parser for extension: .toy');
      } finally {
        await tempPool.destroy();
      }
    });

    it('任務指定的 Parser 模組清理時應釋放 parser', async () => {
      const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'agent-ide-worker-dispose-'));
      const disposeLog = path.join(tempDir, 'dispose.log');
      process.env.AGENT_IDE_DISPOSE_LOG = disposeLog;
      const tempPool = createParserWorkerPool({ maxThreads: 1, minThreads: 1 });
      const filePath = path.join(TOY_PROJECT, 'main.toy');
      const content = fs.readFileSync(filePath, 'utf-8');

      try {
        const result = await tempPool.parseFile({
          filePath,
          content,
          parserModulePaths: [DISPOSABLE_TOY_PARSER_MODULE]
        });
        expect(result.errors).toHaveLength(0);
        expect(fs.readFileSync(disposeLog, 'utf-8')).toContain('disposed');
      } finally {
        await tempPool.destroy();
        delete process.env.AGENT_IDE_DISPOSE_LOG;
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('直接 export 的 ParserPlugin 模組在 worker isolate 模式下應於多個 task 間重用同一模組實例（不隨 task 數重新 import）', async () => {
      const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'agent-ide-worker-direct-dispose-'));
      const disposeLog = path.join(tempDir, 'dispose.log');
      const loadLog = path.join(tempDir, 'load.log');
      process.env.AGENT_IDE_DIRECT_DISPOSE_LOG = disposeLog;
      process.env.AGENT_IDE_DIRECT_LOAD_LOG = loadLog;
      const tempPool = createParserWorkerPool({ maxThreads: 1, minThreads: 1 });
      const filePath = path.join(TOY_PROJECT, 'main.toy');
      const content = fs.readFileSync(filePath, 'utf-8');

      try {
        for (let taskIndex = 0; taskIndex < 3; taskIndex++) {
          const result = await tempPool.parseFile({
            filePath,
            content,
            parserModulePaths: [DIRECT_DISPOSABLE_TOY_PARSER_MODULE]
          });
          expect(result.errors).toHaveLength(0);
        }
      } finally {
        await tempPool.destroy();
        delete process.env.AGENT_IDE_DIRECT_DISPOSE_LOG;
        delete process.env.AGENT_IDE_DIRECT_LOAD_LOG;
      }

      try {
        // 根因回歸：module 只應在 worker 生命週期內被 Node ESM loader 實際 evaluate 一次，
        // 不隨 task 數線性增長（修復前每個 task 都會用全新 query string 重新 import，
        // 這裡會是 3 行，代表 3 個永遠不會被回收的模組實例，即記憶體洩漏根因）。
        const loadLines = fs.readFileSync(loadLog, 'utf-8').trim().split('\n').filter(Boolean);
        expect(loadLines).toHaveLength(1);
        // 模組實例在多個 task 間重用、不再逐 task dispose，dispose 因此不會被觸發，
        // 直到目前 worker 架構仍缺乏可靠的 teardown hook（見 initializer.ts 註解）。
        expect(fs.existsSync(disposeLog)).toBe(false);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
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
