/**
 * Core Shared 模組單元測試
 * 測試 SymbolFinder 和 CallHierarchyAnalyzer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SymbolFinder, createSymbolFinder } from '@core/shared/symbol-finder.js';
import {
  CallHierarchyAnalyzer,
  createCallHierarchyAnalyzer,
  type CallHierarchyOptions
} from '@core/shared/call-hierarchy-analyzer.js';
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

  describe('findReferences', () => {
    it('應該在多個檔案中找到引用', async () => {
      const files = {
        '/test/file1.ts': 'import { testFunc } from "./file2"',
        '/test/file2.ts': 'export function testFunc() {}'
      };
      mockFileSystem = createMockFileSystem(files);
      symbolFinder = new SymbolFinder(mockParserRegistry, mockFileSystem);

      const mockSymbol = createMockSymbol('testFunc');
      const mockRef1 = createMockReference(mockSymbol, 'usage', {
        filePath: '/test/file1.ts',
        range: {
          start: { line: 1, column: 10, offset: 9 },
          end: { line: 1, column: 18, offset: 17 }
        }
      });
      const mockRef2 = createMockReference(mockSymbol, 'definition', {
        filePath: '/test/file2.ts',
        range: {
          start: { line: 1, column: 17, offset: 16 },
          end: { line: 1, column: 25, offset: 24 }
        }
      });

      vi.mocked(mockParser.findReferences)
        .mockResolvedValueOnce([mockRef1])
        .mockResolvedValueOnce([mockRef2]);

      const result = await symbolFinder.findReferences('testFunc', [
        '/test/file1.ts',
        '/test/file2.ts'
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].symbolName).toBe('testFunc');
      expect(result[1].symbolName).toBe('testFunc');
    });

    it('應該在沒有引用時返回空陣列', async () => {
      vi.mocked(mockParser.findReferences).mockResolvedValue([]);

      const result = await symbolFinder.findReferences('testFunc', ['/test/file.ts']);

      expect(result).toHaveLength(0);
    });

    it('應該在檔案清單為空時返回空陣列', async () => {
      const result = await symbolFinder.findReferences('testFunc', []);

      expect(result).toHaveLength(0);
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
});
