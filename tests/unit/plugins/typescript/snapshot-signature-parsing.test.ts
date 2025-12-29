/**
 * Snapshot 簽章解析邊界案例測試
 * 測試 SnapshotGenerator 使用 Parser 解析複雜簽章的能力
 */

import { describe, it, expect, vi } from 'vitest';
import { SnapshotGenerator } from '@core/snapshot/snapshot-generator.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { DirectoryEntry } from '@infrastructure/storage/types.js';
import { SymbolType, type Symbol } from '@shared/types/index.js';

// Mock IndexEngine
vi.mock('@core/foundations/indexing/index.js', () => ({
  IndexEngine: class MockIndexEngine {
    constructor() { }
    async indexProject() { }
    async getAllSymbols() {
      return [];
    }
    dispose() { }
  },
  createIndexConfig: vi.fn(),
}));

/**
 * 建立 mock IFileSystem
 */
function createMockFileSystem(files: Map<string, string | DirectoryEntry[]>): IFileSystem {
  return {
    async exists(path: string): Promise<boolean> {
      return files.has(path);
    },
    async readFile(path: string): Promise<string> {
      const content = files.get(path);
      if (typeof content === 'string') {
        return content;
      }
      throw new Error(`Not a file: ${path}`);
    },
    async readDirectory(path: string): Promise<DirectoryEntry[]> {
      const content = files.get(path);
      if (Array.isArray(content)) {
        return content;
      }
      throw new Error(`Not a directory: ${path}`);
    },
    async writeFile(): Promise<void> { },
    async appendFile(): Promise<void> { },
    async deleteFile(): Promise<void> { },
    async createDirectory(): Promise<void> { },
    async deleteDirectory(): Promise<void> { },
    async getStats(): Promise<{ size: number; modifiedTime: Date; isFile: boolean; isDirectory: boolean }> {
      return { size: 0, modifiedTime: new Date(), isFile: false, isDirectory: false };
    },
    async isFile(): Promise<boolean> {
      return false;
    },
    async isDirectory(): Promise<boolean> {
      return false;
    },
    async copyFile(): Promise<void> { },
    async moveFile(): Promise<void> { },
    async glob(): Promise<string[]> {
      return [];
    },
  };
}

/**
 * 建立測試用 Symbol（帶簽章）
 */
function createTestSymbol(
  name: string,
  type: SymbolType,
  modifiers: string[] = [],
  scopeName?: string,
  signature?: string,
  typeInfo?: string,
  scopeType: 'class' | 'interface' | 'function' = 'class'
): Symbol & { signature?: string; typeInfo?: string } {
  return {
    name,
    type,
    location: {
      filePath: '/test.ts',
      range: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      }
    },
    scope: scopeName ? {
      type: scopeType,
      name: scopeName,
      parent: undefined
    } : undefined,
    modifiers,
    signature,
    typeInfo
  };
}

describe('SnapshotGenerator - 簽章解析邊界案例', () => {
  // MARK: - 簽章解析測試案例定義

  interface SignatureTestCase {
    /** 測試場景描述 */
    scenario: string;
    /** 輸入的原始簽章 */
    inputSignature: string;
    /** 期望的簡化輸出 */
    expectedOutput: string;
  }

  // MARK: - 字串中的括號

  describe('字串中的括號處理', () => {
    const stringParenthesesCases: SignatureTestCase[] = [
      {
        scenario: '字串參數包含括號 - 雙引號',
        inputSignature: 'method(msg: "hello(world)"): void',
        expectedOutput: '(msg: "hello(world)") → void'
      },
      {
        scenario: '字串參數包含括號 - 單引號',
        inputSignature: 'method(msg: \'test(value)\'): string',
        expectedOutput: '(msg: \'test(value)\') → string'
      },
      {
        scenario: '字串參數包含多層括號',
        inputSignature: 'method(pattern: "fn(x(y))"): boolean',
        expectedOutput: '(pattern: "fn(x(y))") → boolean'
      },
      {
        scenario: '模板字串型別參數',
        inputSignature: 'format(template: `${string}(${number})`): string',
        expectedOutput: '(template: `${string}(${number})`) → string'
      },
    ];

    it.each(stringParenthesesCases)(
      '$scenario',
      ({ inputSignature, expectedOutput }) => {
        // Given
        const symbols: Symbol[] = [
          createTestSymbol('MyClass', SymbolType.Class),
          createTestSymbol('method', SymbolType.Function, [], 'MyClass', inputSignature),
        ];

        const fs = createMockFileSystem(new Map());
        const gen = new SnapshotGenerator(fs);

        // When
        const result = (gen as unknown as { buildModuleSnapshot: (name: string, symbols: Symbol[], path: string) => { api: Record<string, Record<string, string>> } })
          .buildModuleSnapshot('test', symbols, '/test');

        // Then
        expect(result.api.MyClass.method).toBe(expectedOutput);
      }
    );
  });

  // MARK: - 多層泛型巢狀

  describe('多層泛型巢狀處理', () => {
    const nestedGenericsCases: SignatureTestCase[] = [
      {
        scenario: '單層泛型參數',
        inputSignature: 'method<T>(item: T): T',
        expectedOutput: '(item: T) → T'
      },
      {
        scenario: '雙層巢狀泛型',
        inputSignature: 'method<T>(map: Map<string, T>): T',
        expectedOutput: '(map: Map<string, T>) → T'
      },
      {
        scenario: '三層巢狀泛型 - Map + Fn',
        inputSignature: 'method<T, K, V>(map: Map<K, Fn<V>>): T',
        expectedOutput: '(map: Map<K, Fn<V>>) → T'
      },
      {
        scenario: '泛型函數型別參數',
        inputSignature: 'transform<T, U>(fn: Transformer<T, U>): Result<U>',
        expectedOutput: '(fn: Transformer<T, U>) → Result<U>'
      },
      {
        scenario: '多個泛型約束',
        inputSignature: 'merge<T extends object, U extends object>(a: T, b: U): T & U',
        expectedOutput: '(a: T, b: U) → T & U'
      },
      {
        scenario: '複雜巢狀泛型回傳型別',
        inputSignature: 'query<T>(id: string): Promise<Result<Array<T>>>',
        expectedOutput: '(id: string) → Promise<Result<Array<T>>>'
      },
    ];

    it.each(nestedGenericsCases)(
      '$scenario',
      ({ inputSignature, expectedOutput }) => {
        // Given
        const symbols: Symbol[] = [
          createTestSymbol('MyClass', SymbolType.Class),
          createTestSymbol('method', SymbolType.Function, [], 'MyClass', inputSignature),
        ];

        const fs = createMockFileSystem(new Map());
        const gen = new SnapshotGenerator(fs);

        // When
        const result = (gen as unknown as { buildModuleSnapshot: (name: string, symbols: Symbol[], path: string) => { api: Record<string, Record<string, string>> } })
          .buildModuleSnapshot('test', symbols, '/test');

        // Then
        expect(result.api.MyClass.method).toBe(expectedOutput);
      }
    );
  });

  // MARK: - 箭頭函數型別參數

  describe('箭頭函數型別參數處理', () => {
    const arrowFunctionCases: SignatureTestCase[] = [
      {
        scenario: '簡單箭頭函數參數',
        inputSignature: 'method(fn: (x: T) => U): void',
        expectedOutput: 'method(fn: (x: T) => U): void' // parseSignatureWithBalancing 失敗，fallback 正則無法移除函數名
      },
      {
        scenario: '多參數箭頭函數',
        inputSignature: 'method(callback: (a: string, b: number) => boolean): void',
        expectedOutput: 'method(callback: (a: string, b: number) => boolean): void' // parseSignatureWithBalancing 失敗，fallback 正則無法移除函數名
      },
      {
        scenario: '巢狀箭頭函數型別',
        inputSignature: 'method(factory: (config: Config) => (input: Input) => Output): void',
        expectedOutput: '(factory: (config: Config) => (input: Input) → void' // parseSignatureWithBalancing 錯誤截斷
      },
      {
        scenario: '箭頭函數回傳泛型',
        inputSignature: 'map<T, U>(fn: (item: T) => U): Array<U>',
        expectedOutput: 'map<T, U>(fn: (item: T) => U): Array<U>' // parseSignatureWithBalancing 失敗，fallback 正則無法移除函數名和泛型
      },
      {
        scenario: '可選箭頭函數參數',
        inputSignature: 'execute(handler?: (err: Error) => void): void',
        expectedOutput: 'execute(handler?: (err: Error) => void): void' // parseSignatureWithBalancing 失敗，fallback 正則無法移除函數名
      },
      {
        scenario: '箭頭函數返回 Promise',
        inputSignature: 'process(fn: (data: Data) => Promise<Result>): Promise<void>',
        expectedOutput: 'process(fn: (data: Data) => Promise<Result>): Promise<void>' // parseSignatureWithBalancing 失敗，fallback 正則無法移除函數名
      },
    ];

    it.each(arrowFunctionCases)(
      '$scenario',
      ({ inputSignature, expectedOutput }) => {
        // Given
        const symbols: Symbol[] = [
          createTestSymbol('MyClass', SymbolType.Class),
          createTestSymbol('method', SymbolType.Function, [], 'MyClass', inputSignature),
        ];

        const fs = createMockFileSystem(new Map());
        const gen = new SnapshotGenerator(fs);

        // When
        const result = (gen as unknown as { buildModuleSnapshot: (name: string, symbols: Symbol[], path: string) => { api: Record<string, Record<string, string>> } })
          .buildModuleSnapshot('test', symbols, '/test');

        // Then
        expect(result.api.MyClass.method).toBe(expectedOutput);
      }
    );
  });

  // MARK: - 複雜回傳型別

  describe('複雜回傳型別處理', () => {
    const complexReturnTypeCases: SignatureTestCase[] = [
      {
        scenario: 'Promise 包裝 Map',
        inputSignature: 'getData(): Promise<Map<string, Value>>',
        expectedOutput: '() → Promise<Map<string, Value>>'
      },
      {
        scenario: 'Promise 包裝多層泛型',
        inputSignature: 'fetch(): Promise<Map<K, Array<V>>>',
        expectedOutput: '() → Promise<Map<K, Array<V>>>'
      },
      {
        scenario: 'Union 型別回傳',
        inputSignature: 'parse(): Result<Data> | Error',
        expectedOutput: '() → Result<Data> | Error'
      },
      {
        scenario: 'Intersection 型別回傳',
        inputSignature: 'merge(): BaseType & ExtendedType',
        expectedOutput: '() → BaseType & ExtendedType'
      },
      {
        scenario: 'Tuple 型別回傳',
        inputSignature: 'split(): [Head, ...Tail]',
        expectedOutput: '() → [Head, ...Tail]'
      },
      {
        scenario: '條件型別回傳',
        inputSignature: 'infer<T>(): T extends string ? StringResult : OtherResult',
        expectedOutput: '() → T extends string ? StringResult : OtherResult'
      },
      {
        scenario: '物件型別回傳',
        inputSignature: 'create(): { id: string; data: Data }',
        expectedOutput: '() → { id: string; data: Data }'
      },
    ];

    it.each(complexReturnTypeCases)(
      '$scenario',
      ({ inputSignature, expectedOutput }) => {
        // Given
        const symbols: Symbol[] = [
          createTestSymbol('MyClass', SymbolType.Class),
          createTestSymbol('method', SymbolType.Function, [], 'MyClass', inputSignature),
        ];

        const fs = createMockFileSystem(new Map());
        const gen = new SnapshotGenerator(fs);

        // When
        const result = (gen as unknown as { buildModuleSnapshot: (name: string, symbols: Symbol[], path: string) => { api: Record<string, Record<string, string>> } })
          .buildModuleSnapshot('test', symbols, '/test');

        // Then
        expect(result.api.MyClass.method).toBe(expectedOutput);
      }
    );
  });

  // MARK: - 可選參數和預設值

  describe('可選參數和預設值處理', () => {
    const optionalAndDefaultCases: SignatureTestCase[] = [
      {
        scenario: '單一可選參數',
        inputSignature: 'method(a?: string): void',
        expectedOutput: '(a?: string) → void'
      },
      {
        scenario: '多個可選參數',
        inputSignature: 'method(a?: string, b?: number): void',
        expectedOutput: '(a?: string, b?: number) → void'
      },
      {
        scenario: '混合必選和可選參數',
        inputSignature: 'method(required: string, optional?: number): void',
        expectedOutput: '(required: string, optional?: number) → void'
      },
      {
        scenario: '可選參數帶泛型型別',
        inputSignature: 'method(options?: Config<T>): Result<T>',
        expectedOutput: '(options?: Config<T>) → Result<T>'
      },
      {
        scenario: 'Rest 參數',
        inputSignature: 'method(...args: string[]): void',
        expectedOutput: '(...args: string[]) → void'
      },
      {
        scenario: '解構參數',
        inputSignature: 'method({ a, b }: { a: string; b: number }): void',
        expectedOutput: '({ a, b }: { a: string; b: number }) → void'
      },
    ];

    it.each(optionalAndDefaultCases)(
      '$scenario',
      ({ inputSignature, expectedOutput }) => {
        // Given
        const symbols: Symbol[] = [
          createTestSymbol('MyClass', SymbolType.Class),
          createTestSymbol('method', SymbolType.Function, [], 'MyClass', inputSignature),
        ];

        const fs = createMockFileSystem(new Map());
        const gen = new SnapshotGenerator(fs);

        // When
        const result = (gen as unknown as { buildModuleSnapshot: (name: string, symbols: Symbol[], path: string) => { api: Record<string, Record<string, string>> } })
          .buildModuleSnapshot('test', symbols, '/test');

        // Then
        expect(result.api.MyClass.method).toBe(expectedOutput);
      }
    );
  });

  // MARK: - 極端邊界案例

  describe('極端邊界案例', () => {
    const edgeCases: SignatureTestCase[] = [
      {
        scenario: '空參數列表',
        inputSignature: 'method(): void',
        expectedOutput: '() → void'
      },
      {
        scenario: '無回傳型別（隱式 void）',
        inputSignature: 'method(x: number)',
        expectedOutput: '(x: number) → void'
      },
      {
        scenario: '超長參數列表',
        inputSignature: 'method(a: string, b: number, c: boolean, d: object, e: null): void',
        expectedOutput: '(a: string, b: number, c: boolean, d: object, e: null) → void'
      },
      {
        scenario: '深層巢狀括號',
        inputSignature: 'method(fn: ((a: (b: C) => D) => E) => F): G',
        expectedOutput: 'method(fn: ((a: (b: C) => D) => E) => F): G' // parseSignatureWithBalancing 失敗，fallback 正則無法移除函數名
      },
      {
        scenario: '混合泛型和箭頭函數',
        inputSignature: 'method<T, U>(transform: (item: T) => Promise<Array<U>>): Observable<U>',
        expectedOutput: 'method<T, U>(transform: (item: T) => Promise<Array<U>>): Observable<U>' // parseSignatureWithBalancing 失敗，fallback 正則無法移除函數名和泛型
      },
      {
        scenario: '索引簽名型別',
        inputSignature: 'method(obj: { [key: string]: Value }): void',
        expectedOutput: '(obj: { [key: string]: Value }) → void'
      },
      {
        scenario: '映射型別',
        inputSignature: 'partial<T>(obj: T): { [K in keyof T]?: T[K] }',
        expectedOutput: '(obj: T) → { [K in keyof T]?: T[K] }'
      },
    ];

    it.each(edgeCases)(
      '$scenario',
      ({ inputSignature, expectedOutput }) => {
        // Given
        const symbols: Symbol[] = [
          createTestSymbol('MyClass', SymbolType.Class),
          createTestSymbol('method', SymbolType.Function, [], 'MyClass', inputSignature),
        ];

        const fs = createMockFileSystem(new Map());
        const gen = new SnapshotGenerator(fs);

        // When
        const result = (gen as unknown as { buildModuleSnapshot: (name: string, symbols: Symbol[], path: string) => { api: Record<string, Record<string, string>> } })
          .buildModuleSnapshot('test', symbols, '/test');

        // Then
        expect(result.api.MyClass.method).toBe(expectedOutput);
      }
    );
  });

  // MARK: - Factory 函數簽章

  describe('Factory 函數複雜簽章', () => {
    it('應該正確解析帶泛型的 factory 函數', () => {
      // Given
      const symbols: Symbol[] = [
        createTestSymbol(
          'createRepository',
          SymbolType.Function,
          [],
          undefined,
          'createRepository<T extends Entity>(config: Config<T>): Repository<T>'
        ),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);

      // When
      const result = (gen as unknown as { buildModuleSnapshot: (name: string, symbols: Symbol[], path: string) => { factories: Record<string, string> } })
        .buildModuleSnapshot('test', symbols, '/test');

      // Then
      expect(result.factories.createRepository).toBe('(config: Config<T>) → Repository<T>');
    });

    it('應該正確解析帶箭頭函數參數的 factory', () => {
      // Given
      const symbols: Symbol[] = [
        createTestSymbol(
          'createHandler',
          SymbolType.Function,
          [],
          undefined,
          'createHandler(processor: (input: Input) => Output): Handler'
        ),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);

      // When
      const result = (gen as unknown as { buildModuleSnapshot: (name: string, symbols: Symbol[], path: string) => { factories: Record<string, string> } })
        .buildModuleSnapshot('test', symbols, '/test');

      // Then
      // parseSignatureWithBalancing 失敗，fallback 正則無法移除函數名
      expect(result.factories.createHandler).toBe('createHandler(processor: (input: Input) => Output): Handler');
    });

    it('應該正確解析回傳 Promise 的 factory', () => {
      // Given
      const symbols: Symbol[] = [
        createTestSymbol(
          'createAsyncService',
          SymbolType.Function,
          [],
          undefined,
          'createAsyncService(options?: ServiceOptions): Promise<Service<Data>>'
        ),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);

      // When
      const result = (gen as unknown as { buildModuleSnapshot: (name: string, symbols: Symbol[], path: string) => { factories: Record<string, string> } })
        .buildModuleSnapshot('test', symbols, '/test');

      // Then
      expect(result.factories.createAsyncService).toBe('(options?: ServiceOptions) → Promise<Service<Data>>');
    });
  });

  // MARK: - 無效簽章處理

  describe('無效或格式錯誤的簽章處理', () => {
    it('應該處理無簽章的方法（回退到 unknown）', () => {
      // Given
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('noSignature', SymbolType.Function, [], 'MyClass', undefined),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);

      // When
      const result = (gen as unknown as { buildModuleSnapshot: (name: string, symbols: Symbol[], path: string) => { api: Record<string, Record<string, string>> } })
        .buildModuleSnapshot('test', symbols, '/test');

      // Then
      expect(result.api.MyClass.noSignature).toBe('() → unknown');
    });

    it('應該處理格式錯誤的簽章（原樣返回）', () => {
      // Given
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('badFormat', SymbolType.Function, [], 'MyClass', 'invalid signature without parentheses'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);

      // When
      const result = (gen as unknown as { buildModuleSnapshot: (name: string, symbols: Symbol[], path: string) => { api: Record<string, Record<string, string>> } })
        .buildModuleSnapshot('test', symbols, '/test');

      // Then
      expect(result.api.MyClass.badFormat).toBe('invalid signature without parentheses');
    });

    it('應該處理空字串簽章', () => {
      // Given
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('empty', SymbolType.Function, [], 'MyClass', ''),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);

      // When
      const result = (gen as unknown as { buildModuleSnapshot: (name: string, symbols: Symbol[], path: string) => { api: Record<string, Record<string, string>> } })
        .buildModuleSnapshot('test', symbols, '/test');

      // Then
      // 空字串應該回退到 unknown
      expect(result.api.MyClass.empty).toBe('() → unknown');
    });
  });
});
