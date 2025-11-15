import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MoveOperationType,
  PathType,
  createFullMoveOperation,
  createValidationError,
  createMoveError,
  isFullMoveOperation,
  isImportStatement
} from '@core/move/types';
import { createPosition, createRange } from '@shared/types/core';

describe('Move Types', () => {
  describe('createFullMoveOperation', () => {
    it('應該建立完整的 MoveOperation', () => {
      const source = '/path/to/source.ts';
      const destination = '/path/to/dest.ts';
      const operation = createFullMoveOperation(MoveOperationType.FILE, source, destination);

      expect(operation.type).toBe(MoveOperationType.FILE);
      expect(operation.source).toBe(source);
      expect(operation.destination).toBe(destination);
      expect(operation.id).toBeDefined();
      expect(operation.id).toMatch(/^move_\d+_\w+$/);
      expect(operation.timestamp).toBeInstanceOf(Date);
    });

    it('應該建立不同的 ID 給不同的操作', () => {
      const op1 = createFullMoveOperation(MoveOperationType.FILE, '/a.ts', '/b.ts');
      const op2 = createFullMoveOperation(MoveOperationType.FILE, '/a.ts', '/b.ts');

      expect(op1.id).not.toBe(op2.id);
    });

    it('應該支援目錄類型的移動操作', () => {
      const operation = createFullMoveOperation(
        MoveOperationType.DIRECTORY,
        '/src/old',
        '/src/new'
      );

      expect(operation.type).toBe(MoveOperationType.DIRECTORY);
    });

    it('應該設定當前時間戳', () => {
      const beforeTime = new Date();
      const operation = createFullMoveOperation(MoveOperationType.FILE, '/a.ts', '/b.ts');
      const afterTime = new Date();

      expect(operation.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(operation.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('createValidationError', () => {
    it('應該建立 source_not_found 錯誤', () => {
      const error = createValidationError('source_not_found', 'Source file not found', '/path/to/file.ts');

      expect(error.type).toBe('source_not_found');
      expect(error.message).toBe('Source file not found');
      expect(error.path).toBe('/path/to/file.ts');
    });

    it('應該建立 destination_exists 錯誤', () => {
      const error = createValidationError('destination_exists', 'Destination already exists');

      expect(error.type).toBe('destination_exists');
      expect(error.message).toBe('Destination already exists');
      expect(error.path).toBeUndefined();
    });

    it('應該建立 permission_denied 錯誤', () => {
      const error = createValidationError('permission_denied', 'Permission denied', '/protected/file.ts');

      expect(error.type).toBe('permission_denied');
      expect(error.message).toBe('Permission denied');
      expect(error.path).toBe('/protected/file.ts');
    });

    it('應該建立 invalid_path 錯誤', () => {
      const error = createValidationError('invalid_path', 'Invalid path format');

      expect(error.type).toBe('invalid_path');
      expect(error.message).toBe('Invalid path format');
    });

    it('應該支援沒有路徑的錯誤', () => {
      const error = createValidationError('source_not_found', 'File not found');

      expect(error.path).toBeUndefined();
    });
  });

  describe('createMoveError', () => {
    it('應該建立 file_system 錯誤', () => {
      const error = createMoveError('file_system', 'Failed to move file', '/path/to/file.ts');

      expect(error.type).toBe('file_system');
      expect(error.message).toBe('Failed to move file');
      expect(error.filePath).toBe('/path/to/file.ts');
      expect(error.originalError).toBeUndefined();
    });

    it('應該建立 import_update 錯誤', () => {
      const error = createMoveError('import_update', 'Failed to update imports');

      expect(error.type).toBe('import_update');
      expect(error.message).toBe('Failed to update imports');
      expect(error.filePath).toBeUndefined();
    });

    it('應該包含原始錯誤', () => {
      const originalError = new Error('Original error message');
      const error = createMoveError('validation', 'Validation failed', '/file.ts', originalError);

      expect(error.type).toBe('validation');
      expect(error.originalError).toBe(originalError);
      expect(error.originalError?.message).toBe('Original error message');
    });

    it('應該建立 rollback 錯誤', () => {
      const error = createMoveError('rollback', 'Rollback failed');

      expect(error.type).toBe('rollback');
      expect(error.message).toBe('Rollback failed');
    });

    it('應該支援沒有檔案路徑的錯誤', () => {
      const error = createMoveError('validation', 'General validation error');

      expect(error.filePath).toBeUndefined();
    });
  });

  describe('isFullMoveOperation', () => {
    it('應該驗證有效的 FullMoveOperation', () => {
      const operation = createFullMoveOperation(MoveOperationType.FILE, '/a.ts', '/b.ts');

      expect(isFullMoveOperation(operation)).toBe(true);
    });

    it('應該拒絕 null', () => {
      expect(isFullMoveOperation(null)).toBe(false);
    });

    it('應該拒絕 undefined', () => {
      expect(isFullMoveOperation(undefined)).toBe(false);
    });

    it('應該拒絕非物件', () => {
      expect(isFullMoveOperation('string')).toBe(false);
      expect(isFullMoveOperation(123)).toBe(false);
      expect(isFullMoveOperation(true)).toBe(false);
    });

    it('應該拒絕缺少 id 的物件', () => {
      const invalid = {
        type: MoveOperationType.FILE,
        source: '/a.ts',
        destination: '/b.ts',
        timestamp: new Date()
      };

      expect(isFullMoveOperation(invalid)).toBe(false);
    });

    it('應該拒絕缺少 type 的物件', () => {
      const invalid = {
        id: 'move_123',
        source: '/a.ts',
        destination: '/b.ts',
        timestamp: new Date()
      };

      expect(isFullMoveOperation(invalid)).toBe(false);
    });

    it('應該拒絕缺少 source 的物件', () => {
      const invalid = {
        id: 'move_123',
        type: MoveOperationType.FILE,
        destination: '/b.ts',
        timestamp: new Date()
      };

      expect(isFullMoveOperation(invalid)).toBe(false);
    });

    it('應該拒絕缺少 destination 的物件', () => {
      const invalid = {
        id: 'move_123',
        type: MoveOperationType.FILE,
        source: '/a.ts',
        timestamp: new Date()
      };

      expect(isFullMoveOperation(invalid)).toBe(false);
    });

    it('應該拒絕缺少 timestamp 的物件', () => {
      const invalid = {
        id: 'move_123',
        type: MoveOperationType.FILE,
        source: '/a.ts',
        destination: '/b.ts'
      };

      expect(isFullMoveOperation(invalid)).toBe(false);
    });

    it('應該拒絕 timestamp 不是 Date 的物件', () => {
      const invalid = {
        id: 'move_123',
        type: MoveOperationType.FILE,
        source: '/a.ts',
        destination: '/b.ts',
        timestamp: '2024-01-01'
      };

      expect(isFullMoveOperation(invalid)).toBe(false);
    });

    it('應該拒絕無效的 type 值', () => {
      const invalid = {
        id: 'move_123',
        type: 'invalid_type',
        source: '/a.ts',
        destination: '/b.ts',
        timestamp: new Date()
      };

      expect(isFullMoveOperation(invalid)).toBe(false);
    });

    it('應該拒絕 id 不是字串的物件', () => {
      const invalid = {
        id: 123,
        type: MoveOperationType.FILE,
        source: '/a.ts',
        destination: '/b.ts',
        timestamp: new Date()
      };

      expect(isFullMoveOperation(invalid)).toBe(false);
    });

    it('應該拒絕 source 不是字串的物件', () => {
      const invalid = {
        id: 'move_123',
        type: MoveOperationType.FILE,
        source: 123,
        destination: '/b.ts',
        timestamp: new Date()
      };

      expect(isFullMoveOperation(invalid)).toBe(false);
    });

    it('應該拒絕 destination 不是字串的物件', () => {
      const invalid = {
        id: 'move_123',
        type: MoveOperationType.FILE,
        source: '/a.ts',
        destination: 123,
        timestamp: new Date()
      };

      expect(isFullMoveOperation(invalid)).toBe(false);
    });
  });

  describe('isImportStatement', () => {
    it('應該驗證有效的 ImportStatement', () => {
      const statement = {
        type: 'import' as const,
        path: './utils',
        pathType: PathType.RELATIVE,
        position: createPosition(1, 1),
        range: createRange(createPosition(1, 1), createPosition(1, 30)),
        isRelative: true,
        rawStatement: "import { util } from './utils'"
      };

      expect(isImportStatement(statement)).toBe(true);
    });

    it('應該接受 require 類型', () => {
      const statement = {
        type: 'require' as const,
        path: './utils',
        pathType: PathType.RELATIVE,
        position: createPosition(1, 1),
        range: createRange(createPosition(1, 1), createPosition(1, 30)),
        isRelative: true,
        rawStatement: "const util = require('./utils')"
      };

      expect(isImportStatement(statement)).toBe(true);
    });

    it('應該接受 dynamic_import 類型', () => {
      const statement = {
        type: 'dynamic_import' as const,
        path: './utils',
        pathType: PathType.RELATIVE,
        position: createPosition(1, 1),
        range: createRange(createPosition(1, 1), createPosition(1, 30)),
        isRelative: true,
        rawStatement: "const util = import('./utils')"
      };

      expect(isImportStatement(statement)).toBe(true);
    });

    it('應該拒絕 null', () => {
      expect(isImportStatement(null)).toBe(false);
    });

    it('應該拒絕 undefined', () => {
      expect(isImportStatement(undefined)).toBe(false);
    });

    it('應該拒絕非物件', () => {
      expect(isImportStatement('string')).toBe(false);
      expect(isImportStatement(123)).toBe(false);
    });

    it('應該拒絕無效的 type', () => {
      const invalid = {
        type: 'invalid' as const,
        path: './utils',
        pathType: PathType.RELATIVE,
        position: createPosition(1, 1),
        range: createRange(createPosition(1, 1), createPosition(1, 30)),
        isRelative: true,
        rawStatement: "import { util } from './utils'"
      };

      expect(isImportStatement(invalid)).toBe(false);
    });

    it('應該拒絕缺少 path 的物件', () => {
      const invalid = {
        type: 'import' as const,
        pathType: PathType.RELATIVE,
        position: createPosition(1, 1),
        range: createRange(createPosition(1, 1), createPosition(1, 30)),
        isRelative: true,
        rawStatement: "import { util } from './utils'"
      };

      expect(isImportStatement(invalid)).toBe(false);
    });

    it('應該拒絕 path 不是字串的物件', () => {
      const invalid = {
        type: 'import' as const,
        path: 123,
        pathType: PathType.RELATIVE,
        position: createPosition(1, 1),
        range: createRange(createPosition(1, 1), createPosition(1, 30)),
        isRelative: true,
        rawStatement: "import { util } from './utils'"
      };

      expect(isImportStatement(invalid)).toBe(false);
    });

    it('應該拒絕無效的 pathType', () => {
      const invalid = {
        type: 'import' as const,
        path: './utils',
        pathType: 'invalid',
        position: createPosition(1, 1),
        range: createRange(createPosition(1, 1), createPosition(1, 30)),
        isRelative: true,
        rawStatement: "import { util } from './utils'"
      };

      expect(isImportStatement(invalid)).toBe(false);
    });

    it('應該拒絕缺少 position 的物件', () => {
      const invalid = {
        type: 'import' as const,
        path: './utils',
        pathType: PathType.RELATIVE,
        range: createRange(createPosition(1, 1), createPosition(1, 30)),
        isRelative: true,
        rawStatement: "import { util } from './utils'"
      };

      expect(isImportStatement(invalid)).toBe(false);
    });

    it('應該拒絕缺少 range 的物件', () => {
      const invalid = {
        type: 'import' as const,
        path: './utils',
        pathType: PathType.RELATIVE,
        position: createPosition(1, 1),
        isRelative: true,
        rawStatement: "import { util } from './utils'"
      };

      expect(isImportStatement(invalid)).toBe(false);
    });

    it('應該拒絕缺少 isRelative 的物件', () => {
      const invalid = {
        type: 'import' as const,
        path: './utils',
        pathType: PathType.RELATIVE,
        position: createPosition(1, 1),
        range: createRange(createPosition(1, 1), createPosition(1, 30)),
        rawStatement: "import { util } from './utils'"
      };

      expect(isImportStatement(invalid)).toBe(false);
    });

    it('應該拒絕缺少 rawStatement 的物件', () => {
      const invalid = {
        type: 'import' as const,
        path: './utils',
        pathType: PathType.RELATIVE,
        position: createPosition(1, 1),
        range: createRange(createPosition(1, 1), createPosition(1, 30)),
        isRelative: true
      };

      expect(isImportStatement(invalid)).toBe(false);
    });

    it('應該拒絕 isRelative 不是布林值的物件', () => {
      const invalid = {
        type: 'import' as const,
        path: './utils',
        pathType: PathType.RELATIVE,
        position: createPosition(1, 1),
        range: createRange(createPosition(1, 1), createPosition(1, 30)),
        isRelative: 'true',
        rawStatement: "import { util } from './utils'"
      };

      expect(isImportStatement(invalid)).toBe(false);
    });

    it('應該拒絕 rawStatement 不是字串的物件', () => {
      const invalid = {
        type: 'import' as const,
        path: './utils',
        pathType: PathType.RELATIVE,
        position: createPosition(1, 1),
        range: createRange(createPosition(1, 1), createPosition(1, 30)),
        isRelative: true,
        rawStatement: 123
      };

      expect(isImportStatement(invalid)).toBe(false);
    });
  });
});
