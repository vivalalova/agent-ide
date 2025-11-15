/**
 * RenameEngine + IndexEngine 整合測試
 * 測試重命名引擎與索引引擎的協作
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IndexEngine } from '@core/indexing/index-engine';
import { RenameEngine } from '@core/rename/rename-engine';
import { ParserRegistry } from '@infrastructure/parser/registry';
import { createSymbol, createPosition, createRange } from '@shared/types';
import type { Symbol } from '@shared/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import type { IndexConfig } from '@core/indexing/types';

describe('RenameEngine + IndexEngine Integration', () => {
  let indexEngine: IndexEngine;
  let renameEngine: RenameEngine;
  let tempDir: string;
  let testConfig: IndexConfig;

  beforeEach(async () => {
    vi.clearAllMocks();

    // 重置 ParserRegistry
    ParserRegistry.resetInstance();

    // 創建臨時目錄
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'agent-ide-test-'));

    // 創建測試配置
    testConfig = {
      workspacePath: tempDir,
      excludePatterns: ['node_modules/**', '.git/**'],
      includeExtensions: ['.ts', '.js'],
      maxFileSize: 1024 * 1024,
      enablePersistence: false,
      persistencePath: undefined,
      maxConcurrency: 4
    };
  });

  afterEach(async () => {
    // 清理引擎
    if (indexEngine) {
      indexEngine.dispose();
    }

    // 清理 ParserRegistry
    ParserRegistry.resetInstance();

    // 清理臨時目錄
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('清理臨時目錄失敗:', error);
    }
  });

  it('應該在重命名後正確更新索引', async () => {
    // 創建測試檔案
    const filePath = path.join(tempDir, 'test.ts');
    await fs.writeFile(
      filePath,
      'export function oldName() { return "test"; }'
    );

    // 創建並索引
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    // 獲取 ParserRegistry
    const registry = ParserRegistry.getInstance();

    // 創建 RenameEngine
    renameEngine = new RenameEngine(registry);

    // 查找舊符號
    const oldSymbols = await indexEngine.findSymbol('oldName');
    expect(oldSymbols.length).toBeGreaterThan(0);

    const symbol = oldSymbols[0].symbol;

    // 執行重命名
    const renameResult = await renameEngine.rename({
      symbol,
      newName: 'newName',
      filePaths: [filePath]
    });

    expect(renameResult.success).toBe(true);

    // 更新檔案索引
    await indexEngine.updateFile(filePath);

    // 驗證新符號存在
    const newSymbols = await indexEngine.findSymbol('newName');
    expect(newSymbols.length).toBeGreaterThan(0);

    // 驗證舊符號不存在
    const oldSymbolsAfter = await indexEngine.findSymbol('oldName');
    expect(oldSymbolsAfter.length).toBe(0);
  });

  it('應該支援跨檔案重命名並更新索引', async () => {
    // 創建多個檔案
    const file1Path = path.join(tempDir, 'file1.ts');
    const file2Path = path.join(tempDir, 'file2.ts');

    await fs.writeFile(
      file1Path,
      'export function sharedFunction() { return "shared"; }'
    );
    await fs.writeFile(
      file2Path,
      'import { sharedFunction } from "./file1"; const result = sharedFunction();'
    );

    // 創建並索引
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    // 獲取 ParserRegistry
    const registry = ParserRegistry.getInstance();

    // 創建 RenameEngine
    renameEngine = new RenameEngine(registry);

    // 查找符號
    const symbols = await indexEngine.findSymbol('sharedFunction');
    expect(symbols.length).toBeGreaterThan(0);

    const symbol = symbols[0].symbol;

    // 執行跨檔案重命名
    const renameResult = await renameEngine.renameAcrossFiles(
      symbol,
      'renamedFunction',
      [file1Path, file2Path]
    );

    expect(renameResult.success).toBe(true);
    expect(renameResult.affectedFiles.length).toBeGreaterThan(0);

    // 更新所有受影響檔案的索引
    for (const affectedFile of renameResult.affectedFiles) {
      await indexEngine.updateFile(affectedFile);
    }

    // 驗證新符號存在
    const newSymbols = await indexEngine.findSymbol('renamedFunction');
    expect(newSymbols.length).toBeGreaterThan(0);

    // 驗證舊符號不存在
    const oldSymbols = await indexEngine.findSymbol('sharedFunction');
    expect(oldSymbols.length).toBe(0);
  });

  it('應該正確處理類別成員的重命名', async () => {
    // 創建包含類別的檔案
    const filePath = path.join(tempDir, 'class.ts');
    const classContent = `
      export class UserService {
        private oldMethod() {
          return "old";
        }

        public callOldMethod() {
          return this.oldMethod();
        }
      }
    `;

    await fs.writeFile(filePath, classContent);

    // 創建並索引
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    // 獲取 ParserRegistry
    const registry = ParserRegistry.getInstance();

    // 創建 RenameEngine
    renameEngine = new RenameEngine(registry);

    // 查找方法符號
    const symbols = await indexEngine.findSymbol('oldMethod');
    expect(symbols.length).toBeGreaterThan(0);

    const symbol = symbols[0].symbol;

    // 執行重命名
    const renameResult = await renameEngine.rename({
      symbol,
      newName: 'newMethod',
      filePaths: [filePath]
    });

    expect(renameResult.success).toBe(true);

    // 更新索引
    await indexEngine.updateFile(filePath);

    // 驗證新符號存在
    const newSymbols = await indexEngine.findSymbol('newMethod');
    expect(newSymbols.length).toBeGreaterThan(0);
  });

  it('應該支援重命名預覽並驗證索引中的符號', async () => {
    // 創建測試檔案
    const filePath = path.join(tempDir, 'preview.ts');
    await fs.writeFile(
      filePath,
      'export const CONFIG_KEY = "config"; export function getConfig() { return CONFIG_KEY; }'
    );

    // 創建並索引
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    // 獲取 ParserRegistry
    const registry = ParserRegistry.getInstance();

    // 創建 RenameEngine
    renameEngine = new RenameEngine(registry);

    // 查找符號
    const symbols = await indexEngine.findSymbol('CONFIG_KEY');
    expect(symbols.length).toBeGreaterThan(0);

    const symbol = symbols[0].symbol;

    // 預覽重命名
    const preview = await renameEngine.previewRename({
      symbol,
      newName: 'SETTINGS_KEY',
      filePaths: [filePath]
    });

    expect(preview.operations.length).toBeGreaterThan(0);
    expect(preview.summary.totalReferences).toBeGreaterThan(0);
    expect(preview.conflicts.length).toBe(0);

    // 驗證預覽不會實際修改索引
    const symbolsAfterPreview = await indexEngine.findSymbol('CONFIG_KEY');
    expect(symbolsAfterPreview.length).toBeGreaterThan(0);

    const newSymbolsAfterPreview = await indexEngine.findSymbol('SETTINGS_KEY');
    expect(newSymbolsAfterPreview.length).toBe(0);
  });

  it('應該檢測和報告重命名衝突', async () => {
    // 創建測試檔案
    const filePath = path.join(tempDir, 'conflict.ts');
    const content = `
      export function myFunction() { return "test"; }
      export function existingName() { return "exists"; }
    `;

    await fs.writeFile(filePath, content);

    // 創建並索引
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    // 獲取 ParserRegistry
    const registry = ParserRegistry.getInstance();

    // 創建 RenameEngine
    renameEngine = new RenameEngine(registry);

    // 查找符號
    const symbols = await indexEngine.findSymbol('myFunction');
    expect(symbols.length).toBeGreaterThan(0);

    const symbol = symbols[0].symbol;

    // 嘗試重命名為保留字（應該失敗）
    const validation = await renameEngine.validateRename({
      symbol,
      newName: 'class', // 保留字
      filePaths: [filePath]
    });

    expect(validation.isValid).toBe(false);
    expect(validation.conflicts.length).toBeGreaterThan(0);
  });

  it('應該支援批次重命名並更新多個檔案的索引', async () => {
    // 創建測試檔案
    const filePath = path.join(tempDir, 'batch.ts');

    await fs.writeFile(
      filePath,
      'export function func1() { return "1"; } export function func2() { return "2"; }'
    );

    // 創建並索引
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    // 獲取 ParserRegistry
    const registry = ParserRegistry.getInstance();

    // 創建 RenameEngine
    renameEngine = new RenameEngine(registry);

    // 查找符號
    const func1Symbols = await indexEngine.findSymbol('func1');
    const func2Symbols = await indexEngine.findSymbol('func2');

    expect(func1Symbols.length).toBeGreaterThan(0);
    expect(func2Symbols.length).toBeGreaterThan(0);

    // 執行第一個重命名
    const result1 = await renameEngine.rename({
      symbol: func1Symbols[0].symbol,
      newName: 'renamedFunc1',
      filePaths: [filePath]
    });

    expect(result1.success).toBe(true);

    // 更新索引
    await indexEngine.updateFile(filePath);

    // 查找第二個符號（重新查找因為文件已更新）
    const func2SymbolsUpdated = await indexEngine.findSymbol('func2');

    // 執行第二個重命名
    const result2 = await renameEngine.rename({
      symbol: func2SymbolsUpdated[0].symbol,
      newName: 'renamedFunc2',
      filePaths: [filePath]
    });

    expect(result2.success).toBe(true);

    // 更新索引
    await indexEngine.updateFile(filePath);

    // 驗證新符號存在
    const renamedFunc1 = await indexEngine.findSymbol('renamedFunc1');
    const renamedFunc2 = await indexEngine.findSymbol('renamedFunc2');

    expect(renamedFunc1.length).toBeGreaterThan(0);
    expect(renamedFunc2.length).toBeGreaterThan(0);

    // 驗證舊符號不存在
    const oldFunc1 = await indexEngine.findSymbol('func1');
    const oldFunc2 = await indexEngine.findSymbol('func2');

    expect(oldFunc1.length).toBe(0);
    expect(oldFunc2.length).toBe(0);
  });

  it('應該在重命名後保持索引的一致性', async () => {
    // 創建測試檔案
    const filePath = path.join(tempDir, 'consistency.ts');
    const content = `
      export interface DataModel {
        id: number;
        name: string;
      }

      export function processData(data: DataModel): void {
        console.log(data.name);
      }

      export class DataProcessor {
        process(item: DataModel): void {
          processData(item);
        }
      }
    `;

    await fs.writeFile(filePath, content);

    // 創建並索引
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    // 獲取初始統計
    const statsBefore = await indexEngine.getStats();
    const initialSymbolCount = statsBefore.totalSymbols;

    // 獲取 ParserRegistry
    const registry = ParserRegistry.getInstance();

    // 創建 RenameEngine
    renameEngine = new RenameEngine(registry);

    // 查找並重命名 DataModel
    const symbols = await indexEngine.findSymbol('DataModel');
    expect(symbols.length).toBeGreaterThan(0);

    const symbol = symbols[0].symbol;

    // 執行重命名
    const renameResult = await renameEngine.rename({
      symbol,
      newName: 'EntityModel',
      filePaths: [filePath]
    });

    expect(renameResult.success).toBe(true);

    // 更新索引
    await indexEngine.updateFile(filePath);

    // 驗證符號總數保持一致（只是名稱改變）
    const statsAfter = await indexEngine.getStats();
    expect(statsAfter.totalSymbols).toBe(initialSymbolCount);

    // 驗證新符號存在
    const newSymbols = await indexEngine.findSymbol('EntityModel');
    expect(newSymbols.length).toBeGreaterThan(0);

    // 驗證其他符號仍然存在
    const processDataSymbols = await indexEngine.findSymbol('processData');
    const dataProcessorSymbols = await indexEngine.findSymbol('DataProcessor');

    expect(processDataSymbols.length).toBeGreaterThan(0);
    expect(dataProcessorSymbols.length).toBeGreaterThan(0);
  });
});
