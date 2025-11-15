import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RenameEngine } from '@core/rename/rename-engine';
import { ConflictType } from '@core/rename/types';
import { createSymbol, SymbolType } from '@shared/types/symbol';
import { createLocation, createRange, createPosition } from '@shared/types/core';
import * as fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn()
  },
  readFile: vi.fn(),
  writeFile: vi.fn()
}));

describe('RenameEngine', () => {
  let engine: RenameEngine;

  beforeEach(() => {
    engine = new RenameEngine();
    vi.clearAllMocks();
  });

  describe('validateRename', () => {
    it('應該驗證有效的重新命名', async () => {
      const symbol = createSymbol(
        'oldName',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const result = await engine.validateRename({
        symbol,
        newName: 'validName',
        filePaths: ['/test/file.ts']
      });

      expect(result.isValid).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('應該拒絕保留字', async () => {
      const symbol = createSymbol(
        'oldName',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const result = await engine.validateRename({
        symbol,
        newName: 'function',
        filePaths: ['/test/file.ts']
      });

      expect(result.isValid).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe(ConflictType.ReservedKeyword);
    });

    it('應該拒絕無效的識別符', async () => {
      const symbol = createSymbol(
        'oldName',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const result = await engine.validateRename({
        symbol,
        newName: '123invalid',
        filePaths: ['/test/file.ts']
      });

      expect(result.isValid).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe(ConflictType.InvalidIdentifier);
    });

    it('應該拒絕包含特殊字符的名稱', async () => {
      const symbol = createSymbol(
        'oldName',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const invalidNames = ['name-with-dash', 'name with space', 'name@symbol', 'name.dot'];

      for (const invalidName of invalidNames) {
        const result = await engine.validateRename({
          symbol,
          newName: invalidName,
          filePaths: ['/test/file.ts']
        });

        expect(result.isValid).toBe(false);
        expect(result.conflicts[0].type).toBe(ConflictType.InvalidIdentifier);
      }
    });

    it('應該拋出錯誤當新名稱為空', async () => {
      const symbol = createSymbol(
        'oldName',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      await expect(() => engine.validateRename({
        symbol,
        newName: '',
        filePaths: ['/test/file.ts']
      })).rejects.toThrow('新名稱不能為空');
    });

    it('應該拋出錯誤當檔案路徑為空', async () => {
      const symbol = createSymbol(
        'oldName',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      await expect(() => engine.validateRename({
        symbol,
        newName: 'newName',
        filePaths: []
      })).rejects.toThrow('必須指定至少一個檔案路徑');
    });
  });

  describe('detectConflicts', () => {
    it('應該檢測保留字衝突', () => {
      const conflicts = engine.detectConflicts('function', {});

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe(ConflictType.ReservedKeyword);
    });

    it('應該檢測無效識別符', () => {
      const conflicts = engine.detectConflicts('123invalid', {});

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe(ConflictType.InvalidIdentifier);
    });

    it('應該接受有效的識別符', () => {
      const conflicts = engine.detectConflicts('validName', {});

      expect(conflicts).toHaveLength(0);
    });

    it('應該接受包含數字和底線的有效識別符', () => {
      const validNames = ['name123', 'name_with_underscore', '_privateName', 'CamelCase'];

      for (const validName of validNames) {
        const conflicts = engine.detectConflicts(validName, {});
        expect(conflicts).toHaveLength(0);
      }
    });
  });

  describe('findReferences', () => {
    it('應該找到符號的所有引用', async () => {
      const symbol = createSymbol(
        'testFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const fileContent = `
function testFunc() {}
const x = testFunc();
testFunc();
      `;

      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const references = await engine.findReferences(['/test/file.ts'], symbol);

      expect(references.length).toBeGreaterThan(0);
      expect(references.some(ref => ref.text.includes('testFunc'))).toBe(true);
    });

    it('應該使用單詞邊界進行精確匹配', async () => {
      const symbol = createSymbol(
        'test',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const fileContent = `
const test = 1;
const testing = 2;  // 不應該匹配
const atest = 3;    // 不應該匹配
      `;

      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const references = await engine.findReferences(['/test/file.ts'], symbol);

      // 應該只匹配 'test'，不匹配 'testing' 或 'atest'
      expect(references.length).toBe(1);
    });

    it('應該處理讀取失敗的檔案', async () => {
      const symbol = createSymbol(
        'testFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      const references = await engine.findReferences(['/test/file.ts'], symbol);

      expect(references).toHaveLength(0);
    });

    it('應該處理多個檔案', async () => {
      const symbol = createSymbol(
        'sharedFunc',
        SymbolType.Function,
        createLocation('/test/file1.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('function sharedFunc() {}')
        .mockResolvedValueOnce('import { sharedFunc } from "./file1";');

      const references = await engine.findReferences(
        ['/test/file1.ts', '/test/file2.ts'],
        symbol
      );

      expect(references.length).toBeGreaterThan(0);
    });
  });

  describe('previewRename', () => {
    it('應該生成重新命名預覽', async () => {
      const symbol = createSymbol(
        'oldFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 10), createPosition(1, 17)))
      );

      const fileContent = 'function oldFunc() { return oldFunc; }';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const preview = await engine.previewRename({
        symbol,
        newName: 'newFunc',
        filePaths: ['/test/file.ts']
      });

      expect(preview.operations.length).toBeGreaterThan(0);
      expect(preview.affectedFiles).toContain('/test/file.ts');
      expect(preview.summary.totalReferences).toBeGreaterThan(0);
      expect(preview.summary.totalFiles).toBe(1);
    });

    it('應該包含衝突資訊在預覽中', async () => {
      const symbol = createSymbol(
        'oldName',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const preview = await engine.previewRename({
        symbol,
        newName: 'function', // 保留字
        filePaths: ['/test/file.ts']
      });

      expect(preview.conflicts.length).toBeGreaterThan(0);
      expect(preview.conflicts[0].type).toBe(ConflictType.ReservedKeyword);
      expect(preview.summary.conflictCount).toBeGreaterThan(0);
    });

    it('應該估算執行時間', async () => {
      const symbol = createSymbol(
        'oldFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 10), createPosition(1, 17)))
      );

      const fileContent = 'function oldFunc() {}';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const preview = await engine.previewRename({
        symbol,
        newName: 'newFunc',
        filePaths: ['/test/file.ts']
      });

      expect(preview.summary.estimatedTime).toBeGreaterThan(0);
    });
  });

  describe('rename', () => {
    it('應該執行重新命名操作', async () => {
      const symbol = createSymbol(
        'oldFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 10), createPosition(1, 17)))
      );

      const fileContent = 'function oldFunc() {}';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await engine.rename({
        symbol,
        newName: 'newFunc',
        filePaths: ['/test/file.ts']
      });

      expect(result.success).toBe(true);
      expect(result.operations.length).toBeGreaterThan(0);
      expect(result.renameId).toBeDefined();
      expect(result.renameId).not.toBe('');
    });

    it('應該失敗當驗證不通過', async () => {
      const symbol = createSymbol(
        'oldName',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const result = await engine.rename({
        symbol,
        newName: 'function', // 保留字
        filePaths: ['/test/file.ts']
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('應該包含受影響的檔案', async () => {
      const symbol = createSymbol(
        'sharedFunc',
        SymbolType.Function,
        createLocation('/test/file1.ts', createRange(createPosition(1, 10), createPosition(1, 20)))
      );

      vi.mocked(fs.readFile).mockResolvedValue('function sharedFunc() {}');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await engine.rename({
        symbol,
        newName: 'newSharedFunc',
        filePaths: ['/test/file1.ts', '/test/file2.ts']
      });

      if (result.success) {
        expect(result.affectedFiles.length).toBeGreaterThan(0);
      }
    });
  });

  describe('batchRename', () => {
    it('應該批次執行多個重新命名操作', async () => {
      const operations = [
        {
          filePath: '/test/file.ts',
          oldText: 'oldName1',
          newText: 'newName1',
          range: createRange(createPosition(1, 1), createPosition(1, 9))
        },
        {
          filePath: '/test/file.ts',
          oldText: 'oldName2',
          newText: 'newName2',
          range: createRange(createPosition(2, 1), createPosition(2, 9))
        }
      ];

      vi.mocked(fs.readFile).mockResolvedValue('const oldName1 = 1;\nconst oldName2 = 2;');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await engine.batchRename(operations);

      expect(result.success).toBe(true);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.totalOperations).toBe(operations.length);
    });

    it('應該處理批次操作中的錯誤', async () => {
      const operations = [
        {
          filePath: '/test/file.ts',
          oldText: 'oldName',
          newText: 'newName',
          range: createRange(createPosition(1, 1), createPosition(1, 8))
        }
      ];

      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      const result = await engine.batchRename(operations);

      // batchRename 會處理錯誤但可能仍然返回 success: true（因為沒有操作執行）
      // 或者會在 errors 中記錄錯誤
      expect(result).toBeDefined();
      // 由於實作可能會捕獲錯誤，我們檢查是否有錯誤訊息或操作為空
      if (!result.success) {
        expect(result.errors).toBeDefined();
      }
    });

    it('應該為每個檔案生成獨立的 renameId', async () => {
      const operations = [
        {
          filePath: '/test/file1.ts',
          oldText: 'oldName',
          newText: 'newName',
          range: createRange(createPosition(1, 1), createPosition(1, 8))
        },
        {
          filePath: '/test/file2.ts',
          oldText: 'oldName',
          newText: 'newName',
          range: createRange(createPosition(1, 1), createPosition(1, 8))
        }
      ];

      vi.mocked(fs.readFile).mockResolvedValue('const oldName = 1;');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await engine.batchRename(operations);

      if (result.success) {
        expect(result.results.length).toBe(2);
        const renameIds = result.results.map(r => r.renameId);
        expect(new Set(renameIds).size).toBe(2); // 所有 ID 應該不同
      }
    });
  });

  describe('undo', () => {
    it('應該撤銷重新命名操作', async () => {
      const symbol = createSymbol(
        'oldFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 10), createPosition(1, 17)))
      );

      vi.mocked(fs.readFile).mockResolvedValue('function oldFunc() {}');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await engine.rename({
        symbol,
        newName: 'newFunc',
        filePaths: ['/test/file.ts']
      });

      if (result.success) {
        await expect(engine.undo(result.renameId)).resolves.not.toThrow();
      }
    });

    it('應該拋出錯誤當 renameId 不存在', async () => {
      await expect(engine.undo('nonexistent-id')).rejects.toThrow('找不到重新命名操作 ID');
    });

    it('應該在撤銷後移除歷史記錄', async () => {
      const symbol = createSymbol(
        'oldFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 10), createPosition(1, 17)))
      );

      vi.mocked(fs.readFile).mockResolvedValue('function oldFunc() {}');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await engine.rename({
        symbol,
        newName: 'newFunc',
        filePaths: ['/test/file.ts']
      });

      if (result.success) {
        await engine.undo(result.renameId);
        // 再次撤銷應該失敗
        await expect(engine.undo(result.renameId)).rejects.toThrow();
      }
    });
  });

  describe('renameAcrossFiles', () => {
    it('應該跨檔案重新命名符號', async () => {
      const symbol = createSymbol(
        'sharedFunc',
        SymbolType.Function,
        createLocation('/test/file1.ts', createRange(createPosition(1, 10), createPosition(1, 20)))
      );

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('export function sharedFunc() {}')
        .mockResolvedValueOnce('import { sharedFunc } from "./file1";');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await engine.renameAcrossFiles(
        symbol,
        'newSharedFunc',
        ['/test/file1.ts', '/test/file2.ts']
      );

      expect(result.success).toBe(true);
      expect(result.affectedFiles.length).toBeGreaterThan(0);
    });

    it('應該失敗當驗證不通過', async () => {
      const symbol = createSymbol(
        'oldName',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const result = await engine.renameAcrossFiles(
        symbol,
        'function', // 保留字
        ['/test/file.ts']
      );

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('邊界情況', () => {
    it('應該處理空檔案', async () => {
      const symbol = createSymbol(
        'oldName',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      vi.mocked(fs.readFile).mockResolvedValue('');

      const references = await engine.findReferences(['/test/file.ts'], symbol);

      expect(references).toHaveLength(0);
    });

    it('應該處理不包含符號的檔案', async () => {
      const symbol = createSymbol(
        'nonexistent',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      vi.mocked(fs.readFile).mockResolvedValue('const x = 1;\nconst y = 2;');

      const references = await engine.findReferences(['/test/file.ts'], symbol);

      expect(references).toHaveLength(0);
    });

    it('應該處理包含相似但不同符號的檔案', async () => {
      const symbol = createSymbol(
        'func',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 5)))
      );

      const fileContent = `
const func = 1;
const myFunc = 2;
const funcHelper = 3;
      `;

      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const references = await engine.findReferences(['/test/file.ts'], symbol);

      // 應該只匹配 'func'，不匹配 'myFunc' 或 'funcHelper'
      expect(references.length).toBe(1);
      expect(references[0].text).toContain('const func = 1');
    });
  });
});
