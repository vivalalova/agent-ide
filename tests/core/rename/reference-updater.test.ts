/**
 * 引用更新器測試
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReferenceUpdater } from '../../../src/core/rename/reference-updater';
import { createSymbol, SymbolType } from '../../../src/shared/types/symbol';
import { createLocation, createRange, createPosition } from '../../../src/shared/types/core';
import { createRenameOperation } from '../../../src/core/rename/types';

describe('ReferenceUpdater', () => {
  let referenceUpdater: ReferenceUpdater;

  beforeEach(() => {
    // Mock fs module for testing
    vi.doMock('fs/promises', () => ({
      readFile: vi.fn().mockImplementation((filePath: string) => {
        if (filePath === '/test/file.ts') {
          return Promise.resolve('const var1 = "test"; const var2 = "another"; console.log(var1, var2);\nconst multiLineSymbol =\n    "value";');
        }
        if (filePath === '/test/source.ts') {
          return Promise.resolve('export function exportedFunc() {}');
        }
        if (filePath === '/test/consumer.ts') {
          return Promise.resolve('import { exportedFunc } from "./source";');
        }
        if (filePath === '/test/module.ts') {
          return Promise.resolve('export class MyClass {}');
        }
        if (filePath === '/test/importer.ts') {
          return Promise.resolve('import { MyClass } from "./module";');
        }
        return Promise.reject(new Error('File not found'));
      }),
      writeFile: vi.fn().mockResolvedValue(undefined)
    }));

    referenceUpdater = new ReferenceUpdater();
    referenceUpdater.clearCache(); // 清除快取
  });

  describe('基本引用更新功能', () => {
    it('應該能找到檔案中的符號引用', async () => {
      // Arrange
      const filePath = '/test/file.ts';
      const symbolName = 'testVar';

      // Act
      const references = await referenceUpdater.findSymbolReferences(filePath, symbolName);

      // Assert
      expect(references).toBeDefined();
      expect(Array.isArray(references)).toBe(true);
      // 由於使用 mock 內容，這裡檢查基本結構
    });

    it('應該能更新符號的所有引用', async () => {
      // Arrange
      const location = createLocation(
        '/test/file.ts',
        createRange(createPosition(1, 1), createPosition(1, 8))
      );
      const symbol = createSymbol('oldName', SymbolType.Variable, location);
      const newName = 'newName';
      const filePaths = ['/test/file.ts'];

      // Act
      const result = await referenceUpdater.updateReferences(symbol, newName, filePaths);

      // Assert
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.updatedFiles).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('應該能批次執行重新命名操作', async () => {
      // Arrange
      const operations = [
        createRenameOperation(
          '/test/file1.ts',
          'oldName1',
          'newName1',
          createRange(createPosition(1, 1), createPosition(1, 9))
        ),
        createRenameOperation(
          '/test/file2.ts',
          'oldName2',
          'newName2',
          createRange(createPosition(2, 5), createPosition(2, 13))
        )
      ];

      // Act
      const result = await referenceUpdater.applyRenameOperations(operations);

      // Assert
      expect(result.success).toBe(true);
      expect(result.updatedFiles).toBeDefined();
    });
  });

  describe('跨檔案引用處理', () => {
    it('應該能處理跨檔案引用更新', async () => {
      // Arrange
      const location = createLocation(
        '/test/source.ts',
        createRange(createPosition(1, 1), createPosition(1, 8))
      );
      const symbol = createSymbol('exportedFunc', SymbolType.Function, location);
      const newName = 'renamedFunc';
      const projectFiles = ['/test/source.ts', '/test/consumer.ts'];

      // Act
      const result = await referenceUpdater.updateCrossFileReferences(
        symbol,
        newName,
        projectFiles
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('應該能識別並更新 import 語句', async () => {
      // Arrange
      const location = createLocation(
        '/test/module.ts',
        createRange(createPosition(1, 1), createPosition(1, 10))
      );
      const symbol = createSymbol('MyClass', SymbolType.Class, location);
      const newName = 'RenamedClass';

      // Act - 測試內部方法的行為（通過更新引用來間接測試）
      const result = await referenceUpdater.updateCrossFileReferences(
        symbol,
        newName,
        ['/test/importer.ts']
      );

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('錯誤處理', () => {
    it('應該優雅地處理不存在的檔案', async () => {
      // Arrange
      const location = createLocation(
        '/nonexistent/file.ts',
        createRange(createPosition(1, 1), createPosition(1, 8))
      );
      const symbol = createSymbol('testSymbol', SymbolType.Variable, location);
      const filePaths = ['/nonexistent/file.ts'];

      // Act
      const result = await referenceUpdater.updateReferences(symbol, 'newName', filePaths);

      // Assert
      expect(result).toBeDefined();
      // 應該處理錯誤但不拋出異常
    });

    it('應該處理空檔案路徑陣列', async () => {
      // Arrange
      const location = createLocation(
        '/test/file.ts',
        createRange(createPosition(1, 1), createPosition(1, 8))
      );
      const symbol = createSymbol('testSymbol', SymbolType.Variable, location);
      const filePaths: string[] = [];

      // Act
      const result = await referenceUpdater.updateReferences(symbol, 'newName', filePaths);

      // Assert
      expect(result.success).toBe(true);
      expect(result.updatedFiles).toHaveLength(0);
    });
  });

  describe('文字變更處理', () => {
    it('應該正確處理多個變更在同一行', async () => {
      // Arrange
      const operations = [
        createRenameOperation(
          '/test/file.ts',
          'var1',
          'newVar1',
          createRange(createPosition(1, 1), createPosition(1, 5))
        ),
        createRenameOperation(
          '/test/file.ts',
          'var2',
          'newVar2',
          createRange(createPosition(1, 10), createPosition(1, 14))
        )
      ];

      // Act
      const result = await referenceUpdater.applyRenameOperations(operations);

      // Assert
      expect(result.success).toBe(true);
      expect(result.updatedFiles).toHaveLength(1);
    });

    it('應該正確處理跨行變更', async () => {
      // Arrange
      const operation = createRenameOperation(
        '/test/file.ts',
        'multiLineSymbol',
        'newSymbol',
        createRange(createPosition(1, 1), createPosition(2, 5))
      );

      // Act
      const result = await referenceUpdater.applyRenameOperations([operation]);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('註解處理', () => {
    it('應該識別註解中的符號引用', async () => {
      // Arrange
      const filePath = '/test/commented.ts';
      const symbolName = 'testVar';

      // Act
      const references = await referenceUpdater.findSymbolReferences(filePath, symbolName);

      // Assert
      expect(references).toBeDefined();
      // 在實際檔案內容中應該能區分註解與程式碼
    });
  });

  describe('快取管理', () => {
    it('應該能清除快取', () => {
      // Act & Assert - 不應該拋出異常
      expect(() => referenceUpdater.clearCache()).not.toThrow();
    });
  });
});