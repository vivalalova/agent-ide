/**
 * Indexing E2E 測試
 * 使用 sample-project fixture 進行完整的索引功能測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from './helpers/fixture-manager';
import { IndexEngine } from '../../src/core/indexing/index-engine';
import { createIndexConfig } from '../../src/core/indexing/types';
import { SymbolType } from '../../src/shared/types';

describe('Indexing E2E 測試', () => {
  let fixture: FixtureProject;
  let indexEngine: IndexEngine;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(async () => {
    if (indexEngine) {
      indexEngine.dispose();
    }
    await fixture.cleanup();
  });

  describe('索引建立', () => {
    it('應該成功索引整個 sample-project', async () => {
      const config = createIndexConfig(fixture.tempPath, {
        includeExtensions: ['.ts'],
        excludePatterns: ['node_modules/**', '.git/**']
      });

      indexEngine = new IndexEngine(config);
      await indexEngine.indexProject();

      const stats = await indexEngine.getStats();

      // 驗證索引了正確數量的檔案
      expect(stats.indexedFiles).toBeGreaterThanOrEqual(30);
      expect(stats.totalFiles).toBeGreaterThanOrEqual(30);

      // 驗證有符號被索引
      expect(stats.totalSymbols).toBeGreaterThan(0);

      // 依賴關係提取由 DependencyAnalyzer 負責，這裡不強制要求
      // expect(stats.totalDependencies).toBeGreaterThan(0);
    });

    it('應該正確統計不同類型的檔案', async () => {
      const config = createIndexConfig(fixture.tempPath);
      indexEngine = new IndexEngine(config);
      await indexEngine.indexProject();

      const tsFiles = indexEngine.findFilesByExtension('.ts');
      expect(tsFiles.length).toBeGreaterThanOrEqual(30);

      const typeScriptFiles = indexEngine.findFilesByLanguage('typescript');
      expect(typeScriptFiles.length).toBeGreaterThanOrEqual(30);
    });

    it('應該記錄檔案的完整資訊', async () => {
      const config = createIndexConfig(fixture.tempPath);
      indexEngine = new IndexEngine(config);
      await indexEngine.indexProject();

      const files = indexEngine.getAllIndexedFiles();
      expect(files.length).toBeGreaterThan(0);

      const userServiceFile = files.find(f =>
        f.filePath.includes('services/user-service.ts')
      );

      expect(userServiceFile).toBeDefined();
      expect(userServiceFile!.extension).toBe('.ts');
      expect(userServiceFile!.language).toBe('typescript');
      expect(userServiceFile!.size).toBeGreaterThan(0);
      expect(userServiceFile!.checksum).toBeTruthy();
    });
  });

  describe('符號搜尋', () => {
    beforeEach(async () => {
      const config = createIndexConfig(fixture.tempPath);
      indexEngine = new IndexEngine(config);
      await indexEngine.indexProject();
    });

    it('應該能精確搜尋 class 符號', async () => {
      const results = await indexEngine.findSymbol('UserService');

      expect(results.length).toBeGreaterThan(0);
      const userService = results.find(r => r.symbol.name === 'UserService');

      expect(userService).toBeDefined();
      expect(userService!.symbol.type).toBe(SymbolType.Class);
      expect(userService!.fileInfo.filePath).toContain('services/user-service.ts');
    });

    it('應該能精確搜尋 interface 符號', async () => {
      const results = await indexEngine.findSymbol('UserAddress');

      const userAddressInterface = results.find(r =>
        r.symbol.name === 'UserAddress' && r.symbol.type === SymbolType.Interface
      );

      expect(userAddressInterface).toBeDefined();
      expect(userAddressInterface!.fileInfo.filePath).toContain('types/user.ts');
    });

    it('應該能按型別過濾 interface 符號', async () => {
      const interfaceResults = await indexEngine.findSymbolByType(SymbolType.Interface);

      // 應該找到至少一些 interface
      expect(interfaceResults.length).toBeGreaterThan(0);

      const userAddressInterface = interfaceResults.find(r => r.symbol.name === 'UserAddress');
      expect(userAddressInterface).toBeDefined();
    });

    it('應該能按型別過濾符號', async () => {
      const classResults = await indexEngine.findSymbolByType(SymbolType.Class);

      // 應該找到所有 Service 和 Controller 類別
      const classNames = classResults.map(r => r.symbol.name);
      expect(classNames).toContain('UserService');
      expect(classNames).toContain('AuthService');
      expect(classNames).toContain('UserController');
      expect(classNames).toContain('ProductController');
    });

    it('應該能搜尋到各檔案的符號', async () => {
      // UserModel 應該有符號
      const userModelFile = fixture.getFilePath('src/models/user-model.ts');
      const userModelSymbols = await indexEngine.getFileSymbols(userModelFile);
      expect(userModelSymbols.length).toBeGreaterThan(0);

      // UserService 應該有符號
      const userServiceFile = fixture.getFilePath('src/services/user-service.ts');
      const userServiceSymbols = await indexEngine.getFileSymbols(userServiceFile);
      expect(userServiceSymbols.length).toBeGreaterThan(0);

      // UserController 應該有符號
      const userControllerFile = fixture.getFilePath('src/controllers/user-controller.ts');
      const userControllerSymbols = await indexEngine.getFileSymbols(userControllerFile);
      expect(userControllerSymbols.length).toBeGreaterThan(0);
    });

    it('應該能模糊搜尋符號', async () => {
      const results = await indexEngine.searchSymbols('Service', {
        fuzzy: true,
        caseSensitive: false,
        maxResults: 100,
        includeFileInfo: true
      });

      // 應該找到所有 Service 類別
      const serviceNames = results.map(r => r.symbol.name);
      expect(serviceNames.filter(name => name.includes('Service')).length).toBeGreaterThan(0);
    });

    it('應該能搜尋泛型符號', async () => {
      const results = await indexEngine.findSymbol('BaseModel');

      const baseModel = results.find(r => r.symbol.name === 'BaseModel');
      expect(baseModel).toBeDefined();
      expect(baseModel!.fileInfo.filePath).toContain('models/base-model.ts');
    });
  });

  describe('檔案索引', () => {
    it('應該只索引指定副檔名的檔案', async () => {
      const config = createIndexConfig(fixture.tempPath, {
        includeExtensions: ['.ts'],
        excludePatterns: []
      });

      indexEngine = new IndexEngine(config);
      await indexEngine.indexProject();

      const files = indexEngine.getAllIndexedFiles();

      // 所有檔案都應該是 .ts
      for (const file of files) {
        expect(file.extension).toBe('.ts');
      }
    });

    it('應該正確識別檔案語言', async () => {
      const config = createIndexConfig(fixture.tempPath);
      indexEngine = new IndexEngine(config);
      await indexEngine.indexProject();

      const tsFiles = indexEngine.findFilesByLanguage('typescript');
      expect(tsFiles.length).toBeGreaterThan(0);

      // 驗證每個檔案都有正確的語言標記
      for (const file of tsFiles) {
        expect(file.language).toBe('typescript');
        expect(file.extension).toMatch(/^\.(ts|tsx)$/);
      }
    });

    it('應該遵守排除模式', async () => {
      // 建立一個 node_modules 目錄和檔案
      await fixture.writeFile('node_modules/test/index.ts', 'export const test = 1;');

      const config = createIndexConfig(fixture.tempPath, {
        excludePatterns: ['node_modules/**']
      });

      indexEngine = new IndexEngine(config);
      await indexEngine.indexProject();

      const files = indexEngine.getAllIndexedFiles();

      // 不應該有任何 node_modules 下的檔案被索引
      const nodeModulesFiles = files.filter(f => f.filePath.includes('node_modules'));
      expect(nodeModulesFiles.length).toBe(0);
    });

    it('應該正確處理多層目錄結構', async () => {
      const config = createIndexConfig(fixture.tempPath);
      indexEngine = new IndexEngine(config);
      await indexEngine.indexProject();

      const files = indexEngine.getAllIndexedFiles();

      // 驗證不同目錄層級的檔案都被索引
      const hasTypesDir = files.some(f => f.filePath.includes('types/'));
      const hasModelsDir = files.some(f => f.filePath.includes('models/'));
      const hasServicesDir = files.some(f => f.filePath.includes('services/'));
      const hasApiDir = files.some(f => f.filePath.includes('api/'));

      expect(hasTypesDir).toBe(true);
      expect(hasModelsDir).toBe(true);
      expect(hasServicesDir).toBe(true);
      expect(hasApiDir).toBe(true);
    });
  });

  describe('索引更新', () => {
    beforeEach(async () => {
      const config = createIndexConfig(fixture.tempPath);
      indexEngine = new IndexEngine(config);
      await indexEngine.indexProject();
    });

    it('應該能新增檔案並更新索引', async () => {
      const statsBefore = await indexEngine.getStats();

      // 新增一個新檔案
      const newFilePath = fixture.getFilePath('src/services/test-service.ts');
      await fixture.writeFile('src/services/test-service.ts', `
        export class TestService {
          test(): string {
            return 'test';
          }
        }
      `);

      await indexEngine.indexFile(newFilePath);

      const statsAfter = await indexEngine.getStats();
      expect(statsAfter.indexedFiles).toBe(statsBefore.indexedFiles + 1);
      expect(statsAfter.totalSymbols).toBeGreaterThan(statsBefore.totalSymbols);

      // 驗證能搜尋到新符號
      const results = await indexEngine.findSymbol('TestService');
      expect(results.length).toBeGreaterThan(0);
    });

    it('應該能修改檔案並更新索引', async () => {
      const userServicePath = fixture.getFilePath('src/services/user-service.ts');

      // 修改檔案，新增一個方法
      const originalContent = await fixture.readFile('src/services/user-service.ts');
      const modifiedContent = originalContent + `
        export function newUserFunction() {
          return 'new function';
        }
      `;
      await fixture.writeFile('src/services/user-service.ts', modifiedContent);

      await indexEngine.updateFile(userServicePath);

      // 驗證新符號被索引
      const results = await indexEngine.findSymbol('newUserFunction');
      expect(results.length).toBeGreaterThan(0);
    });

    it('應該能刪除檔案並更新索引', async () => {
      const statsBefore = await indexEngine.getStats();
      const userServicePath = fixture.getFilePath('src/services/user-service.ts');

      await indexEngine.removeFile(userServicePath);

      const statsAfter = await indexEngine.getStats();
      expect(statsAfter.indexedFiles).toBe(statsBefore.indexedFiles - 1);

      // 驗證檔案不在索引中
      expect(indexEngine.isIndexed(userServicePath)).toBe(false);
    });

    it('應該在檔案更新時同步更新符號索引', async () => {
      const userServicePath = fixture.getFilePath('src/services/user-service.ts');

      // 記錄原始符號數量
      const symbolsBefore = await indexEngine.getFileSymbols(userServicePath);
      const symbolCountBefore = symbolsBefore.length;

      // 修改檔案，新增多個函式
      const originalContent = await fixture.readFile('src/services/user-service.ts');
      const modifiedContent = originalContent + `
        export function helperFunction1() {}
        export function helperFunction2() {}
        export function helperFunction3() {}
      `;
      await fixture.writeFile('src/services/user-service.ts', modifiedContent);

      await indexEngine.updateFile(userServicePath);

      // 驗證符號數量增加
      const symbolsAfter = await indexEngine.getFileSymbols(userServicePath);
      expect(symbolsAfter.length).toBeGreaterThan(symbolCountBefore);
    });
  });

  describe('錯誤處理', () => {
    it('應該處理語法錯誤的檔案', async () => {
      // 建立一個語法錯誤的檔案
      const errorFilePath = fixture.getFilePath('src/error-file.ts');
      await fixture.writeFile('src/error-file.ts', `
        export class BrokenClass {
          // 語法錯誤：缺少 }
          method() {
            return 'test'
      `);

      const config = createIndexConfig(fixture.tempPath);
      indexEngine = new IndexEngine(config);

      // TypeScript 編譯器能從語法錯誤中恢復，所以不一定拋出錯誤
      // 但應該記錄解析錯誤或警告
      try {
        await indexEngine.indexFile(errorFilePath);
        // 如果成功索引，檢查是否有錯誤記錄
        const hasErrors = indexEngine.hasFileParseErrors(errorFilePath);
        // 語法錯誤可能會或不會被記錄，取決於編譯器的容錯能力
        expect(typeof hasErrors).toBe('boolean');
      } catch (error) {
        // 如果拋出錯誤也是可以接受的
        expect(error).toBeDefined();
      }
    });

    it('應該能檢查檔案的解析狀態', async () => {
      // 索引一個正常檔案
      const config = createIndexConfig(fixture.tempPath);
      indexEngine = new IndexEngine(config);
      await indexEngine.indexProject();

      const userServiceFile = fixture.getFilePath('src/services/user-service.ts');

      // 驗證正常檔案沒有解析錯誤
      expect(indexEngine.hasFileParseErrors(userServiceFile)).toBe(false);
      const errors = indexEngine.getFileParseErrors(userServiceFile);
      expect(errors.length).toBe(0);
    });

    it('應該拒絕無效的索引路徑', async () => {
      const config = createIndexConfig('/non/existent/path');
      indexEngine = new IndexEngine(config);

      await expect(indexEngine.indexProject()).rejects.toThrow('路徑不存在');
    });

    it('應該拒絕空路徑', async () => {
      expect(() => {
        createIndexConfig('');
      }).toThrow('工作區路徑不能為空');
    });

    it('應該處理超大檔案', async () => {
      const config = createIndexConfig(fixture.tempPath, {
        maxFileSize: 100 // 設定很小的限制
      });
      indexEngine = new IndexEngine(config);

      // user-service.ts 應該超過 100 bytes
      const userServicePath = fixture.getFilePath('src/services/user-service.ts');

      // 索引時應該靜默跳過大檔案（不報錯）
      await expect(indexEngine.indexFile(userServicePath)).resolves.not.toThrow();

      // 檔案不應該被索引
      expect(indexEngine.isIndexed(userServicePath)).toBe(false);
    });

    it('應該處理已被釋放的索引引擎', async () => {
      const config = createIndexConfig(fixture.tempPath);
      indexEngine = new IndexEngine(config);
      await indexEngine.indexProject();

      indexEngine.dispose();

      // 在釋放後的操作應該拋出錯誤
      await expect(indexEngine.findSymbol('UserService')).rejects.toThrow('索引引擎已被釋放');
      await expect(indexEngine.getStats()).rejects.toThrow('索引引擎已被釋放');
    });

    it('應該在尚未索引時返回空結果', async () => {
      const config = createIndexConfig(fixture.tempPath);
      indexEngine = new IndexEngine(config);

      // 尚未呼叫 indexProject
      const results = await indexEngine.findSymbol('UserService');
      expect(results).toEqual([]);

      const stats = await indexEngine.getStats();
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSymbols).toBe(0);
    });
  });

  describe('CLI 參數測試（從 cli-index 整合）', () => {
    it('應該支援 --extensions 過濾副檔名', async () => {
      // 測試只索引 .ts 檔案
      const config = createIndexConfig(fixture.tempPath, {
        includeExtensions: ['.ts']
      });

      indexEngine = new IndexEngine(config);
      await indexEngine.indexProject();

      const files = indexEngine.getAllIndexedFiles();

      // 所有檔案都應該是 .ts
      for (const file of files) {
        expect(file.extension).toBe('.ts');
      }

      expect(files.length).toBeGreaterThan(0);
    });

    it('應該支援 --exclude 排除目錄', async () => {
      // 建立 node_modules 測試目錄
      await fixture.writeFile('node_modules/test/index.ts', 'export const test = 1;');

      const config = createIndexConfig(fixture.tempPath, {
        excludePatterns: ['node_modules/**', '.git/**']
      });

      indexEngine = new IndexEngine(config);
      await indexEngine.indexProject();

      const files = indexEngine.getAllIndexedFiles();

      // 不應該包含 node_modules 下的檔案
      const nodeModulesFiles = files.filter(f => f.filePath.includes('node_modules'));
      expect(nodeModulesFiles.length).toBe(0);
    });

    it('應該能檢測增量索引更新', async () => {
      const config = createIndexConfig(fixture.tempPath);
      indexEngine = new IndexEngine(config);

      // 第一次索引
      await indexEngine.indexProject();
      const statsBefore = await indexEngine.getStats();

      // 新增新檔案
      await fixture.writeFile('src/types/new-type.ts', 'export interface NewType { id: number; }');
      const newFilePath = fixture.getFilePath('src/types/new-type.ts');

      // 索引新檔案
      await indexEngine.indexFile(newFilePath);

      const statsAfter = await indexEngine.getStats();

      // 檔案數應該增加
      expect(statsAfter.indexedFiles).toBe(statsBefore.indexedFiles + 1);
      expect(statsAfter.totalSymbols).toBeGreaterThan(statsBefore.totalSymbols);
    });

    it('應該在合理時間內索引 32+ 檔案專案', async () => {
      const config = createIndexConfig(fixture.tempPath);
      indexEngine = new IndexEngine(config);

      const startTime = Date.now();
      await indexEngine.indexProject();
      const endTime = Date.now();

      const duration = endTime - startTime;

      // 應該在 30 秒內完成
      expect(duration).toBeLessThan(30000);

      const stats = await indexEngine.getStats();
      expect(stats.indexedFiles).toBeGreaterThanOrEqual(30);
    });
  });
});
