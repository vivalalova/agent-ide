/**
 * 重新命名引擎測試
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RenameEngine } from '../../../src/core/rename/rename-engine';
import { createRenameOptions, createRenameOperation } from '../../../src/core/rename/types';
import { createSymbol, SymbolType } from '../../../src/shared/types/symbol';
import { createLocation, createRange, createPosition } from '../../../src/shared/types/core';

describe('RenameEngine', () => {
  let renameEngine: RenameEngine;

  beforeEach(() => {
    // Mock fs module for testing
    vi.doMock('fs/promises', () => ({
      readFile: vi.fn().mockImplementation((filePath: string) => {
        if (filePath === '/test/file.ts') {
          return Promise.resolve('const oldName = "test"; console.log(oldName);');
        }
        if (filePath === '/src/file2.ts') {
          return Promise.resolve('export { oldName } from "./file1";');
        }
        if (filePath === '/test/consumer1.ts') {
          return Promise.resolve('import { exportedFunc } from "./source";');
        }
        if (filePath === '/test/consumer2.ts') {
          return Promise.resolve('import { exportedFunc } from "./source";');
        }
        if (filePath === '/test/source.ts') {
          return Promise.resolve('export function exportedFunc() {}');
        }
        return Promise.reject(new Error('File not found'));
      }),
      writeFile: vi.fn().mockResolvedValue(undefined)
    }));

    renameEngine = new RenameEngine();
  });

  describe('基本重新命名功能', () => {
    it('應該能重新命名一個簡單的變數', async () => {
      // Arrange - 準備測試資料
      const location = createLocation(
        '/test/file.ts',
        createRange(
          createPosition(1, 7),
          createPosition(1, 14)
        )
      );

      const symbol = createSymbol('oldName', SymbolType.Variable, location);
      const options = createRenameOptions(symbol, 'newName', ['/test/file.ts']);

      // Act - 執行重新命名
      const result = await renameEngine.rename(options);

      // Assert - 驗證結果
      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(2); // 檔案中有兩個 oldName
      expect(result.operations[0].oldText).toBe('oldName');
      expect(result.operations[0].newText).toBe('newName');
      expect(result.affectedFiles).toContain('/test/file.ts');
      expect(result.renameId).toBeDefined();
    });

    it('應該在新名稱為空時拒絕重新命名', async () => {
      // Arrange
      const location = createLocation(
        '/test/file.ts',
        createRange(createPosition(1, 1), createPosition(1, 8))
      );
      const symbol = createSymbol('oldName', SymbolType.Variable, location);

      // Act & Assert - 期望拋出例外
      await expect(async () => {
        const options = createRenameOptions(symbol, '', ['/test/file.ts']);
        await renameEngine.rename(options);
      }).rejects.toThrow('新名稱不能為空');
    });

    it('應該在沒有檔案路徑時拒絕重新命名', async () => {
      // Arrange
      const location = createLocation(
        '/test/file.ts',
        createRange(createPosition(1, 1), createPosition(1, 8))
      );
      const symbol = createSymbol('oldName', SymbolType.Variable, location);

      // Act & Assert - 期望拋出例外
      await expect(async () => {
        const options = createRenameOptions(symbol, 'newName', []);
        await renameEngine.rename(options);
      }).rejects.toThrow('必須指定至少一個檔案路徑');
    });
  });

  describe('驗證功能', () => {
    it('應該能驗證重新命名的有效性', async () => {
      // Arrange
      const location = createLocation(
        '/test/file.ts',
        createRange(createPosition(1, 1), createPosition(1, 8))
      );
      const symbol = createSymbol('validName', SymbolType.Variable, location);
      const options = createRenameOptions(symbol, 'anotherValidName', ['/test/file.ts']);

      // Act
      const validation = await renameEngine.validateRename(options);

      // Assert
      expect(validation.isValid).toBe(true);
      expect(validation.conflicts).toHaveLength(0);
    });

    it('應該檢測到保留字衝突', async () => {
      // Arrange
      const location = createLocation(
        '/test/file.ts',
        createRange(createPosition(1, 1), createPosition(1, 8))
      );
      const symbol = createSymbol('myVar', SymbolType.Variable, location);
      const options = createRenameOptions(symbol, 'function', ['/test/file.ts']); // 'function' 是保留字

      // Act
      const validation = await renameEngine.validateRename(options);

      // Assert
      expect(validation.isValid).toBe(false);
      expect(validation.conflicts).toHaveLength(1);
      expect(validation.conflicts[0].type).toBe('reserved_keyword');
    });
  });

  describe('預覽功能', () => {
    it('應該能預覽重新命名操作', async () => {
      // Arrange
      const location = createLocation(
        '/test/file.ts',
        createRange(createPosition(1, 1), createPosition(1, 8))
      );
      const symbol = createSymbol('oldName', SymbolType.Variable, location);
      const options = createRenameOptions(symbol, 'newName', ['/test/file.ts']);

      // Act
      const preview = await renameEngine.previewRename(options);

      // Assert
      expect(preview.operations).toHaveLength(1);
      expect(preview.affectedFiles).toContain('/test/file.ts');
      expect(preview.conflicts).toHaveLength(0);
      expect(preview.summary.totalReferences).toBeGreaterThan(0);
    });
  });

  describe('批次重新命名功能', () => {
    it('應該能執行批次重新命名操作', async () => {
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
      const result = await renameEngine.batchRename(operations);

      // Assert
      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.totalOperations).toBeGreaterThan(0);
    });

    it('應該在批次操作失敗時回傳錯誤', async () => {
      // Arrange - 空操作陣列
      const operations: any[] = [];

      // Act
      const result = await renameEngine.batchRename(operations);

      // Assert
      expect(result).toBeDefined();
      expect(result.totalOperations).toBe(0);
    });
  });

  describe('跨檔案重新命名功能', () => {
    it('應該能執行跨檔案重新命名', async () => {
      // Arrange
      const location = createLocation(
        '/test/source.ts',
        createRange(createPosition(1, 1), createPosition(1, 10))
      );
      const symbol = createSymbol('exportedFunc', SymbolType.Function, location);
      const projectFiles = ['/test/source.ts', '/test/consumer1.ts', '/test/consumer2.ts'];

      // Act
      const result = await (renameEngine as any).renameAcrossFiles(
        symbol,
        'renamedFunc',
        projectFiles
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.affectedFiles.length).toBeGreaterThan(0);
    });
  });

  describe('撤銷功能', () => {
    it('應該能撤銷重新命名操作', async () => {
      // Arrange - 先執行一個重新命名
      const location = createLocation(
        '/test/file.ts',
        createRange(createPosition(1, 1), createPosition(1, 8))
      );
      const symbol = createSymbol('oldName', SymbolType.Variable, location);
      const options = createRenameOptions(symbol, 'newName', ['/test/file.ts']);

      const renameResult = await renameEngine.rename(options);
      expect(renameResult.success).toBe(true);

      // Act - 撤銷操作
      await expect(renameEngine.undo(renameResult.renameId)).resolves.not.toThrow();
    });

    it('應該在撤銷不存在的操作時拋出錯誤', async () => {
      // Act & Assert
      await expect(renameEngine.undo('non-existent-id')).rejects.toThrow();
    });
  });

  describe('衝突檢測', () => {
    it('應該檢測到更多類型的衝突', async () => {
      // Arrange
      const location = createLocation(
        '/test/file.ts',
        createRange(createPosition(1, 1), createPosition(1, 8))
      );
      const symbol = createSymbol('myVar', SymbolType.Variable, location);

      // Act & Assert - 測試無效識別符
      const options1 = createRenameOptions(symbol, '123invalid', ['/test/file.ts']);
      const validation1 = await renameEngine.validateRename(options1);
      expect(validation1.isValid).toBe(false);
      expect(validation1.conflicts.some(c => c.type === 'invalid_identifier')).toBe(true);

      // Act & Assert - 測試保留字
      const options2 = createRenameOptions(symbol, 'class', ['/test/file.ts']);
      const validation2 = await renameEngine.validateRename(options2);
      expect(validation2.isValid).toBe(false);
      expect(validation2.conflicts.some(c => c.type === 'reserved_keyword')).toBe(true);
    });
  });
});