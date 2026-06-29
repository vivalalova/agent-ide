/**
 * IndexCacheSerializer 單元測試
 * 驗證序列化/反序列化 roundtrip 的正確性
 */

import { describe, it, expect } from 'vitest';
import {
  IndexCacheSerializer,
  CACHE_VERSION,
  type SerializedIndexData
} from '@core/foundations/indexing/index-cache-serializer.js';
import type { FileIndexEntry } from '@core/foundations/indexing/types.js';
import { SymbolType, DependencyType } from '@shared/types/index.js';
import type { Symbol, Scope, Dependency } from '@shared/types/index.js';

// ── helpers ──

function makeScope(type: Scope['type'], name?: string, parent?: Scope): Scope {
  return { type, name, parent };
}

function makeSymbol(name: string, overrides: Partial<Symbol> = {}): Symbol {
  return {
    name,
    type: SymbolType.Function,
    location: {
      filePath: '/src/foo.ts',
      range: {
        start: { line: 1, column: 0 },
        end: { line: 5, column: 1 }
      }
    },
    scope: undefined,
    modifiers: [],
    ...overrides
  };
}

function makeDependency(path: string, overrides: Partial<Dependency> = {}): Dependency {
  return {
    path,
    type: DependencyType.Import,
    isRelative: true,
    importedSymbols: [],
    ...overrides
  };
}

function makeEntry(filePath: string, overrides: Partial<FileIndexEntry> = {}): FileIndexEntry {
  return {
    fileInfo: {
      filePath,
      lastModified: new Date('2026-01-01T00:00:00.000Z'),
      size: 1024,
      extension: '.ts',
      language: 'typescript',
      checksum: 'abc123'
    },
    symbols: [],
    dependencies: [],
    isIndexed: true,
    lastIndexed: new Date('2026-01-01T00:01:00.000Z'),
    parseErrors: [],
    ...overrides
  };
}

// ── tests ──

describe('IndexCacheSerializer', () => {
  const serializer = new IndexCacheSerializer();

  describe('serialize → deserialize roundtrip', () => {
    it('빈 map은 빈 map으로 복원된다', () => {
      const entries = new Map<string, FileIndexEntry>();
      const partial = serializer.serialize(entries);
      const data: SerializedIndexData = { ...partial, cacheKey: 'k1' };
      const restored = serializer.deserialize(data);
      expect(restored.size).toBe(0);
    });

    it('단순 entry: FileInfo 모든 필드 보존', () => {
      const entry = makeEntry('/src/bar.ts', {
        fileInfo: {
          filePath: '/src/bar.ts',
          lastModified: new Date('2026-03-01T12:00:00.000Z'),
          size: 2048,
          extension: '.tsx',
          language: 'typescript',
          checksum: 'def456'
        }
      });

      const entries = new Map([['bar', entry]]);
      const partial = serializer.serialize(entries);
      const data: SerializedIndexData = { ...partial, cacheKey: 'k2' };
      const restored = serializer.deserialize(data);

      const restoredEntry = restored.get('bar')!;
      expect(restoredEntry.fileInfo.filePath).toBe('/src/bar.ts');
      expect(restoredEntry.fileInfo.lastModified).toEqual(new Date('2026-03-01T12:00:00.000Z'));
      expect(restoredEntry.fileInfo.size).toBe(2048);
      expect(restoredEntry.fileInfo.extension).toBe('.tsx');
      expect(restoredEntry.fileInfo.language).toBe('typescript');
      expect(restoredEntry.fileInfo.checksum).toBe('def456');
    });

    it('isIndexed=false, lastIndexed=undefined, parseErrors 보존', () => {
      const entry = makeEntry('/src/bad.ts', {
        isIndexed: false,
        lastIndexed: undefined,
        parseErrors: ['SyntaxError: unexpected token', 'Type error: unknown']
      });

      const entries = new Map([['bad', entry]]);
      const partial = serializer.serialize(entries);
      const data: SerializedIndexData = { ...partial, cacheKey: 'k3' };
      const restored = serializer.deserialize(data);

      const r = restored.get('bad')!;
      expect(r.isIndexed).toBe(false);
      expect(r.lastIndexed).toBeUndefined();
      expect(r.parseErrors).toEqual(['SyntaxError: unexpected token', 'Type error: unknown']);
    });

    it('Symbol: name, type, location, modifiers, scope 보존', () => {
      const scope = makeScope('module', 'myMod');
      const sym = makeSymbol('myFunc', {
        type: SymbolType.Class,
        location: {
          filePath: '/src/x.ts',
          range: { start: { line: 10, column: 2 }, end: { line: 20, column: 3 } }
        },
        scope,
        modifiers: ['export', 'async'],
        attributes: ['deprecated'],
        superclass: 'BaseClass',
        implements: ['IFoo', 'IBar']
      });

      const entry = makeEntry('/src/x.ts', { symbols: [sym] });
      const entries = new Map([['x', entry]]);
      const partial = serializer.serialize(entries);
      const data: SerializedIndexData = { ...partial, cacheKey: 'k4' };
      const restored = serializer.deserialize(data);

      const restoredSym = restored.get('x')!.symbols[0];
      expect(restoredSym.name).toBe('myFunc');
      expect(restoredSym.type).toBe(SymbolType.Class);
      expect(restoredSym.location.range.start.line).toBe(10);
      expect(restoredSym.location.range.end.column).toBe(3);
      expect(restoredSym.modifiers).toEqual(['export', 'async']);
      expect(restoredSym.attributes).toEqual(['deprecated']);
      expect(restoredSym.superclass).toBe('BaseClass');
      expect(restoredSym.implements).toEqual(['IFoo', 'IBar']);
      expect(restoredSym.scope?.type).toBe('module');
      expect(restoredSym.scope?.name).toBe('myMod');
    });

    it('Symbol scope parent chain 보존', () => {
      const globalScope = makeScope('global', undefined);
      const classScope = makeScope('class', 'MyClass', globalScope);
      const methodScope = makeScope('function', 'myMethod', classScope);
      const sym = makeSymbol('innerFn', { scope: methodScope });

      const entry = makeEntry('/src/deep.ts', { symbols: [sym] });
      const entries = new Map([['deep', entry]]);
      const partial = serializer.serialize(entries);
      const data: SerializedIndexData = { ...partial, cacheKey: 'k5' };
      const restored = serializer.deserialize(data);

      const s = restored.get('deep')!.symbols[0];
      // method scope
      expect(s.scope?.type).toBe('function');
      expect(s.scope?.name).toBe('myMethod');
      // class scope (parent)
      expect(s.scope?.parent?.type).toBe('class');
      expect(s.scope?.parent?.name).toBe('MyClass');
      // global scope (grandparent)
      expect(s.scope?.parent?.parent?.type).toBe('global');
      expect(s.scope?.parent?.parent?.name).toBeUndefined();
    });

    it('Dependency: 모든 필드 보존 (isTypeOnly 포함)', () => {
      const dep = makeDependency('./utils', {
        type: DependencyType.Import,
        isRelative: true,
        importedSymbols: ['helper', 'util'],
        isTypeOnly: true
      });

      const entry = makeEntry('/src/main.ts', { dependencies: [dep] });
      const entries = new Map([['main', entry]]);
      const partial = serializer.serialize(entries);
      const data: SerializedIndexData = { ...partial, cacheKey: 'k6' };
      const restored = serializer.deserialize(data);

      const d = restored.get('main')!.dependencies[0];
      expect(d.path).toBe('./utils');
      expect(d.type).toBe(DependencyType.Import);
      expect(d.isRelative).toBe(true);
      expect(d.importedSymbols).toEqual(['helper', 'util']);
      expect(d.isTypeOnly).toBe(true);
    });

    it('여러 entry 동시에 보존', () => {
      const entries = new Map<string, FileIndexEntry>([
        ['a', makeEntry('/src/a.ts', { symbols: [makeSymbol('FnA')] })],
        ['b', makeEntry('/src/b.ts', { symbols: [makeSymbol('FnB'), makeSymbol('FnC')] })],
        ['c', makeEntry('/src/c.ts')]
      ]);

      const partial = serializer.serialize(entries);
      const data: SerializedIndexData = { ...partial, cacheKey: 'k7' };
      const restored = serializer.deserialize(data);

      expect(restored.size).toBe(3);
      expect(restored.get('a')!.symbols[0].name).toBe('FnA');
      expect(restored.get('b')!.symbols).toHaveLength(2);
      expect(restored.get('c')!.symbols).toHaveLength(0);
    });

    it('Symbol scope=undefined는 undefined로 복원', () => {
      const sym = makeSymbol('noScope', { scope: undefined });
      const entry = makeEntry('/src/ns.ts', { symbols: [sym] });
      const entries = new Map([['ns', entry]]);
      const partial = serializer.serialize(entries);
      const data: SerializedIndexData = { ...partial, cacheKey: 'k8' };
      const restored = serializer.deserialize(data);

      expect(restored.get('ns')!.symbols[0].scope).toBeUndefined();
    });

    it('Symbol isImported 旗標 roundtrip 保留（消歧義過濾依賴此欄位）', () => {
      const importedSym = { ...makeSymbol('helper', { type: SymbolType.Variable }), isImported: true } as Symbol;
      const definitionSym = makeSymbol('helper', { type: SymbolType.Function });

      const entry = makeEntry('/src/imp.ts', { symbols: [importedSym, definitionSym] });
      const entries = new Map([['imp', entry]]);
      const partial = serializer.serialize(entries);
      const data: SerializedIndexData = { ...partial, cacheKey: 'k-imp' };
      const restored = serializer.deserialize(data);

      const restoredSyms = restored.get('imp')!.symbols;
      // import-only candidate 必須在 cache roundtrip 後仍可辨識
      expect((restoredSyms[0] as { isImported?: boolean }).isImported).toBe(true);
      // 真正的定義不應被誤標為 import
      expect((restoredSyms[1] as { isImported?: boolean }).isImported).toBeUndefined();
    });
  });

  describe('version mismatch', () => {
    it('version 불일치 시 deserialize 는 에러를 던진다', () => {
      const partial = serializer.serialize(new Map());
      const badData: SerializedIndexData = {
        ...partial,
        version: '99.99.99',
        cacheKey: 'bad'
      };

      expect(() => serializer.deserialize(badData)).toThrow(/version mismatch/i);
    });

    it('CACHE_VERSION 은 정의되어 있다', () => {
      expect(typeof CACHE_VERSION).toBe('string');
      expect(CACHE_VERSION.length).toBeGreaterThan(0);
    });
  });
});
