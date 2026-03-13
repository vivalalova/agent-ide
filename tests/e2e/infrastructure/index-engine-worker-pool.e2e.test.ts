/**
 * IndexEngine Worker Pool 多執行緒路徑整合測試
 *
 * 注意：使用真實 fixture 檔案（Worker 執行緒無法存取 memfs）
 * 透過 vi.stubEnv 暫時覆蓋測試環境偵測，啟用 Worker Pool
 */

import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import { IndexEngine } from '@core/foundations/indexing/index-engine.js';
import { FileSystem } from '@infrastructure/storage/index.js';
import type { IndexConfig } from '@core/foundations/indexing/types.js';
import { CLI_INDEX_DEFAULTS } from '@core/foundations/indexing/types.js';

const FIXTURES_ROOT = path.resolve(__dirname, '../../fixtures');
const SAMPLE_PROJECT = path.join(FIXTURES_ROOT, 'sample-project');

const BASE_CONFIG: IndexConfig = {
  workspacePath: SAMPLE_PROJECT,
  excludePatterns: [...CLI_INDEX_DEFAULTS.excludePatterns],
  includeExtensions: [...CLI_INDEX_DEFAULTS.includeExtensions],
  maxFileSize: 1024 * 1024,
  enablePersistence: false,
  persistencePath: undefined,
  maxConcurrency: 2,
};

/** 暫時覆蓋測試環境偵測，讓 IndexEngine 建立 Worker Pool */
function enableWorkerPool(): void {
  vi.stubEnv('VITEST', 'false');
  vi.stubEnv('NODE_ENV', 'development');
}

describe('IndexEngine Worker Pool 整合測試 - 多執行緒路徑', () => {
  // eslint-disable-next-line custom/no-new-filesystem -- Worker Pool 測試需要真實 FileSystem（Worker 無法存取 memfs）
  const realFs = new FileSystem();

  describe('Worker Pool 啟用驗證', () => {
    it('應該在啟用 Worker Pool 後成功索引專案並找到符號', async () => {
      enableWorkerPool();
      const engine = new IndexEngine(BASE_CONFIG, realFs);

      try {
        await engine.indexProject();

        const stats = await engine.getStats();
        expect(stats.totalFiles).toBeGreaterThan(0);
        expect(stats.totalSymbols).toBeGreaterThan(0);
      } finally {
        engine.dispose();
      }
    });

    it('Worker Pool 模式應找到與單執行緒模式相同的符號', async () => {
      // 單執行緒模式（正常測試環境，VITEST=true → parserPool=null）
      const singleEngine = new IndexEngine(BASE_CONFIG, realFs);
      await singleEngine.indexProject();
      const singleResults = await singleEngine.getAllSymbols();
      const singleSymbols = singleResults.map(r => r.symbol.name).sort();
      singleEngine.dispose();

      expect(singleSymbols.length).toBeGreaterThan(0);

      // Worker Pool 模式
      enableWorkerPool();
      const workerEngine = new IndexEngine(BASE_CONFIG, realFs);
      await workerEngine.indexProject();
      const workerResults = await workerEngine.getAllSymbols();
      const workerSymbols = workerResults.map(r => r.symbol.name).sort();
      workerEngine.dispose();

      // 驗證兩種路徑結果一致
      expect(workerSymbols.length).toBe(singleSymbols.length);
      expect(workerSymbols).toEqual(singleSymbols);
    });
  });

  describe('Worker Pool 資源清理', () => {
    it('dispose 後操作應拋出已釋放錯誤', async () => {
      enableWorkerPool();
      const engine = new IndexEngine(BASE_CONFIG, realFs);
      await engine.indexProject();
      engine.dispose();

      await expect(engine.getStats()).rejects.toThrow('已被釋放');
      await expect(engine.getAllSymbols()).rejects.toThrow('已被釋放');
    });

    it('多次 dispose 應安全不拋錯', () => {
      enableWorkerPool();
      const engine = new IndexEngine(BASE_CONFIG, realFs);
      engine.dispose();
      expect(() => engine.dispose()).not.toThrow();
    });
  });
});
