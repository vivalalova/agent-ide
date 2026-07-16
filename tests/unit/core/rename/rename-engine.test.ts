/**
 * RenameEngine 單元測試
 */

import { describe, it, expect } from 'vitest';
import { RenameEngine } from '@core/rename/rename-engine.js';
import { ConflictType } from '@core/rename/types.js';
import { SymbolType } from '@shared/types/symbol.js';
import type { RenameOptions } from '@core/rename/types.js';
import type { Symbol } from '@shared/types/symbol.js';
import { createMockFileSystem, createMockParserRegistry, createMockSymbol } from '../_helpers/mock-factories.js';

function makeOptions(newName: string, overrides?: Partial<RenameOptions>): RenameOptions {
  const symbol: Symbol = createMockSymbol('myFunc');
  return {
    symbol,
    newName,
    filePaths: ['/src/foo.ts'],
    ...overrides
  };
}

describe('RenameEngine', () => {
  describe('validateRename - 輸入驗證', () => {
    it('Given 空 newName, when validateRename, then 拋錯「新名稱不能為空」', async () => {
      const engine = new RenameEngine();
      await expect(engine.validateRename(makeOptions(''))).rejects.toThrow('新名稱不能為空');
    });

    it('Given 空格 newName, when validateRename, then 拋錯「新名稱不能為空」', async () => {
      const engine = new RenameEngine();
      await expect(engine.validateRename(makeOptions('   '))).rejects.toThrow('新名稱不能為空');
    });

    it('Given 空 filePaths, when validateRename, then 拋錯「必須指定至少一個檔案路徑」', async () => {
      const engine = new RenameEngine();
      await expect(
        engine.validateRename(makeOptions('newName', { filePaths: [] }))
      ).rejects.toThrow('必須指定至少一個檔案路徑');
    });
  });

  describe('validateRename - 衝突偵測', () => {
    it('Given 保留字 newName, when validateRename, then isValid: false + ReservedKeyword 衝突', async () => {
      const engine = new RenameEngine();
      const result = await engine.validateRename(makeOptions('function'));
      expect(result.isValid).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe(ConflictType.ReservedKeyword);
    });

    // F29：core RenameEngine.reservedKeywords 漏 async（context keyword / 不可當識別符）
    it('Given 保留字 async, when validateRename, then isValid: false + ReservedKeyword 衝突（F29）', async () => {
      const engine = new RenameEngine();
      const result = await engine.validateRename(makeOptions('async'));
      expect(result.isValid).toBe(false);
      expect(result.conflicts.some(c => c.type === ConflictType.ReservedKeyword)).toBe(true);
    });

    it('Given 無效識別符（數字開頭）, when validateRename, then isValid: false + InvalidIdentifier 衝突', async () => {
      const engine = new RenameEngine();
      const result = await engine.validateRename(makeOptions('123abc'));
      expect(result.isValid).toBe(false);
      expect(result.conflicts.some(c => c.type === ConflictType.InvalidIdentifier)).toBe(true);
    });

    it('Given 無效識別符（含空格）, when validateRename, then isValid: false', async () => {
      const engine = new RenameEngine();
      const result = await engine.validateRename(makeOptions('my func'));
      expect(result.isValid).toBe(false);
    });

    it('Given 有效名稱, when validateRename, then isValid: true + 無衝突', async () => {
      const mockFs = createMockFileSystem({ '/src/foo.ts': 'const myFunc = () => {}' });
      const engine = new RenameEngine(createMockParserRegistry(), mockFs);
      const result = await engine.validateRename(makeOptions('newValidName'));
      expect(result.isValid).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('Given Unicode 識別符, when validateRename, then isValid: true', async () => {
      const mockFs = createMockFileSystem({ '/src/foo.ts': '' });
      const engine = new RenameEngine(createMockParserRegistry(), mockFs);
      const result = await engine.validateRename(makeOptions('使用者名稱'));
      expect(result.isValid).toBe(true);
    });
  });

  describe('detectConflicts', () => {
    it('Given 保留字, when detectConflicts, then 回傳 ReservedKeyword 衝突', () => {
      const engine = new RenameEngine();
      const conflicts = engine.detectConflicts('const');
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe(ConflictType.ReservedKeyword);
    });

    it('Given 無效識別符（連字符）, when detectConflicts, then 回傳 InvalidIdentifier 衝突', () => {
      const engine = new RenameEngine();
      const conflicts = engine.detectConflicts('my-func');
      expect(conflicts.some(c => c.type === ConflictType.InvalidIdentifier)).toBe(true);
    });

    it('Given 有效識別符, when detectConflicts, then 回傳空陣列', () => {
      const engine = new RenameEngine();
      const conflicts = engine.detectConflicts('validName');
      expect(conflicts).toHaveLength(0);
    });

    it('Given scope 有同名符號, when detectConflicts, then 回傳 NameCollision 衝突', () => {
      const engine = new RenameEngine();
      const scope = {
        type: 'function',
        name: 'myFunc',
        parent: undefined,
        symbols: [createMockSymbol('existingVar', SymbolType.Variable)],
        range: { start: { line: 1, column: 1 }, end: { line: 10, column: 1 } }
      };
      const conflicts = engine.detectConflicts('existingVar', scope);
      expect(conflicts.some(c => c.type === ConflictType.NameCollision)).toBe(true);
    });

    it('Given 空 scope, when detectConflicts 有效識別符, then 回傳空陣列', () => {
      const engine = new RenameEngine();
      const scope = {
        type: 'function',
        name: 'myFunc',
        parent: undefined,
        symbols: [],
        range: { start: { line: 1, column: 1 }, end: { line: 10, column: 1 } }
      };
      const conflicts = engine.detectConflicts('newName', scope);
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('findReferences', () => {
    it('Given 空檔案列表, when findReferences, then 回傳空陣列', async () => {
      const engine = new RenameEngine();
      const symbol = createMockSymbol('myFunc');
      const refs = await engine.findReferences([], symbol);
      expect(refs).toEqual([]);
    });

    it('Given 存在的檔案含符號名稱, when findReferences, then 回傳對應引用', async () => {
      const mockFs = createMockFileSystem({
        '/src/foo.ts': 'function myFunc() {}\nmyFunc();'
      });
      const engine = new RenameEngine(createMockParserRegistry(), mockFs);
      const symbol = createMockSymbol('myFunc');
      const refs = await engine.findReferences(['/src/foo.ts'], symbol);
      expect(refs.length).toBe(2);
      expect(refs[0].filePath).toBe('/src/foo.ts');
      expect(refs.some(r => r.line === 2)).toBe(true);
    });
  });
});
