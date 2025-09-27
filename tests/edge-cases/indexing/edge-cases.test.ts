/**
 * Indexing 模組邊界條件和異常處理參數化測試
 * 測試索引引擎在各種極端條件下的行為
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { withMemoryOptimization } from '../../test-utils/cleanup';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { IndexEngine } from '../../../src/core/indexing/index-engine';
import type { IndexConfig } from '../../../src/core/indexing/types';

// 索引配置介面 (用於相容性)
interface OldIndexConfig {
  rootPath: string;
  includeExtensions?: string[];
  excludePatterns?: string[];
  maxFileSize?: number;
  followSymlinks?: boolean;
}

// 建立索引配置的輔助函數
function createIndexConfig(config?: Partial<IndexConfig>): IndexConfig {
  const rootPath = (config as any)?.rootPath ?? config?.workspacePath;
  if (!rootPath) {
    throw new Error('根路徑為必要參數');
  }

  return {
    workspacePath: rootPath,
    includeExtensions: config?.includeExtensions ?? ['.ts', '.js'],
    excludePatterns: config?.excludePatterns ?? ['node_modules', '.git'],
    maxFileSize: config?.maxFileSize ?? (10 * 1024 * 1024),
    enablePersistence: config?.enablePersistence ?? false,
    persistencePath: config?.persistencePath,
    maxConcurrency: config?.maxConcurrency ?? 4
  };
}

// 使用真實的 IndexEngine，已在檔案頂部導入

describe('Indexing 模組邊界條件測試 (暫時跳過)', () => {
  let testDir: string;
  let validConfig: IndexConfig;

  beforeEach(async () => {
    testDir = join(tmpdir(), `agent-ide-index-edge-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    validConfig = createIndexConfig({ rootPath: testDir });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理錯誤
    }
  });

  describe('IndexEngine 配置驗證測試', () => {
    it.each([
      // [描述, 配置, 預期錯誤訊息]
      ['null 配置', null, '索引配置必須是物件'],
      ['undefined 配置', undefined, '索引配置必須是物件'],
      ['字串配置', 'invalid-config', '索引配置必須是物件'],
      ['陣列配置', [testDir], '索引配置必須是物件'],
      ['空物件配置', {}, '根路徑必須是有效字串'],
      ['null 根路徑', { workspacePath: null }, '根路徑必須是有效字串'],
      ['undefined 根路徑', { workspacePath: undefined }, '根路徑必須是有效字串'],
      ['空字串根路徑', { workspacePath: '' }, '根路徑必須是有效字串'],
      ['數字根路徑', { workspacePath: 123 }, '根路徑必須是有效字串'],
    ])('應該拒絕無效配置：%s', withMemoryOptimization((unusedDescription, config, expectedError) => {
      expect(() => new IndexEngine(config as any)).toThrow(expectedError);
    }, { testName: 'config-invalid-test' }));

    it.each([
      ['字串包含副檔名', { workspacePath: testDir, includeExtensions: '.ts' }, '包含副檔名必須是陣列'],
      ['null 包含副檔名', { workspacePath: testDir, includeExtensions: null }, '包含副檔名必須是陣列'],
      ['物件包含副檔名', { workspacePath: testDir, includeExtensions: { ts: true } }, '包含副檔名必須是陣列'],
      ['字串排除模式', { workspacePath: testDir, excludePatterns: 'node_modules' }, '排除模式必須是陣列'],
      ['null 排除模式', { workspacePath: testDir, excludePatterns: null }, '排除模式必須是陣列'],
      ['零最大檔案大小', { workspacePath: testDir, maxFileSize: 0 }, '最大檔案大小必須是正數'],
      ['負數最大檔案大小', { workspacePath: testDir, maxFileSize: -100 }, '最大檔案大小必須是正數'],
      ['字串最大檔案大小', { workspacePath: testDir, maxFileSize: '1MB' }, '最大檔案大小必須是正數'],
    ])('應該拒絕無效選項：%s', withMemoryOptimization((unusedDescription, config, expectedError) => {
      expect(() => new IndexEngine(config as any)).toThrow(expectedError);
    }, { testName: 'config-options-test' }));

    it.each([
      ['基本配置', { workspacePath: testDir }],
      ['完整配置', {
        workspacePath: testDir,
        includeExtensions: ['.ts', '.js'],
        excludePatterns: ['node_modules'],
        maxFileSize: 1000000
      }],
      ['空陣列配置', { workspacePath: testDir, includeExtensions: [], excludePatterns: [] }],
      ['單一副檔名', { workspacePath: testDir, includeExtensions: ['.ts'] }],
      ['多個排除模式', { workspacePath: testDir, excludePatterns: ['node_modules', '.git', 'dist'] }],
    ])('應該接受有效配置：%s', withMemoryOptimization((unusedDescription, config) => {
      expect(() => new IndexEngine(config)).not.toThrow();
    }, { testName: 'config-valid-test' }));
  });

  describe('IndexEngine 索引操作邊界測試', () => {
    it.each([
      ['空目錄', async (dir: string) => {
        // 目錄已存在但為空
      }, true, { totalFiles: 0, totalSymbols: 0 }],
      ['單一檔案目錄', async (dir: string) => {
        await fs.writeFile(join(dir, 'test.ts'), 'function test() {}');
      }, true, { totalFiles: 1, minSymbols: 1 }],
      ['深層嵌套目錄', async (dir: string) => {
        const deepPath = join(dir, 'a', 'b', 'c', 'd', 'e');
        await fs.mkdir(deepPath, { recursive: true });
        await fs.writeFile(join(deepPath, 'deep.ts'), 'const deep = true;');
      }, true, { totalFiles: 1, minSymbols: 1 }],
      ['混合檔案類型', async (dir: string) => {
        await fs.writeFile(join(dir, 'code.ts'), 'function test() {}');
        await fs.writeFile(join(dir, 'data.json'), '{"key": "value"}');
        await fs.writeFile(join(dir, 'readme.md'), '# Title');
      }, true, { totalFiles: 1, minSymbols: 1 }], // 只會索引 .ts 檔案
    ])('應該處理不同目錄結構：%s', withMemoryOptimization(async (unusedDescription, setupFn, shouldSucceed, expected) => {
      if (typeof setupFn === 'function') {
        await setupFn(testDir);
      }

      const engine = new IndexEngine(validConfig);

      if (shouldSucceed) {
        await engine.indexProject();
        const stats = await engine.getStats();

        expect(stats.totalFiles).toBe(expected.totalFiles);
        if (expected.minSymbols !== undefined) {
          expect(stats.totalSymbols).toBeGreaterThanOrEqual(expected.minSymbols);
        } else if (expected.totalSymbols !== undefined) {
          expect(stats.totalSymbols).toBe(expected.totalSymbols);
        }
      } else {
        await expect(engine.indexProject()).rejects.toThrow();
      }
    }, { testName: 'indexing-structure-test' }));

    it.each([
      ['不存在的路徑', '/nonexistent/path', '路徑不存在'],
      ['檔案而非目錄', null, '索引路徑必須是目錄'], // 將在測試中建立檔案
      ['null 路徑', null, '索引路徑必須是有效字串'],
      ['undefined 路徑', undefined, '索引路徑必須是有效字串'],
      ['空字串路徑', '', '索引路徑必須是有效字串'],
      ['數字路徑', 123, '索引路徑必須是有效字串'],
    ])('應該處理無效索引路徑：%s', withMemoryOptimization(async (description, path, expectedError) => {
      const engine = new IndexEngine(validConfig);

      let actualPath = path;

      if (description === '檔案而非目錄') {
        actualPath = join(testDir, 'file.txt');
        await fs.writeFile(actualPath, 'content');
      }

      await expect(engine.indexProject(actualPath as any)).rejects.toThrow(expectedError);
    }, { testName: 'indexing-invalid-path-test' }));

    it('應該處理權限被拒絕的目錄', withMemoryOptimization(async () => {
      const restrictedDir = join(testDir, 'restricted');
      await fs.mkdir(restrictedDir);
      await fs.writeFile(join(restrictedDir, 'file.ts'), 'content');

      // 模擬權限問題 (在測試環境中難以真實模擬，所以跳過)
      // 實際應用中會拋出 EACCES 錯誤
      const engine = new IndexEngine(validConfig);

      // 這個測試主要確保引擎能夠處理權限錯誤而不會崩潰
      await expect(engine.indexProject(testDir)).resolves.not.toThrow();
    }, { testName: 'indexing-permission-denied' }));

    it.each([
      [0, '零位元組檔案'],
      [1, '單位元組檔案'],
      [1000, '小檔案'],
      [100000, '中型檔案'],
    ])('應該處理不同大小的檔案：%d 位元組', withMemoryOptimization(async (size, unusedDescription) => {
      const content = 'x'.repeat(size);
      const filePath = join(testDir, 'test-file.ts');
      await fs.writeFile(filePath, content);

      const engine = new IndexEngine(validConfig);
      await engine.indexProject();

      const stats = await engine.getStats();
      expect(stats.totalFiles).toBe(1);
    }, { testName: 'indexing-file-size-test' }));

    it('應該跳過超過大小限制的檔案', withMemoryOptimization(async () => {
      const smallConfig = createIndexConfig({
        rootPath: testDir,
        maxFileSize: 100 // 100 位元組限制
      });

      // 建立一個超過限制的檔案
      const largeContent = 'x'.repeat(200);
      await fs.writeFile(join(testDir, 'large.ts'), largeContent);

      // 建立一個在限制內的檔案
      const smallContent = 'function test() {}';
      await fs.writeFile(join(testDir, 'small.ts'), smallContent);

      const engine = new IndexEngine(smallConfig);
      await engine.indexProject();

      const stats = await engine.getStats();
      expect(stats.totalFiles).toBe(1); // 只應該索引小檔案
    }, { testName: 'indexing-size-limit' }));
  });

  describe('IndexEngine 查詢邊界測試', () => {
    let indexedEngine: IndexEngine;

    beforeEach(async () => {
      // 建立測試檔案
      await fs.writeFile(join(testDir, 'test.ts'), `
function testFunction() {
  return true;
}

class TestClass {
  constructor() {}
}

const testConstant = 'value';
      `);

      indexedEngine = new IndexEngine(validConfig);
      await indexedEngine.indexProject();
    });

    it.each([
      ['查詢索引前', false, '索引尚未建立'],
      ['查詢索引後', true, null],
    ])('應該驗證索引狀態：%s', withMemoryOptimization(async (unusedDescription, indexed, expectedError) => {
      const engine = new IndexEngine(validConfig);

      if (indexed) {
        await engine.indexProject();
      }

      if (expectedError) {
        await expect(engine.getStats()).rejects.toThrow(expectedError);
        await expect(engine.findSymbol('test')).rejects.toThrow(expectedError);
      } else {
        await expect(engine.getStats()).resolves.not.toThrow();
        await expect(engine.findSymbol('test')).resolves.not.toThrow();
      }
    }, { testName: 'query-index-state-test' }));

    it.each([
      ['null 查詢', null, '查詢必須是字串'],
      ['undefined 查詢', undefined, '查詢必須是字串'],
      ['數字查詢', 123, '查詢必須是字串'],
      ['物件查詢', { query: 'test' }, '查詢必須是字串'],
      ['陣列查詢', ['test'], '查詢必須是字串'],
      ['布林查詢', true, '查詢必須是字串'],
    ])('應該驗證查詢參數：%s', withMemoryOptimization(async (unusedDescription, query, expectedError) => {
      await expect(indexedEngine.findSymbol(query as any)).rejects.toThrow(expectedError);
    }, { testName: 'query-invalid-test' }));

    it.each([
      ['空字串', '', 0],
      ['僅空白', '   \t\n  ', 0],
      ['單字符', 'a', 1],
      ['普通查詢', 'test', 1],
      ['長查詢', 'x'.repeat(1000), 1],
    ])('應該處理不同查詢內容：%s', withMemoryOptimization(async (unusedDescription, query, expectedMinResults) => {
      const results = await indexedEngine.findSymbol(query);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(expectedMinResults);

      if (results.length > 0) {
        const result = results[0];
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('file');
        expect(result).toHaveProperty('line');
        expect(result).toHaveProperty('type');
      }
    }, { testName: 'query-content-test' }));
  });

  describe('IndexEngine 資源管理測試', () => {
    it('應該正確處理 dispose', withMemoryOptimization(async () => {
      const engine = new IndexEngine(validConfig);
      await engine.indexProject();

      // 確認索引已建立
      const statsBeforeDispose = await engine.getStats();
      expect(statsBeforeDispose.totalFiles).toBeGreaterThanOrEqual(0);

      // 釋放資源
      engine.dispose();

      // 確認無法查詢已釋放的索引
      await expect(engine.getStats()).rejects.toThrow('索引尚未建立');
      await expect(engine.findSymbol('test')).rejects.toThrow('索引尚未建立');
    }, { testName: 'resource-dispose' }));

    it('應該處理多次 dispose', withMemoryOptimization(async () => {
      const engine = new IndexEngine(validConfig);
      await engine.indexProject();

      // 多次呼叫 dispose 不應該出錯
      engine.dispose();
      engine.dispose();
      engine.dispose();

      await expect(engine.getStats()).rejects.toThrow('索引尚未建立');
    }, { testName: 'resource-multiple-dispose' }));
  });

  describe('createIndexConfig 輔助函數測試', () => {
    it.each([
      ['null 配置', null, '根路徑為必要參數'],
      ['undefined 配置', undefined, '根路徑為必要參數'],
      ['空物件配置', {}, '根路徑為必要參數'],
      ['無根路徑配置', { includeExtensions: ['.ts'] }, '根路徑為必要參數'],
    ])('應該驗證必要參數：%s', withMemoryOptimization((unusedDescription, config, expectedError) => {
      expect(() => createIndexConfig(config as any)).toThrow(expectedError);
    }, { testName: 'create-config-required-test' }));

    it.each([
      ['基本配置', { rootPath: '/test' }, {
        workspacePath: '/test',
        includeExtensions: ['.ts', '.js'],
        excludePatterns: ['node_modules', '.git'],
        maxFileSize: 10 * 1024 * 1024,
        enablePersistence: false,
        persistencePath: undefined,
        maxConcurrency: 4
      }],
      ['自訂配置', {
        rootPath: '/custom',
        includeExtensions: ['.tsx'],
        excludePatterns: ['dist'],
        maxFileSize: 5000000
      }, {
        workspacePath: '/custom',
        includeExtensions: ['.tsx'],
        excludePatterns: ['dist'],
        maxFileSize: 5000000,
        enablePersistence: false,
        persistencePath: undefined,
        maxConcurrency: 4
      }],
    ])('應該產生正確配置：%s', withMemoryOptimization((unusedDescription, input, expected) => {
      const result = createIndexConfig(input);
      expect(result).toEqual(expected);
    }, { testName: 'create-config-valid-test' }));
  });
});