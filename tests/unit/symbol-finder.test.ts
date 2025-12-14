/**
 * SymbolFinder 單元測試
 * 根據 PR review 意見補充以下測試：
 * 1. findReferencesMultiple 批次查詢優化
 * 2. findCallSitesInFile 複雜邏輯邊界測試
 * 3. 降級到文字匹配的場景
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SymbolFinder,
  SymbolReferenceType,
  type SymbolReference
} from '@core/shared/symbol-finder.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ParserPlugin } from '@infrastructure/parser/interface.js';
import type { Symbol, SymbolType, Reference, ReferenceType } from '@shared/types/symbol.js';
import type { AST, Location } from '@shared/types/index.js';

// ===== Mock 工具函數 =====

/**
 * 建立 mock 的 ParserPlugin
 */
function createMockParser(overrides?: Partial<ParserPlugin>): ParserPlugin {
  return {
    name: 'mock-parser',
    version: '1.0.0',
    supportedExtensions: ['.ts', '.js'],
    supportedLanguages: ['typescript', 'javascript'],
    parse: vi.fn().mockResolvedValue({ tsSourceFile: {} } as AST),
    extractSymbols: vi.fn().mockResolvedValue([]),
    findReferences: vi.fn().mockResolvedValue([]),
    extractDependencies: vi.fn().mockResolvedValue([]),
    rename: vi.fn().mockResolvedValue([]),
    extractFunction: vi.fn().mockResolvedValue([]),
    findDefinition: vi.fn().mockResolvedValue(null),
    findUsages: vi.fn().mockResolvedValue([]),
    validate: vi.fn().mockResolvedValue({ isValid: true, errors: [] }),
    dispose: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

/**
 * 建立 mock 的 ParserRegistry
 */
function createMockParserRegistry(parser?: ParserPlugin | null): ParserRegistry {
  const mockParser = parser === null ? null : (parser || createMockParser());
  return {
    getParser: vi.fn().mockReturnValue(mockParser)
  } as unknown as ParserRegistry;
}

/**
 * 建立 mock 的 IFileSystem
 */
function createMockFileSystem(files: Record<string, string> = {}): IFileSystem {
  return {
    readFile: vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath in files) {
        return files[filePath];
      }
      throw new Error(`File not found: ${filePath}`);
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    readDirectory: vi.fn().mockResolvedValue([]),
    deleteDirectory: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockImplementation(async (filePath: string) => filePath in files),
    getStats: vi.fn().mockResolvedValue({ isFile: true, isDirectory: false, size: 0 }),
    isFile: vi.fn().mockResolvedValue(true),
    isDirectory: vi.fn().mockResolvedValue(false),
    copyFile: vi.fn().mockResolvedValue(undefined),
    moveFile: vi.fn().mockResolvedValue(undefined),
    glob: vi.fn().mockResolvedValue([])
  } as unknown as IFileSystem;
}

/**
 * 建立 mock 的 Symbol
 */
function createMockSymbol(
  name: string,
  type: SymbolType = 'function',
  location: Partial<Location> = {}
): Symbol {
  return {
    name,
    type,
    location: {
      filePath: location.filePath || '/test/file.ts',
      range: location.range || {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: name.length + 1, offset: name.length }
      }
    },
    scope: undefined,
    modifiers: []
  };
}

/**
 * 建立 mock 的 Reference
 */
function createMockReference(
  symbol: Symbol,
  type: ReferenceType = 'usage',
  location?: Location
): Reference {
  return {
    symbol,
    location: location || symbol.location,
    type
  };
}

// ===== findReferencesMultiple 批次查詢優化測試 =====

describe('SymbolFinder - findReferencesMultiple 批次查詢', () => {
  let symbolFinder: SymbolFinder;
  let mockParserRegistry: ParserRegistry;
  let mockFileSystem: IFileSystem;
  let mockParser: ParserPlugin;

  beforeEach(() => {
    mockParser = createMockParser();
    mockParserRegistry = createMockParserRegistry(mockParser);
    mockFileSystem = createMockFileSystem({
      '/test/file.ts': 'export function testFunc() {}'
    });
    symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);
  });

  describe('批次查詢多符號', () => {
    it('應該一次遍歷查詢多個符號的引用', async () => {
      const files = {
        '/test/main.ts': 'funcA(); funcB(); funcC();',
        '/test/helper.ts': 'funcA(); funcB();',
        '/test/utils.ts': 'funcC();'
      };
      mockFileSystem = createMockFileSystem(files);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const mockRefA = createMockReference(createMockSymbol('funcA'), 'usage');
      const mockRefB = createMockReference(createMockSymbol('funcB'), 'usage');
      const mockRefC = createMockReference(createMockSymbol('funcC'), 'usage');

      vi.mocked(mockParser.findReferences).mockImplementation(async (_ast, symbol) => {
        if (symbol.name === 'funcA') {return [mockRefA];}
        if (symbol.name === 'funcB') {return [mockRefB];}
        if (symbol.name === 'funcC') {return [mockRefC];}
        return [];
      });

      const symbolNames = new Set(['funcA', 'funcB', 'funcC']);
      const projectFiles = ['/test/main.ts', '/test/helper.ts', '/test/utils.ts'];

      const result = await symbolFinder.findReferencesMultiple(symbolNames, projectFiles);

      expect(result.size).toBe(3);
      expect(result.has('funcA')).toBe(true);
      expect(result.has('funcB')).toBe(true);
      expect(result.has('funcC')).toBe(true);
    });

    it('應該為每個符號初始化空陣列', async () => {
      vi.mocked(mockParser.findReferences).mockResolvedValue([]);

      const result = await symbolFinder.findReferencesMultiple(
        new Set(['sym1', 'sym2', 'sym3']),
        ['/test/file.ts']
      );

      expect(result.size).toBe(3);
      expect(result.get('sym1')).toEqual([]);
      expect(result.get('sym2')).toEqual([]);
      expect(result.get('sym3')).toEqual([]);
    });

    it('應該累積多個檔案的引用結果', async () => {
      const files = {
        '/test/file1.ts': 'myFunc();',
        '/test/file2.ts': 'myFunc(); myFunc();',
        '/test/file3.ts': 'myFunc();'
      };
      mockFileSystem = createMockFileSystem(files);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const mockRef = createMockReference(createMockSymbol('myFunc'), 'usage');
      vi.mocked(mockParser.findReferences).mockResolvedValue([mockRef]);

      const result = await symbolFinder.findReferencesMultiple(
        new Set(['myFunc']),
        ['/test/file1.ts', '/test/file2.ts', '/test/file3.ts']
      );

      // 每個檔案都會回傳一個 reference
      expect(result.get('myFunc')?.length).toBe(3);
    });

    it('應該跳過無法讀取的檔案', async () => {
      const files = {
        '/test/valid.ts': 'funcA();'
        // '/test/invalid.ts' 不存在
      };
      mockFileSystem = createMockFileSystem(files);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const mockRef = createMockReference(createMockSymbol('funcA'), 'usage');
      vi.mocked(mockParser.findReferences).mockResolvedValue([mockRef]);

      const result = await symbolFinder.findReferencesMultiple(
        new Set(['funcA']),
        ['/test/valid.ts', '/test/invalid.ts']
      );

      expect(result.get('funcA')?.length).toBe(1);
    });

    it('應該正確區分 definition 和 usage 類型', async () => {
      mockFileSystem = createMockFileSystem({ '/test/file.ts': 'function foo() {} foo();' });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const defRef = createMockReference(createMockSymbol('foo'), 'definition');
      const usageRef = createMockReference(createMockSymbol('foo'), 'usage');
      vi.mocked(mockParser.findReferences).mockResolvedValue([defRef, usageRef]);

      const result = await symbolFinder.findReferencesMultiple(
        new Set(['foo']),
        ['/test/file.ts']
      );

      const refs = result.get('foo') || [];
      expect(refs.some(r => r.type === SymbolReferenceType.Definition)).toBe(true);
      expect(refs.some(r => r.type === SymbolReferenceType.Usage)).toBe(true);
    });
  });

  describe('效能優化驗證', () => {
    it('應該只遍歷檔案一次（O(M) 而非 O(N*M)）', async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 10; i++) {
        files[`/test/file${i}.ts`] = 'sym1(); sym2(); sym3();';
      }
      mockFileSystem = createMockFileSystem(files);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      vi.mocked(mockParser.findReferences).mockResolvedValue([]);

      const readFileSpy = vi.mocked(mockFileSystem.readFile);

      await symbolFinder.findReferencesMultiple(
        new Set(['sym1', 'sym2', 'sym3']),
        Object.keys(files)
      );

      // 每個檔案應該只讀取一次
      expect(readFileSpy).toHaveBeenCalledTimes(10);
    });
  });
});

// ===== findCallSitesInFile 複雜邏輯邊界測試 =====

describe('SymbolFinder - findCallSitesInFile 邊界測試', () => {
  let symbolFinder: SymbolFinder;
  let mockParserRegistry: ParserRegistry;
  let mockFileSystem: IFileSystem;
  let mockParser: ParserPlugin;

  beforeEach(() => {
    mockParser = createMockParser();
    mockParserRegistry = createMockParserRegistry(mockParser);
    mockFileSystem = createMockFileSystem({});
    symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);
  });

  describe('排除函式定義本身', () => {
    it('應該排除 function 關鍵字定義', async () => {
      const fileContent = 'function foo() { return 1; }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result).toHaveLength(0);
    });

    it('應該排除 async function 定義', async () => {
      const fileContent = 'async function foo() { await bar(); }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result).toHaveLength(0);
    });

    it('應該排除 export function 定義', async () => {
      const fileContent = 'export function foo() {}';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result).toHaveLength(0);
    });

    it('應該排除 export async function 定義', async () => {
      const fileContent = 'export async function foo() {}';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result).toHaveLength(0);
    });
  });

  describe('排除類別方法定義', () => {
    it('應該排除有返回類型的方法定義', async () => {
      const fileContent = '  foo(): string { return ""; }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result).toHaveLength(0);
    });

    it('應該排除有大括號的方法定義', async () => {
      const fileContent = '  foo() { return 1; }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result).toHaveLength(0);
    });

    it('應該排除 static 方法定義', async () => {
      const fileContent = 'static foo() { return 1; }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result).toHaveLength(0);
    });

    it('應該排除 private 方法定義', async () => {
      const fileContent = 'private foo() { return 1; }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result).toHaveLength(0);
    });

    it('應該排除 public 方法定義', async () => {
      const fileContent = 'public foo() { return 1; }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result).toHaveLength(0);
    });

    it('應該排除 protected 方法定義', async () => {
      const fileContent = 'protected foo() { return 1; }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result).toHaveLength(0);
    });

    it('應該排除 get accessor 定義', async () => {
      const fileContent = 'get foo() { return 1; }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result).toHaveLength(0);
    });

    it('應該排除 set accessor 定義', async () => {
      const fileContent = 'set foo(v: number) { this.x = v; }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result).toHaveLength(0);
    });

    it('應該排除帶參數類型的方法定義', async () => {
      const fileContent = '  foo(a: number, b: string): void { }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result).toHaveLength(0);
    });
  });

  describe('識別真正的函式呼叫', () => {
    it('應該識別獨立的函式呼叫', async () => {
      const fileContent = 'const result = foo();';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].functionName).toBe('foo');
    });

    it('應該識別方法呼叫', async () => {
      const fileContent = 'obj.foo(42);';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].isMethodCall).toBe(true);
      expect(result[0].receiver).toBe('obj');
    });

    it('應該識別鏈式呼叫中的方法', async () => {
      const fileContent = 'a.b.foo().bar();';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result.length).toBeGreaterThan(0);
    });

    it('應該識別回調中的函式呼叫', async () => {
      const fileContent = 'arr.map(x => foo(x));';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result.length).toBeGreaterThan(0);
    });

    it('應該識別 IIFE 中的函式呼叫', async () => {
      const fileContent = '(function() { foo(); })();';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('混合場景測試', () => {
    it('應該正確區分定義和呼叫', async () => {
      const fileContent = `function foo() { return 1; }
const x = foo();
const y = foo();`;
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      // 應該只有 2 個呼叫點，排除函式定義
      expect(result.length).toBe(2);
    });

    it('應該處理同一行多個呼叫', async () => {
      const fileContent = 'foo(); foo(); foo();';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result.length).toBe(3);
    });

    it('應該處理巢狀呼叫', async () => {
      const fileContent = 'foo(bar(baz()));';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result.length).toBe(1);
      expect(result[0].functionName).toBe('foo');
    });
  });

  describe('邊界條件', () => {
    it('應該處理找不到匹配右括號的情況', async () => {
      const fileContent = 'foo(';  // 不完整的呼叫
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      // 即使括號不匹配，仍應該識別為呼叫
      expect(result).toHaveLength(1);
    });

    it('應該處理空參數列表', async () => {
      const fileContent = 'foo();';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result[0].arguments).toHaveLength(0);
    });

    it('應該處理複雜巢狀括號的參數', async () => {
      const fileContent = 'foo(bar(1, 2), [a, b], {x: 1, y: 2});';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result[0].arguments).toHaveLength(3);
    });

    it('應該處理檔案不存在的情況', async () => {
      mockFileSystem = createMockFileSystem({});
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/nonexistent.ts', 'foo');

      expect(result).toHaveLength(0);
    });

    it('應該處理沒有 parser 的情況', async () => {
      mockFileSystem = createMockFileSystem({ '/test/file.txt': 'foo()' });
      mockParserRegistry = createMockParserRegistry(null);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.txt', 'foo');

      expect(result).toHaveLength(0);
    });

    it('應該處理 parser 拋出錯誤的情況', async () => {
      mockFileSystem = createMockFileSystem({ '/test/file.ts': 'foo()' });
      vi.mocked(mockParser.parse).mockRejectedValue(new Error('Parse error'));
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSitesInFile('/test/file.ts', 'foo');

      expect(result).toHaveLength(0);
    });
  });
});

// ===== 降級到文字匹配的場景測試 =====

describe('SymbolFinder - 文字匹配降級', () => {
  let symbolFinder: SymbolFinder;
  let mockParserRegistry: ParserRegistry;
  let mockFileSystem: IFileSystem;
  let mockParser: ParserPlugin;

  beforeEach(() => {
    mockParser = createMockParser();
    mockParserRegistry = createMockParserRegistry(mockParser);
    mockFileSystem = createMockFileSystem({});
    symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);
  });

  describe('findReferencesMultiple 降級場景', () => {
    it('當 parser 失敗時應降級到文字匹配', async () => {
      const fileContent = 'funcA(); funcB();';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      vi.mocked(mockParser.parse).mockRejectedValue(new Error('Parse error'));

      const result = await symbolFinder.findReferencesMultiple(
        new Set(['funcA', 'funcB']),
        ['/test/file.ts']
      );

      expect(result.size).toBe(2);
      expect(result.get('funcA')?.length).toBeGreaterThan(0);
      expect(result.get('funcB')?.length).toBeGreaterThan(0);
    });

    it('當沒有 parser 時應降級到文字匹配', async () => {
      const fileContent = 'funcA(); funcB();';
      mockFileSystem = createMockFileSystem({ '/test/file.unknown': fileContent });
      mockParserRegistry = createMockParserRegistry(null);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findReferencesMultiple(
        new Set(['funcA', 'funcB']),
        ['/test/file.unknown']
      );

      expect(result.size).toBe(2);
      expect(result.get('funcA')?.length).toBeGreaterThan(0);
      expect(result.get('funcB')?.length).toBeGreaterThan(0);
    });
  });

  describe('findReferencesInFile 降級場景', () => {
    it('當 parser 失敗時應降級到文字匹配', async () => {
      const fileContent = 'testFunc(); const x = testFunc;';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      vi.mocked(mockParser.parse).mockRejectedValue(new Error('Parse error'));

      const result = await symbolFinder.findReferencesInFile('/test/file.ts', 'testFunc');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].symbolName).toBe('testFunc');
    });

    it('當沒有 parser 時應降級到文字匹配', async () => {
      const fileContent = 'testFunc(); const x = testFunc;';
      mockFileSystem = createMockFileSystem({ '/test/file.unknown': fileContent });
      mockParserRegistry = createMockParserRegistry(null);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findReferencesInFile('/test/file.unknown', 'testFunc');

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('文字匹配功能測試', () => {
    beforeEach(() => {
      // 強制降級到文字匹配
      mockParserRegistry = createMockParserRegistry(null);
    });

    it('應該正確匹配完整的符號名稱', async () => {
      const fileContent = 'foo fooBar barFoo';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findReferencesInFile('/test/file.ts', 'foo');

      // 應該只匹配 'foo'，不匹配 'fooBar' 或 'barFoo'
      expect(result.length).toBe(1);
    });

    it('應該正確處理多行檔案', async () => {
      const fileContent = `line1 foo
line2 foo bar
line3 foo`;
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findReferencesInFile('/test/file.ts', 'foo');

      expect(result.length).toBe(3);
      expect(result[0].location.range.start.line).toBe(1);
      expect(result[1].location.range.start.line).toBe(2);
      expect(result[2].location.range.start.line).toBe(3);
    });

    it('應該正確計算欄位位置', async () => {
      const fileContent = 'prefix foo suffix';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findReferencesInFile('/test/file.ts', 'foo');

      expect(result[0].location.range.start.column).toBe(8); // 'prefix ' 長度 + 1
    });

    it('應該包含上下文資訊', async () => {
      const fileContent = 'const result = foo(42);';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findReferencesInFile('/test/file.ts', 'foo');

      expect(result[0].context).toBe(fileContent);
    });

    it('應該正確處理正則表達式特殊字元', async () => {
      const fileContent = 'test$func(); test.func();';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findReferencesInFile('/test/file.ts', 'test$func');

      expect(result.length).toBe(1);
    });

    it('應該正確處理帶有 * 的符號名稱', async () => {
      // 雖然 * 不是有效的識別符，但應該正確跳脫
      const fileContent = 'test*func testfunc';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      // 這會被 escapeRegex 正確處理
      const result = await symbolFinder.findReferencesInFile('/test/file.ts', 'test*func');

      expect(result.length).toBe(1);
    });

    it('應該正確跳脫帶有 [] 的符號名稱', async () => {
      // 注意：`[0]` 不是有效的識別符，但 escapeRegex 應正確跳脫
      // 由於 \b 邊界匹配，`test[0]` 中的 `test` 會單獨匹配，而 `[0]` 不會
      const fileContent = 'arr[0] arr';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      // 搜尋 'arr' 應該找到 2 個結果
      const result = await symbolFinder.findReferencesInFile('/test/file.ts', 'arr');

      expect(result.length).toBe(2);
    });
  });

  describe('批次文字匹配功能測試', () => {
    beforeEach(() => {
      mockParserRegistry = createMockParserRegistry(null);
    });

    it('應該正確區分不同符號的引用', async () => {
      const fileContent = 'funcA(); funcB(); funcA();';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findReferencesMultiple(
        new Set(['funcA', 'funcB']),
        ['/test/file.ts']
      );

      expect(result.get('funcA')).toHaveLength(2);
      expect(result.get('funcB')).toHaveLength(1);
    });

    it('應該處理符號在結果 Map 中不存在的情況', async () => {
      const fileContent = 'funcA();';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      // 這個測試確保當 results.get(symbolName) 返回 undefined 時不會出錯
      const result = await symbolFinder.findReferencesMultiple(
        new Set(['funcA']),
        ['/test/file.ts']
      );

      expect(result.get('funcA')).toBeDefined();
    });
  });
});
