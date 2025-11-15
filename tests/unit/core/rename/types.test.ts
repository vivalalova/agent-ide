import { describe, it, expect } from 'vitest';
import {
  createRenameOptions,
  createRenameOperation,
  createConflictInfo,
  isRenameOptions,
  ConflictType
} from '@core/rename/types';
import { createSymbol, SymbolType } from '@shared/types/symbol';
import { createLocation, createRange, createPosition } from '@shared/types/core';

describe('Rename Types', () => {
  describe('createRenameOptions', () => {
    it('應該創建有效的 RenameOptions', () => {
      const symbol = createSymbol(
        'testFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const options = createRenameOptions(symbol, 'newFunc', ['/test/file.ts']);

      expect(options.symbol).toBe(symbol);
      expect(options.newName).toBe('newFunc');
      expect(options.filePaths).toEqual(['/test/file.ts']);
      expect(options.position).toBeUndefined();
    });

    it('應該創建包含位置的 RenameOptions', () => {
      const symbol = createSymbol(
        'testFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );
      const position = createPosition(5, 10);

      const options = createRenameOptions(symbol, 'newFunc', ['/test/file.ts'], position);

      expect(options.position).toEqual(position);
    });

    it('應該修剪新名稱的空白', () => {
      const symbol = createSymbol(
        'testFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const options = createRenameOptions(symbol, '  newFunc  ', ['/test/file.ts']);

      expect(options.newName).toBe('newFunc');
    });

    it('應該拋出錯誤當新名稱為空', () => {
      const symbol = createSymbol(
        'testFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      expect(() => createRenameOptions(symbol, '', ['/test/file.ts'])).toThrow('新名稱不能為空');
      expect(() => createRenameOptions(symbol, '   ', ['/test/file.ts'])).toThrow('新名稱不能為空');
    });

    it('應該拋出錯誤當檔案路徑為空陣列', () => {
      const symbol = createSymbol(
        'testFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      expect(() => createRenameOptions(symbol, 'newFunc', [])).toThrow('必須指定至少一個檔案路徑');
    });
  });

  describe('createRenameOperation', () => {
    it('應該創建有效的 RenameOperation', () => {
      const range = createRange(createPosition(1, 1), createPosition(1, 10));
      const operation = createRenameOperation('/test/file.ts', 'oldName', 'newName', range);

      expect(operation.filePath).toBe('/test/file.ts');
      expect(operation.oldText).toBe('oldName');
      expect(operation.newText).toBe('newName');
      expect(operation.range).toEqual(range);
    });

    it('應該拋出錯誤當檔案路徑為空', () => {
      const range = createRange(createPosition(1, 1), createPosition(1, 10));

      expect(() => createRenameOperation('', 'oldName', 'newName', range)).toThrow('檔案路徑不能為空');
      expect(() => createRenameOperation('   ', 'oldName', 'newName', range)).toThrow('檔案路徑不能為空');
    });

    it('應該拋出錯誤當舊文字為空', () => {
      const range = createRange(createPosition(1, 1), createPosition(1, 10));

      expect(() => createRenameOperation('/test/file.ts', '', 'newName', range)).toThrow('舊文字不能為空');
      expect(() => createRenameOperation('/test/file.ts', '   ', 'newName', range)).toThrow('舊文字不能為空');
    });

    it('應該拋出錯誤當新文字為空', () => {
      const range = createRange(createPosition(1, 1), createPosition(1, 10));

      expect(() => createRenameOperation('/test/file.ts', 'oldName', '', range)).toThrow('新文字不能為空');
      expect(() => createRenameOperation('/test/file.ts', 'oldName', '   ', range)).toThrow('新文字不能為空');
    });
  });

  describe('createConflictInfo', () => {
    it('應該創建有效的 ConflictInfo', () => {
      const location = createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)));
      const conflict = createConflictInfo(ConflictType.NameCollision, '名稱衝突', location);

      expect(conflict.type).toBe(ConflictType.NameCollision);
      expect(conflict.message).toBe('名稱衝突');
      expect(conflict.location).toEqual(location);
      expect(conflict.existingSymbol).toBeUndefined();
    });

    it('應該創建包含現有符號的 ConflictInfo', () => {
      const location = createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)));
      const existingSymbol = createSymbol(
        'existing',
        SymbolType.Variable,
        createLocation('/test/file.ts', createRange(createPosition(2, 1), createPosition(2, 10)))
      );

      const conflict = createConflictInfo(ConflictType.NameCollision, '名稱衝突', location, existingSymbol);

      expect(conflict.existingSymbol).toEqual(existingSymbol);
    });

    it('應該拋出錯誤當訊息為空', () => {
      const location = createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)));

      expect(() => createConflictInfo(ConflictType.NameCollision, '', location)).toThrow('衝突訊息不能為空');
      expect(() => createConflictInfo(ConflictType.NameCollision, '   ', location)).toThrow('衝突訊息不能為空');
    });

    it('應該支援所有衝突類型', () => {
      const location = createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)));

      const types = [
        ConflictType.NameCollision,
        ConflictType.ScopeConflict,
        ConflictType.ReservedKeyword,
        ConflictType.InvalidIdentifier
      ];

      for (const type of types) {
        const conflict = createConflictInfo(type, '測試訊息', location);
        expect(conflict.type).toBe(type);
      }
    });
  });

  describe('isRenameOptions', () => {
    it('應該驗證有效的 RenameOptions', () => {
      const symbol = createSymbol(
        'testFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const options = createRenameOptions(symbol, 'newFunc', ['/test/file.ts']);

      expect(isRenameOptions(options)).toBe(true);
    });

    it('應該拒絕 null 和 undefined', () => {
      expect(isRenameOptions(null)).toBe(false);
      expect(isRenameOptions(undefined)).toBe(false);
    });

    it('應該拒絕非物件值', () => {
      expect(isRenameOptions('string')).toBe(false);
      expect(isRenameOptions(123)).toBe(false);
      expect(isRenameOptions(true)).toBe(false);
    });

    it('應該拒絕缺少 symbol 的物件', () => {
      const invalid = {
        newName: 'newFunc',
        filePaths: ['/test/file.ts']
      };

      expect(isRenameOptions(invalid)).toBe(false);
    });

    it('應該拒絕缺少 newName 的物件', () => {
      const symbol = createSymbol(
        'testFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const invalid = {
        symbol,
        filePaths: ['/test/file.ts']
      };

      expect(isRenameOptions(invalid)).toBe(false);
    });

    it('應該拒絕空的 newName', () => {
      const symbol = createSymbol(
        'testFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const invalid = {
        symbol,
        newName: '   ',
        filePaths: ['/test/file.ts']
      };

      expect(isRenameOptions(invalid)).toBe(false);
    });

    it('應該拒絕缺少 filePaths 的物件', () => {
      const symbol = createSymbol(
        'testFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const invalid = {
        symbol,
        newName: 'newFunc'
      };

      expect(isRenameOptions(invalid)).toBe(false);
    });

    it('應該拒絕非陣列的 filePaths', () => {
      const symbol = createSymbol(
        'testFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const invalid = {
        symbol,
        newName: 'newFunc',
        filePaths: 'not-an-array'
      };

      expect(isRenameOptions(invalid)).toBe(false);
    });

    it('應該拒絕空的 filePaths 陣列', () => {
      const symbol = createSymbol(
        'testFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const invalid = {
        symbol,
        newName: 'newFunc',
        filePaths: []
      };

      expect(isRenameOptions(invalid)).toBe(false);
    });
  });
});
