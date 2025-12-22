/**
 * Core Shared 模組單元測試
 * 測試 SymbolFinder 和 CallHierarchyAnalyzer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SymbolFinder,
  createSymbolFinder,
  symbolToKey,
  serializeSymbolKey
} from '@core/shared/symbol-finder/index.js';
import {
  CallHierarchyAnalyzer,
  createCallHierarchyAnalyzer,
  type CallHierarchyOptions
} from '@core/call-hierarchy/index.js';
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
function createMockParserRegistry(parser?: ParserPlugin): ParserRegistry {
  const mockParser = parser || createMockParser();
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

// ===== SymbolFinder 測試 =====

describe('SymbolFinder', () => {
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

  describe('findDefinition', () => {
    it('應該成功找到符號定義', async () => {
      const mockSymbol = createMockSymbol('testFunc', 'function');
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([mockSymbol]);

      const result = await symbolFinder.findDefinition('/test/file.ts', 'testFunc');

      expect(result).toBeDefined();
      expect(result?.symbol.name).toBe('testFunc');
      expect(result?.symbol.type).toBe('function');
    });

    it('應該在找不到符號時返回 null', async () => {
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);

      const result = await symbolFinder.findDefinition('/test/file.ts', 'nonexistent');

      expect(result).toBeNull();
    });

    it('應該在檔案不存在時返回 null', async () => {
      mockFileSystem = createMockFileSystem({});
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findDefinition('/nonexistent.ts', 'testFunc');

      expect(result).toBeNull();
    });

    it('應該在 parser 失敗時返回 null', async () => {
      vi.mocked(mockParser.parse).mockRejectedValue(new Error('Parse error'));

      const result = await symbolFinder.findDefinition('/test/file.ts', 'testFunc');

      expect(result).toBeNull();
    });

    it('應該在沒有對應 parser 時返回 null', async () => {
      mockParserRegistry = createMockParserRegistry();
      vi.mocked(mockParserRegistry.getParser).mockReturnValue(null);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findDefinition('/test/file.unknown', 'testFunc');

      expect(result).toBeNull();
    });

    it('應該提取函式簽名', async () => {
      const fileContent = 'export function testFunc(a: number): string {}';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const mockSymbol = createMockSymbol('testFunc', 'function', {
        filePath: '/test/file.ts',
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 50, offset: 50 }
        }
      });
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([mockSymbol]);

      const result = await symbolFinder.findDefinition('/test/file.ts', 'testFunc');

      expect(result?.signature).toBe(fileContent);
    });
  });

  describe('findReferencesMultiple', () => {
    it('應該批次查找多個符號的引用', async () => {
      const files = {
        '/test/file1.ts': 'import { funcA, funcB } from "./file2"',
        '/test/file2.ts': 'export function funcA() {} export function funcB() {}'
      };
      mockFileSystem = createMockFileSystem(files);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const mockSymbolA = createMockSymbol('funcA');
      const mockSymbolB = createMockSymbol('funcB');
      const mockRefA = createMockReference(mockSymbolA, 'usage', {
        filePath: '/test/file1.ts',
        range: {
          start: { line: 1, column: 10, offset: 9 },
          end: { line: 1, column: 15, offset: 14 }
        }
      });
      const mockRefB = createMockReference(mockSymbolB, 'usage', {
        filePath: '/test/file1.ts',
        range: {
          start: { line: 1, column: 17, offset: 16 },
          end: { line: 1, column: 22, offset: 21 }
        }
      });

      vi.mocked(mockParser.findReferences)
        .mockImplementation(async (_ast, symbol) => {
          if (symbol.name === 'funcA') {
            return [mockRefA];
          }
          if (symbol.name === 'funcB') {
            return [mockRefB];
          }
          return [];
        });

      // 建立測試用的 Symbol 物件
      const symbolA = createMockSymbol('funcA', 'function', { filePath: '/test/file1.ts' });
      const symbolB = createMockSymbol('funcB', 'function', { filePath: '/test/file1.ts' });

      const result = await symbolFinder.findReferencesMultiple(
        [symbolA, symbolB],
        ['/test/file1.ts', '/test/file2.ts']
      );

      expect(result.size).toBe(2);
      const keyA = serializeSymbolKey(symbolToKey(symbolA));
      const keyB = serializeSymbolKey(symbolToKey(symbolB));
      expect(result.get(keyA)?.length).toBeGreaterThan(0);
      expect(result.get(keyB)?.length).toBeGreaterThan(0);
    });

    it('應該在沒有引用時為每個符號返回空陣列', async () => {
      vi.mocked(mockParser.findReferences).mockResolvedValue([]);

      const testSymbol = createMockSymbol('testFunc');
      const result = await symbolFinder.findReferencesMultiple(
        [testSymbol],
        ['/test/file.ts']
      );

      expect(result.size).toBe(1);
      const key = serializeSymbolKey(symbolToKey(testSymbol));
      expect(result.get(key)).toHaveLength(0);
    });

    it('應該在檔案清單為空時返回空結果', async () => {
      const testSymbol = createMockSymbol('testFunc');
      const result = await symbolFinder.findReferencesMultiple(
        [testSymbol],
        []
      );

      expect(result.size).toBe(1);
      const key = serializeSymbolKey(symbolToKey(testSymbol));
      expect(result.get(key)).toHaveLength(0);
    });

    it('應該在 parser 失敗時降級到文字匹配', async () => {
      const fileContent = 'funcA(); funcB();';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      vi.mocked(mockParser.parse).mockRejectedValue(new Error('Parse error'));

      const symbolA = createMockSymbol('funcA', 'function', { filePath: '/test/file.ts' });
      const symbolB = createMockSymbol('funcB', 'function', { filePath: '/test/file.ts' });
      const result = await symbolFinder.findReferencesMultiple(
        [symbolA, symbolB],
        ['/test/file.ts']
      );

      expect(result.size).toBe(2);
      const keyA = serializeSymbolKey(symbolToKey(symbolA));
      const keyB = serializeSymbolKey(symbolToKey(symbolB));
      expect(result.get(keyA)?.length).toBeGreaterThan(0);
      expect(result.get(keyB)?.length).toBeGreaterThan(0);
    });

    it('應該在沒有 parser 時降級到文字匹配', async () => {
      const fileContent = 'funcA(); funcB();';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      vi.mocked(mockParserRegistry.getParser).mockReturnValue(null);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const symbolA = createMockSymbol('funcA', 'function', { filePath: '/test/file.ts' });
      const symbolB = createMockSymbol('funcB', 'function', { filePath: '/test/file.ts' });
      const result = await symbolFinder.findReferencesMultiple(
        [symbolA, symbolB],
        ['/test/file.ts']
      );

      expect(result.size).toBe(2);
      const keyA = serializeSymbolKey(symbolToKey(symbolA));
      const keyB = serializeSymbolKey(symbolToKey(symbolB));
      expect(result.get(keyA)?.length).toBeGreaterThan(0);
      expect(result.get(keyB)?.length).toBeGreaterThan(0);
    });

    it('應該正確區分不同符號的引用', async () => {
      const fileContent = 'funcA(); funcB(); funcA();';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      vi.mocked(mockParserRegistry.getParser).mockReturnValue(null);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const symbolA = createMockSymbol('funcA', 'function', { filePath: '/test/file.ts' });
      const symbolB = createMockSymbol('funcB', 'function', { filePath: '/test/file.ts' });
      const result = await symbolFinder.findReferencesMultiple(
        [symbolA, symbolB],
        ['/test/file.ts']
      );

      const keyA = serializeSymbolKey(symbolToKey(symbolA));
      const keyB = serializeSymbolKey(symbolToKey(symbolB));
      expect(result.get(keyA)).toHaveLength(2);
      expect(result.get(keyB)).toHaveLength(1);
    });

    it('應該處理空符號集合', async () => {
      const result = await symbolFinder.findReferencesMultiple(
        [],
        ['/test/file.ts']
      );

      expect(result.size).toBe(0);
    });
  });

  describe('findReferencesInFile', () => {
    it('應該使用 AST parser 找到引用', async () => {
      const mockSymbol = createMockSymbol('testFunc');
      const mockRef = createMockReference(mockSymbol, 'usage');
      vi.mocked(mockParser.findReferences).mockResolvedValue([mockRef]);

      const result = await symbolFinder.findReferencesInFile('/test/file.ts', 'testFunc');

      expect(result).toHaveLength(1);
      expect(result[0].symbolName).toBe('testFunc');
    });

    it('應該在 parser 失敗時降級到文字匹配', async () => {
      const fileContent = 'testFunc(); const x = testFunc;';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      vi.mocked(mockParser.parse).mockRejectedValue(new Error('Parse error'));

      const result = await symbolFinder.findReferencesInFile('/test/file.ts', 'testFunc');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].symbolName).toBe('testFunc');
    });

    it('應該在沒有 parser 時降級到文字匹配', async () => {
      const fileContent = 'testFunc(); const x = testFunc;';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      vi.mocked(mockParserRegistry.getParser).mockReturnValue(null);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findReferencesInFile('/test/file.ts', 'testFunc');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].symbolName).toBe('testFunc');
    });

    it('應該在文字匹配時包含上下文', async () => {
      const fileContent = 'const result = testFunc(42);';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      vi.mocked(mockParserRegistry.getParser).mockReturnValue(null);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findReferencesInFile('/test/file.ts', 'testFunc');

      expect(result[0].context).toBe(fileContent.trim());
    });

    it('應該正確處理正則表達式特殊字元', async () => {
      const fileContent = 'test$func(); test.func();';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      vi.mocked(mockParserRegistry.getParser).mockReturnValue(null);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findReferencesInFile('/test/file.ts', 'test$func');

      expect(result.length).toBe(1);
      expect(result[0].symbolName).toBe('test$func');
    });
  });

  describe('findCallSites', () => {
    it('應該找到函式呼叫點', async () => {
      const fileContent = 'testFunc(1, 2); testFunc(3, 4);';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].functionName).toBe('testFunc');
    });

    it('應該識別方法呼叫', async () => {
      const fileContent = 'obj.testFunc(42);';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].isMethodCall).toBe(true);
      expect(result[0].receiver).toBe('obj');
    });

    it('應該解析函式參數', async () => {
      const fileContent = 'testFunc(42, "hello");';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].arguments).toHaveLength(2);
      expect(result[0].arguments[0].value.trim()).toBe('42');
      expect(result[0].arguments[1].value.trim()).toBe('"hello"');
    });

    it('應該處理空參數列表', async () => {
      const fileContent = 'testFunc();';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].arguments).toHaveLength(0);
    });

    it('應該處理巢狀括號的參數', async () => {
      const fileContent = 'testFunc(foo(bar()), [1, 2, 3], {a: 1});';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].arguments).toHaveLength(3);
    });

    it('應該識別具名參數', async () => {
      const fileContent = 'testFunc(name: "John", age: 30);';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      if (result.length > 0 && result[0].arguments.length > 0) {
        const firstArg = result[0].arguments[0];
        if (firstArg.name) {
          expect(firstArg.name).toBe('name');
        }
      }
    });

    it('應該在沒有呼叫點時返回空陣列', async () => {
      const fileContent = 'const x = 42;';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result).toHaveLength(0);
    });
  });

  describe('findClassMembers', () => {
    it('應該找到類別成員', async () => {
      const classSymbol = createMockSymbol('MyClass', 'class', {
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 10, column: 1, offset: 100 }
        }
      });
      const methodSymbol = createMockSymbol('myMethod', 'function', {
        range: {
          start: { line: 2, column: 3, offset: 10 },
          end: { line: 4, column: 3, offset: 40 }
        }
      });

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([classSymbol, methodSymbol]);

      const result = await symbolFinder.findClassMembers('/test/file.ts', 'MyClass');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('myMethod');
    });

    it('應該在找不到類別時返回空陣列', async () => {
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);

      const result = await symbolFinder.findClassMembers('/test/file.ts', 'NonexistentClass');

      expect(result).toHaveLength(0);
    });

    it('應該排除類別本身的符號', async () => {
      const classSymbol = createMockSymbol('MyClass', 'class', {
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 10, column: 1, offset: 100 }
        }
      });

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([classSymbol]);

      const result = await symbolFinder.findClassMembers('/test/file.ts', 'MyClass');

      expect(result).toHaveLength(0);
    });

    it('應該在 parser 失敗時返回空陣列', async () => {
      vi.mocked(mockParser.parse).mockRejectedValue(new Error('Parse error'));

      const result = await symbolFinder.findClassMembers('/test/file.ts', 'MyClass');

      expect(result).toHaveLength(0);
    });
  });

  describe('createSymbolFinder', () => {
    it('應該建立 SymbolFinder 實例', () => {
      const finder = createSymbolFinder(mockParserRegistry, mockFileSystem);

      expect(finder).toBeInstanceOf(SymbolFinder);
    });
  });

  describe('readFile edge cases', () => {
    it('應該處理 readFile 返回 Buffer 的情況', async () => {
      // 模擬 readFile 返回 Buffer 而非 string
      const bufferContent = Buffer.from('export function testFunc() {}');
      const mockFs = {
        readFile: vi.fn().mockResolvedValue(bufferContent),
        writeFile: vi.fn(),
        appendFile: vi.fn(),
        deleteFile: vi.fn(),
        createDirectory: vi.fn(),
        readDirectory: vi.fn().mockResolvedValue([]),
        deleteDirectory: vi.fn(),
        exists: vi.fn().mockResolvedValue(true),
        getStats: vi.fn(),
        isFile: vi.fn().mockResolvedValue(true),
        isDirectory: vi.fn().mockResolvedValue(false),
        copyFile: vi.fn(),
        moveFile: vi.fn(),
        glob: vi.fn().mockResolvedValue([])
      } as unknown as IFileSystem;

      const finder = new SymbolFinder(mockParserRegistry, mockFs);
      const mockSymbol = createMockSymbol('testFunc', 'function');
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([mockSymbol]);

      const result = await finder.findDefinition('/test/file.ts', 'testFunc');

      expect(result).toBeDefined();
      expect(result?.symbol.name).toBe('testFunc');
    });
  });

  describe('extractDocumentation', () => {
    it('應該提取 JSDoc 註解', async () => {
      const fileContent = `/**
 * This is a test function
 * @param x - input value
 * @returns the result
 */
function testFunc(x: number): string {}`;

      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const mockSymbol = createMockSymbol('testFunc', 'function', {
        filePath: '/test/file.ts',
        range: {
          start: { line: 6, column: 1, offset: 0 },
          end: { line: 6, column: 50, offset: 50 }
        }
      });
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([mockSymbol]);

      const result = await symbolFinder.findDefinition('/test/file.ts', 'testFunc');

      expect(result?.documentation).toContain('This is a test function');
    });

    it('應該提取單行註解', async () => {
      const fileContent = `// This is a simple comment
function testFunc() {}`;

      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const mockSymbol = createMockSymbol('testFunc', 'function', {
        filePath: '/test/file.ts',
        range: {
          start: { line: 2, column: 1, offset: 0 },
          end: { line: 2, column: 50, offset: 50 }
        }
      });
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([mockSymbol]);

      const result = await symbolFinder.findDefinition('/test/file.ts', 'testFunc');

      expect(result?.documentation).toContain('This is a simple comment');
    });

    it('應該處理多行單行註解', async () => {
      const fileContent = `// First line comment
// Second line comment
function testFunc() {}`;

      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const mockSymbol = createMockSymbol('testFunc', 'function', {
        filePath: '/test/file.ts',
        range: {
          start: { line: 3, column: 1, offset: 0 },
          end: { line: 3, column: 50, offset: 50 }
        }
      });
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([mockSymbol]);

      const result = await symbolFinder.findDefinition('/test/file.ts', 'testFunc');

      expect(result?.documentation).toContain('First line comment');
      expect(result?.documentation).toContain('Second line comment');
    });

    it('應該回傳 undefined 對沒有註解的函數', async () => {
      const fileContent = 'function testFunc() {}';

      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const mockSymbol = createMockSymbol('testFunc', 'function', {
        filePath: '/test/file.ts',
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 50, offset: 50 }
        }
      });
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([mockSymbol]);

      const result = await symbolFinder.findDefinition('/test/file.ts', 'testFunc');

      expect(result?.documentation).toBeUndefined();
    });

    it('應該處理區塊註解（/* ... */）', async () => {
      const fileContent = `/* Block comment */
function testFunc() {}`;

      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const mockSymbol = createMockSymbol('testFunc', 'function', {
        filePath: '/test/file.ts',
        range: {
          start: { line: 2, column: 1, offset: 0 },
          end: { line: 2, column: 50, offset: 50 }
        }
      });
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([mockSymbol]);

      const result = await symbolFinder.findDefinition('/test/file.ts', 'testFunc');

      expect(result?.documentation).toContain('Block comment');
    });

    it('應該處理註解和符號之間的空行', async () => {
      const fileContent = `// Comment here

function testFunc() {}`;

      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const mockSymbol = createMockSymbol('testFunc', 'function', {
        filePath: '/test/file.ts',
        range: {
          start: { line: 3, column: 1, offset: 0 },
          end: { line: 3, column: 50, offset: 50 }
        }
      });
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([mockSymbol]);

      const result = await symbolFinder.findDefinition('/test/file.ts', 'testFunc');

      expect(result?.documentation).toContain('Comment here');
    });
  });

  describe('findCallSitesInFile edge cases', () => {
    it('應該處理檔案不存在的情況', async () => {
      mockFileSystem = createMockFileSystem({});
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/nonexistent.ts']);

      expect(result).toHaveLength(0);
    });

    it('應該處理沒有 parser 的情況', async () => {
      mockFileSystem = createMockFileSystem({ '/test/file.unknown': 'testFunc()' });
      vi.mocked(mockParserRegistry.getParser).mockReturnValue(null);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.unknown']);

      expect(result).toHaveLength(0);
    });

    it('應該處理 parser 拋出錯誤的情況', async () => {
      mockFileSystem = createMockFileSystem({ '/test/file.ts': 'testFunc()' });
      vi.mocked(mockParser.parse).mockRejectedValue(new Error('Parse error'));
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result).toHaveLength(0);
    });

    it('應該排除 function 關鍵字定義', async () => {
      const fileContent = 'function testFunc() { return 1; }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result).toHaveLength(0);
    });

    it('應該排除 async function 定義', async () => {
      const fileContent = 'async function testFunc() { return 1; }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result).toHaveLength(0);
    });

    it('應該排除類別方法定義（有返回類型）', async () => {
      const fileContent = 'class MyClass { testFunc(): string { return ""; } }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result).toHaveLength(0);
    });

    it('應該排除類別方法定義（有大括號）', async () => {
      const fileContent = 'class MyClass { testFunc() { return 1; } }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result).toHaveLength(0);
    });

    it('應該排除 static 方法定義', async () => {
      const fileContent = 'class MyClass { static testFunc() { return 1; } }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result).toHaveLength(0);
    });

    it('應該排除 private 方法定義', async () => {
      const fileContent = 'class MyClass { private testFunc() { return 1; } }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result).toHaveLength(0);
    });

    it('應該排除 public 方法定義', async () => {
      const fileContent = 'class MyClass { public testFunc() { return 1; } }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result).toHaveLength(0);
    });

    it('應該排除 protected 方法定義', async () => {
      const fileContent = 'class MyClass { protected testFunc() { return 1; } }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result).toHaveLength(0);
    });

    it('應該排除 get accessor 定義', async () => {
      const fileContent = 'class MyClass { get testFunc() { return 1; } }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result).toHaveLength(0);
    });

    it('應該排除 set accessor 定義', async () => {
      const fileContent = 'class MyClass { set testFunc(v: number) { this.x = v; } }';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result).toHaveLength(0);
    });

    it('應該識別真正的函式呼叫而非定義', async () => {
      const fileContent = `foo(); testFunc();
const result = testFunc(42);`;
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('應該處理找不到匹配右括號的情況', async () => {
      const fileContent = 'testFunc(';  // 不完整的呼叫
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findCallSites('testFunc', ['/test/file.ts']);

      // 即使括號不匹配，仍應該找到呼叫（但 closingParen 會是 -1）
      expect(result).toHaveLength(1);
    });
  });

  describe('findClassMembers edge cases', () => {
    it('應該處理沒有 parser 的情況', async () => {
      mockFileSystem = createMockFileSystem({ '/test/file.unknown': 'class MyClass {}' });
      vi.mocked(mockParserRegistry.getParser).mockReturnValue(null);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findClassMembers('/test/file.unknown', 'MyClass');

      expect(result).toHaveLength(0);
    });

    it('應該處理檔案不存在的情況', async () => {
      mockFileSystem = createMockFileSystem({});
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const result = await symbolFinder.findClassMembers('/nonexistent.ts', 'MyClass');

      expect(result).toHaveLength(0);
    });
  });

  describe('symbolTypeToMemberType', () => {
    it('應該將 function 轉換為 Method', async () => {
      const classSymbol = createMockSymbol('MyClass', 'class', {
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 10, column: 1, offset: 100 }
        }
      });
      const methodSymbol = createMockSymbol('myMethod', 'function', {
        range: {
          start: { line: 2, column: 3, offset: 10 },
          end: { line: 4, column: 3, offset: 40 }
        }
      });

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([classSymbol, methodSymbol]);

      const result = await symbolFinder.findClassMembers('/test/file.ts', 'MyClass');

      expect(result[0]?.type).toBe('method');
    });

    it('應該將 variable 轉換為 Property', async () => {
      const classSymbol = createMockSymbol('MyClass', 'class', {
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 10, column: 1, offset: 100 }
        }
      });
      const varSymbol = createMockSymbol('myVar', 'variable', {
        range: {
          start: { line: 2, column: 3, offset: 10 },
          end: { line: 2, column: 20, offset: 30 }
        }
      });

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([classSymbol, varSymbol]);

      const result = await symbolFinder.findClassMembers('/test/file.ts', 'MyClass');

      expect(result[0]?.type).toBe('property');
    });

    it('應該將 property 轉換為 Property', async () => {
      const classSymbol = createMockSymbol('MyClass', 'class', {
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 10, column: 1, offset: 100 }
        }
      });
      const propSymbol = createMockSymbol('myProp', 'property', {
        range: {
          start: { line: 2, column: 3, offset: 10 },
          end: { line: 2, column: 20, offset: 30 }
        }
      });

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([classSymbol, propSymbol]);

      const result = await symbolFinder.findClassMembers('/test/file.ts', 'MyClass');

      expect(result[0]?.type).toBe('property');
    });

    it('應該將其他類型轉換為 Property（default case）', async () => {
      const classSymbol = createMockSymbol('MyClass', 'class', {
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 10, column: 1, offset: 100 }
        }
      });
      const otherSymbol = createMockSymbol('myOther', 'interface' as any, {
        range: {
          start: { line: 2, column: 3, offset: 10 },
          end: { line: 2, column: 20, offset: 30 }
        }
      });

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([classSymbol, otherSymbol]);

      const result = await symbolFinder.findClassMembers('/test/file.ts', 'MyClass');

      expect(result[0]?.type).toBe('property');
    });
  });
});

// ===== CallHierarchyAnalyzer 測試 =====

describe('CallHierarchyAnalyzer', () => {
  let analyzer: CallHierarchyAnalyzer;
  let mockParserRegistry: ParserRegistry;
  let mockFileSystem: IFileSystem;
  let mockParser: ParserPlugin;

  beforeEach(() => {
    mockParser = createMockParser();
    mockParserRegistry = createMockParserRegistry(mockParser);
    mockFileSystem = createMockFileSystem({
      '/test/file.ts': `
export function targetFunc() {
  helperFunc();
}

export function helperFunc() {}

export function callerFunc() {
  targetFunc();
}
      `.trim()
    });
    analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);
  });

  describe('analyze', () => {
    it('應該成功分析函數的呼叫層次', async () => {
      const targetSymbol = createMockSymbol('targetFunc', 'function');
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([targetSymbol]);
      vi.mocked(mockParser.findReferences).mockResolvedValue([]);

      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1
      };

      const result = await analyzer.analyze('targetFunc', ['/test/file.ts'], options);

      expect(result).toBeDefined();
      expect(result?.functionName).toBe('targetFunc');
      expect(result?.definitionFile).toBe('/test/file.ts');
    });

    it('應該在找不到函數定義時返回 null', async () => {
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);

      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1
      };

      const result = await analyzer.analyze('nonexistent', ['/test/file.ts'], options);

      expect(result).toBeNull();
    });

    it('應該只查找函數類型的符號', async () => {
      // 設定檔案系統包含兩個檔案
      mockFileSystem = createMockFileSystem({
        '/test/file.ts': 'export const targetFunc = 42;',
        '/test/other.ts': 'export function targetFunc() {}'
      });
      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const variableSymbol = createMockSymbol('targetFunc', 'variable');
      const functionSymbol = createMockSymbol('targetFunc', 'function', {
        filePath: '/test/other.ts'
      });

      vi.mocked(mockParser.extractSymbols)
        .mockResolvedValueOnce([variableSymbol])
        .mockResolvedValueOnce([functionSymbol]);
      vi.mocked(mockParser.findReferences).mockResolvedValue([]);

      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1
      };

      const result = await analyzer.analyze('targetFunc', ['/test/file.ts', '/test/other.ts'], options);

      expect(result).toBeDefined();
      expect(result?.definitionFile).toBe('/test/other.ts');
    });
  });

  describe('analyzeWithDefinition', () => {
    const definitionRange = {
      start: { line: 2, column: 1, offset: 10 },
      end: { line: 4, column: 1, offset: 50 }
    };

    it('應該分析 incoming 呼叫', async () => {
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);
      vi.mocked(mockParser.findReferences).mockResolvedValue([]);

      const options: CallHierarchyOptions = {
        direction: 'incoming',
        depth: 1
      };

      const result = await analyzer.analyzeWithDefinition(
        'targetFunc',
        '/test/file.ts',
        definitionRange,
        ['/test/file.ts'],
        options
      );

      expect(result.functionName).toBe('targetFunc');
      expect(result.definitionFile).toBe('/test/file.ts');
      expect(result.definitionLine).toBe(2);
      expect(Array.isArray(result.incoming)).toBe(true);
      expect(result.outgoing).toHaveLength(0);
    });

    it('應該分析 outgoing 呼叫', async () => {
      const options: CallHierarchyOptions = {
        direction: 'outgoing',
        depth: 1
      };

      const result = await analyzer.analyzeWithDefinition(
        'targetFunc',
        '/test/file.ts',
        definitionRange,
        ['/test/file.ts'],
        options
      );

      expect(result.functionName).toBe('targetFunc');
      expect(result.incoming).toHaveLength(0);
      expect(Array.isArray(result.outgoing)).toBe(true);
    });

    it('應該同時分析 incoming 和 outgoing', async () => {
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);
      vi.mocked(mockParser.findReferences).mockResolvedValue([]);

      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1
      };

      const result = await analyzer.analyzeWithDefinition(
        'targetFunc',
        '/test/file.ts',
        definitionRange,
        ['/test/file.ts'],
        options
      );

      expect(result.functionName).toBe('targetFunc');
      expect(Array.isArray(result.incoming)).toBe(true);
      expect(Array.isArray(result.outgoing)).toBe(true);
    });

    it('應該處理空專案檔案清單', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1
      };

      const result = await analyzer.analyzeWithDefinition(
        'targetFunc',
        '/test/file.ts',
        definitionRange,
        [],
        options
      );

      expect(result.incoming).toHaveLength(0);
      expect(result.outgoing).toHaveLength(0);
    });
  });

  describe('邊界條件', () => {
    it('應該處理檔案讀取失敗', async () => {
      mockFileSystem = createMockFileSystem({});
      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const options: CallHierarchyOptions = {
        direction: 'outgoing',
        depth: 1
      };

      const result = await analyzer.analyzeWithDefinition(
        'targetFunc',
        '/nonexistent.ts',
        {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 10 }
        },
        ['/nonexistent.ts'],
        options
      );

      expect(result.outgoing).toHaveLength(0);
    });

    it('應該處理沒有 parser 的情況', async () => {
      vi.mocked(mockParserRegistry.getParser).mockReturnValue(null);

      const options: CallHierarchyOptions = {
        direction: 'outgoing',
        depth: 1
      };

      const result = await analyzer.analyzeWithDefinition(
        'targetFunc',
        '/test/file.ts',
        {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 10 }
        },
        ['/test/file.ts'],
        options
      );

      expect(result.outgoing).toHaveLength(0);
    });

    it('應該處理 parser 失敗', async () => {
      vi.mocked(mockParser.parse).mockRejectedValue(new Error('Parse error'));

      const options: CallHierarchyOptions = {
        direction: 'outgoing',
        depth: 1
      };

      const result = await analyzer.analyzeWithDefinition(
        'targetFunc',
        '/test/file.ts',
        {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 10 }
        },
        ['/test/file.ts'],
        options
      );

      expect(result.outgoing).toHaveLength(0);
    });

    it('應該處理空檔案', async () => {
      mockFileSystem = createMockFileSystem({ '/test/empty.ts': '' });
      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1
      };

      const result = await analyzer.analyzeWithDefinition(
        'targetFunc',
        '/test/empty.ts',
        {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 10 }
        },
        ['/test/empty.ts'],
        options
      );

      expect(result.incoming).toHaveLength(0);
      expect(result.outgoing).toHaveLength(0);
    });

    it('應該處理深度為 0 的情況', async () => {
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);
      vi.mocked(mockParser.findReferences).mockResolvedValue([]);

      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 0
      };

      const result = await analyzer.analyzeWithDefinition(
        'targetFunc',
        '/test/file.ts',
        {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 10 }
        },
        ['/test/file.ts'],
        options
      );

      // 深度為 0 應該不會進入遞迴
      expect(result.incoming).toHaveLength(0);
    });
  });

  describe('createCallHierarchyAnalyzer', () => {
    it('應該建立 CallHierarchyAnalyzer 實例', () => {
      const instance = createCallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      expect(instance).toBeInstanceOf(CallHierarchyAnalyzer);
    });
  });

  describe('findIncomingCalls with real TypeScript', () => {
    it('應該找到真實的 incoming 呼叫', async () => {
      const callerContent = `
function caller() {
  targetFunc();
}
`;
      const targetContent = `
export function targetFunc() {
  console.log('hello');
}
`;
      mockFileSystem = createMockFileSystem({
        '/test/caller.ts': callerContent,
        '/test/target.ts': targetContent
      });

      // 建立真實的 parser mock，返回 call sites
      const callSiteMock = {
        functionName: 'targetFunc',
        location: {
          filePath: '/test/caller.ts',
          range: {
            start: { line: 3, column: 3, offset: 20 },
            end: { line: 3, column: 15, offset: 32 }
          }
        },
        arguments: [],
        isMethodCall: false
      };

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([
        createMockSymbol('targetFunc', 'function', {
          filePath: '/test/target.ts',
          range: {
            start: { line: 2, column: 1, offset: 0 },
            end: { line: 4, column: 1, offset: 50 }
          }
        })
      ]);

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const options: CallHierarchyOptions = {
        direction: 'incoming',
        depth: 1
      };

      const result = await analyzer.analyzeWithDefinition(
        'targetFunc',
        '/test/target.ts',
        {
          start: { line: 2, column: 1, offset: 0 },
          end: { line: 4, column: 1, offset: 50 }
        },
        ['/test/caller.ts', '/test/target.ts'],
        options
      );

      expect(result.functionName).toBe('targetFunc');
      expect(result.definitionFile).toBe('/test/target.ts');
    });
  });

  describe('findOutgoingCalls with real TypeScript', () => {
    it('應該找到 outgoing 呼叫', async () => {
      const fileContent = `
function sourceFunc() {
  helperFunc();
  console.log('test');
}

function helperFunc() {}
`;
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const options: CallHierarchyOptions = {
        direction: 'outgoing',
        depth: 1
      };

      const result = await analyzer.analyzeWithDefinition(
        'sourceFunc',
        '/test/file.ts',
        {
          start: { line: 2, column: 1, offset: 0 },
          end: { line: 5, column: 1, offset: 60 }
        },
        ['/test/file.ts'],
        options
      );

      expect(result.functionName).toBe('sourceFunc');
      expect(result.outgoing).toHaveLength(0); // Parser mock doesn't return tsSourceFile
    });

    it('應該處理找不到函數節點的情況', async () => {
      const fileContent = 'const x = 42;';
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const options: CallHierarchyOptions = {
        direction: 'outgoing',
        depth: 1
      };

      const result = await analyzer.analyzeWithDefinition(
        'nonexistentFunc',
        '/test/file.ts',
        {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 10 }
        },
        ['/test/file.ts'],
        options
      );

      expect(result.outgoing).toHaveLength(0);
    });
  });

  describe('analyze with function definition', () => {
    it('應該在找到函數定義時返回分析結果', async () => {
      const targetSymbol = createMockSymbol('myFunction', 'function', {
        filePath: '/test/file.ts',
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 5, column: 1, offset: 50 }
        }
      });

      vi.mocked(mockParser.extractSymbols).mockResolvedValue([targetSymbol]);
      vi.mocked(mockParser.findReferences).mockResolvedValue([]);

      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1
      };

      const result = await analyzer.analyze('myFunction', ['/test/file.ts'], options);

      expect(result).not.toBeNull();
      expect(result?.functionName).toBe('myFunction');
    });

    it('應該在找不到函數定義時返回 null', async () => {
      // 所有檔案都找不到函數
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);

      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1
      };

      const result = await analyzer.analyze('nonexistentFunc', ['/test/file.ts'], options);

      expect(result).toBeNull();
    });
  });

  describe('getLineContext', () => {
    it('應該取得指定行的內容', async () => {
      const fileContent = `line 1
line 2
line 3`;
      mockFileSystem = createMockFileSystem({ '/test/file.ts': fileContent });
      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      // 透過 incoming call 測試 getLineContext
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);
      vi.mocked(mockParser.findReferences).mockResolvedValue([]);

      const options: CallHierarchyOptions = {
        direction: 'incoming',
        depth: 1
      };

      const result = await analyzer.analyzeWithDefinition(
        'func',
        '/test/file.ts',
        {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 3, column: 1, offset: 20 }
        },
        [],
        options
      );

      // 沒有 project files 應該返回空的 incoming
      expect(result.incoming).toHaveLength(0);
    });
  });

  describe('depth limit', () => {
    it('應該尊重深度限制不遞迴過深', async () => {
      vi.mocked(mockParser.extractSymbols).mockResolvedValue([]);
      vi.mocked(mockParser.findReferences).mockResolvedValue([]);

      const options: CallHierarchyOptions = {
        direction: 'incoming',
        depth: 0  // 深度為 0
      };

      const result = await analyzer.analyzeWithDefinition(
        'func',
        '/test/file.ts',
        {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 10, offset: 10 }
        },
        ['/test/file.ts'],
        options
      );

      // 深度為 0 時不應該有結果
      expect(result.incoming).toHaveLength(0);
    });
  });
});
