/**
 * CallHierarchyAnalyzer JavaScript 測試
 * 測試呼叫層次分析器對 JavaScript 檔案的處理
 *
 * 注意：目前 CallHierarchyAnalyzer 使用 TypeScript AST (tsSourceFile) 分析呼叫層次
 * JavaScript parser 產生的是 Babel AST (babelAST)，因此：
 * - findOutgoingCalls 對 JS 檔案會返回空陣列（無 tsSourceFile）
 * - findIncomingCalls 依賴 SymbolFinder，可正常運作
 *
 * 此測試驗證：
 * 1. Analyzer 能正確處理 JavaScript 檔案而不拋出錯誤
 * 2. 使用 mock 測試 incoming/outgoing 分析邏輯
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CallHierarchyAnalyzer,
  createCallHierarchyAnalyzer,
  type CallHierarchyOptions,
} from '@core/shared/call-hierarchy-analyzer.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { Location } from '@shared/types/core.js';

// ============================================================================
// Mock 輔助函數
// ============================================================================

function createMockLocation(filePath: string, line: number): Location {
  return {
    filePath,
    range: {
      start: { line, column: 1, offset: 0 },
      end: { line, column: 10, offset: 9 },
    },
  };
}

// ============================================================================
// CallHierarchyAnalyzer JavaScript Tests
// ============================================================================

describe('CallHierarchyAnalyzer - JavaScript', () => {
  let analyzer: CallHierarchyAnalyzer;
  let mockParserRegistry: ParserRegistry;
  let mockFileSystem: IFileSystem;

  beforeEach(() => {
    // 建立 mock JavaScript parser（返回 babelAST 而非 tsSourceFile）
    const mockParser = {
      parse: vi.fn().mockResolvedValue({
        babelAST: {}, // JavaScript parser 返回 babelAST
        sourceCode: 'const x = 1;',
        // 注意：沒有 tsSourceFile
      }),
      canParse: vi.fn().mockReturnValue(true),
      getSupportedExtensions: vi.fn().mockReturnValue(['.js', '.jsx', '.mjs', '.cjs']),
    };

    mockParserRegistry = {
      getParser: vi.fn().mockReturnValue(mockParser),
      registerParser: vi.fn(),
      getSupportedExtensions: vi.fn().mockReturnValue(['.js', '.jsx', '.mjs', '.cjs']),
    } as unknown as ParserRegistry;

    mockFileSystem = {
      readFile: vi.fn().mockResolvedValue('const x = 1;'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true),
      isFile: vi.fn().mockResolvedValue(true),
      isDirectory: vi.fn().mockResolvedValue(false),
    } as unknown as IFileSystem;

    analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);
  });

  describe('constructor', () => {
    it('應該建立新的 CallHierarchyAnalyzer 實例', () => {
      expect(analyzer).toBeDefined();
    });
  });

  describe('createCallHierarchyAnalyzer', () => {
    it('應該建立 CallHierarchyAnalyzer 實例', () => {
      const result = createCallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      expect(result).toBeInstanceOf(CallHierarchyAnalyzer);
    });
  });

  describe('analyze - JavaScript 檔案', () => {
    it('應該處理 JavaScript 檔案而不拋出錯誤', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      // analyze 方法會嘗試找函數定義，找不到時返回 null
      const result = await analyzer.analyze('myFunction', ['/test/file.js'], options);

      expect(result).toBeNull();
    });

    it('應該處理 JSX 檔案而不拋出錯誤', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyze('MyComponent', ['/test/component.jsx'], options);

      expect(result).toBeNull();
    });

    it('應該處理 CommonJS 檔案而不拋出錯誤', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyze('myModule', ['/test/module.cjs'], options);

      expect(result).toBeNull();
    });

    it('應該處理 ES Module 檔案而不拋出錯誤', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyze('myModule', ['/test/module.mjs'], options);

      expect(result).toBeNull();
    });
  });

  describe('analyzeWithDefinition - JavaScript 檔案', () => {
    it('應該分析 incoming 呼叫（JavaScript 檔案）', async () => {
      const options: CallHierarchyOptions = {
        direction: 'incoming',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.js',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.js'],
        options
      );

      expect(result).toBeDefined();
      expect(result.functionName).toBe('myFunction');
      expect(result.definitionFile).toBe('/test/file.js');
      expect(result.definitionLine).toBe(1);
      expect(result.incoming).toEqual([]);
      expect(result.outgoing).toEqual([]);
    });

    it('應該分析 outgoing 呼叫（JavaScript 檔案）', async () => {
      const options: CallHierarchyOptions = {
        direction: 'outgoing',
        depth: 1,
      };

      // JavaScript 檔案沒有 tsSourceFile，outgoing 分析會返回空陣列
      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.js',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.js'],
        options
      );

      expect(result).toBeDefined();
      expect(result.functionName).toBe('myFunction');
      // JavaScript 檔案沒有 tsSourceFile，所以 outgoing 為空
      expect(result.outgoing).toEqual([]);
    });

    it('應該分析 both 方向（JavaScript 檔案）', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.js',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.js'],
        options
      );

      expect(result).toBeDefined();
      expect(result.incoming).toBeDefined();
      expect(result.outgoing).toBeDefined();
    });
  });

  describe('findOutgoingCalls - JavaScript 檔案', () => {
    it('應該回傳空陣列（JavaScript 無 tsSourceFile）', async () => {
      const options: CallHierarchyOptions = {
        direction: 'outgoing',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.js',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.js'],
        options
      );

      // JavaScript parser 沒有 tsSourceFile，無法分析 outgoing calls
      expect(result.outgoing).toEqual([]);
    });

    it('應該處理無法讀取的 JavaScript 檔案', async () => {
      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const options: CallHierarchyOptions = {
        direction: 'outgoing',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.js',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.js'],
        options
      );

      expect(result.outgoing).toEqual([]);
    });

    it('應該處理無對應 parser 的檔案', async () => {
      (mockParserRegistry.getParser as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const options: CallHierarchyOptions = {
        direction: 'outgoing',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.unknown',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.unknown'],
        options
      );

      expect(result.outgoing).toEqual([]);
    });

    it('應該處理 parser 拋出錯誤', async () => {
      const mockParser = {
        parse: vi.fn().mockRejectedValue(new Error('Parse error')),
        canParse: vi.fn().mockReturnValue(true),
      };
      (mockParserRegistry.getParser as ReturnType<typeof vi.fn>).mockReturnValue(mockParser);

      const options: CallHierarchyOptions = {
        direction: 'outgoing',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.js',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.js'],
        options
      );

      expect(result.outgoing).toEqual([]);
    });
  });

  describe('findIncomingCalls - JavaScript 檔案', () => {
    it('應該處理深度限制', async () => {
      const options: CallHierarchyOptions = {
        direction: 'incoming',
        depth: 0, // 深度為 0，不應該找到任何呼叫
      };

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.js',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.js'],
        options
      );

      expect(result.incoming).toEqual([]);
    });

    it('應該處理 JavaScript 函數呼叫點', async () => {
      const jsCode = `
function callerFunc() {
  myFunction();
}
`;
      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(jsCode);

      const mockSymbolFinder = {
        findDefinition: vi.fn().mockResolvedValue(null),
        findCallSites: vi.fn().mockResolvedValue([{
          functionName: 'myFunction',
          location: {
            filePath: '/test/caller.js',
            range: {
              start: { line: 3, column: 3, offset: 0 },
              end: { line: 3, column: 15, offset: 12 },
            },
          },
        }]),
      };

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);
      Object.defineProperty(analyzer, 'symbolFinder', {
        value: mockSymbolFinder,
        writable: true,
      });

      const options: CallHierarchyOptions = {
        direction: 'incoming',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.js',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/caller.js', '/test/file.js'],
        options
      );

      // 由於 findEnclosingFunction 依賴 tsSourceFile，JavaScript 檔案會返回 null
      // 所以 caller 會是 '<anonymous>'
      expect(result.incoming.length).toBe(1);
      expect(result.incoming[0].caller).toBe('<anonymous>');
    });
  });
});

// ============================================================================
// 型別測試 - JavaScript 相關
// ============================================================================

describe('CallHierarchy Types - JavaScript', () => {
  describe('OutgoingCall', () => {
    it('應該有正確的結構', () => {
      const outgoingCall = {
        callee: 'targetFunction',
        location: createMockLocation('/test/file.js', 10),
        context: 'targetFunction(arg1, arg2)',
        isMethodCall: false,
        receiver: undefined,
      };

      expect(outgoingCall.callee).toBe('targetFunction');
      expect(outgoingCall.isMethodCall).toBe(false);
    });

    it('應該支援方法呼叫', () => {
      const methodCall = {
        callee: 'doSomething',
        location: createMockLocation('/test/file.js', 20),
        context: 'this.doSomething()',
        isMethodCall: true,
        receiver: 'this',
      };

      expect(methodCall.isMethodCall).toBe(true);
      expect(methodCall.receiver).toBe('this');
    });

    it('應該支援 JavaScript 鏈式呼叫', () => {
      const chainedCall = {
        callee: 'filter',
        location: createMockLocation('/test/file.js', 30),
        context: 'array.map(fn).filter(predicate)',
        isMethodCall: true,
        receiver: 'array.map(fn)',
      };

      expect(chainedCall.isMethodCall).toBe(true);
      expect(chainedCall.receiver).toBe('array.map(fn)');
    });
  });

  describe('IncomingCall', () => {
    it('應該有正確的結構', () => {
      const incomingCall = {
        caller: 'callerFunction',
        location: createMockLocation('/test/caller.js', 5),
        context: 'myFunction()',
        callerDefinitionFile: '/test/caller.js',
      };

      expect(incomingCall.caller).toBe('callerFunction');
      expect(incomingCall.callerDefinitionFile).toBe('/test/caller.js');
    });

    it('應該支援匿名呼叫者', () => {
      const anonymousCall = {
        caller: '<anonymous>',
        location: createMockLocation('/test/file.js', 15),
        context: '(() => myFunction())()',
        callerDefinitionFile: undefined,
      };

      expect(anonymousCall.caller).toBe('<anonymous>');
      expect(anonymousCall.callerDefinitionFile).toBeUndefined();
    });

    it('應該支援 IIFE 呼叫', () => {
      const iifeCall = {
        caller: '<anonymous>',
        location: createMockLocation('/test/file.js', 25),
        context: '(function() { myFunction(); })()',
        callerDefinitionFile: undefined,
      };

      expect(iifeCall.caller).toBe('<anonymous>');
    });
  });

  describe('CallHierarchyOptions', () => {
    it('應該支援所有方向選項', () => {
      const directions: Array<'incoming' | 'outgoing' | 'both'> = ['incoming', 'outgoing', 'both'];

      for (const direction of directions) {
        const options: CallHierarchyOptions = {
          direction,
          depth: 1,
        };
        expect(options.direction).toBe(direction);
      }
    });

    it('應該支援 maxResults 選項', () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 3,
        maxResults: 100,
      };

      expect(options.maxResults).toBe(100);
    });
  });

  describe('CallHierarchyData', () => {
    it('應該有正確的結構', () => {
      const data = {
        functionName: 'myFunction',
        definitionFile: '/test/file.js',
        definitionLine: 10,
        incoming: [],
        outgoing: [],
      };

      expect(data.functionName).toBe('myFunction');
      expect(data.definitionFile).toBe('/test/file.js');
      expect(data.definitionLine).toBe(10);
      expect(data.incoming).toEqual([]);
      expect(data.outgoing).toEqual([]);
    });
  });
});

// ============================================================================
// 邊界條件測試 - JavaScript
// ============================================================================

describe('邊界條件 - JavaScript', () => {
  let analyzer: CallHierarchyAnalyzer;
  let mockParserRegistry: ParserRegistry;
  let mockFileSystem: IFileSystem;

  beforeEach(() => {
    const mockParser = {
      parse: vi.fn().mockResolvedValue({
        babelAST: {},
        sourceCode: 'const x = 1;',
      }),
      canParse: vi.fn().mockReturnValue(true),
    };

    mockParserRegistry = {
      getParser: vi.fn().mockReturnValue(mockParser),
    } as unknown as ParserRegistry;

    mockFileSystem = {
      readFile: vi.fn().mockResolvedValue('const x = 1;'),
    } as unknown as IFileSystem;

    analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);
  });

  it('應該處理非常深的呼叫深度', async () => {
    const options: CallHierarchyOptions = {
      direction: 'both',
      depth: 100,
    };

    const result = await analyzer.analyzeWithDefinition(
      'deepFunction',
      '/test/file.js',
      { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
      ['/test/file.js'],
      options
    );

    expect(result).toBeDefined();
  });

  it('應該處理空的函數名稱', async () => {
    const options: CallHierarchyOptions = {
      direction: 'both',
      depth: 1,
    };

    const result = await analyzer.analyze('', ['/test/file.js'], options);

    expect(result).toBeNull();
  });

  it('應該處理特殊字元的函數名稱', async () => {
    const options: CallHierarchyOptions = {
      direction: 'both',
      depth: 1,
    };

    const result = await analyzer.analyze('$special_function', ['/test/file.js'], options);

    expect(result).toBeNull();
  });

  it('應該處理 JavaScript 常見的函數命名（底線前綴）', async () => {
    const options: CallHierarchyOptions = {
      direction: 'both',
      depth: 1,
    };

    const result = await analyzer.analyze('_privateFunction', ['/test/file.js'], options);

    expect(result).toBeNull();
  });

  it('應該處理大量專案檔案', async () => {
    const options: CallHierarchyOptions = {
      direction: 'both',
      depth: 1,
    };

    const manyFiles = Array.from({ length: 100 }, (_, i) => `/test/file${i}.js`);

    const result = await analyzer.analyze('myFunction', manyFiles, options);

    expect(result).toBeNull();
  });

  it('應該處理 readFile 拋出錯誤', async () => {
    (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Read error')
    );

    const options: CallHierarchyOptions = {
      direction: 'outgoing',
      depth: 1,
    };

    const result = await analyzer.analyzeWithDefinition(
      'myFunction',
      '/test/file.js',
      { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
      ['/test/file.js'],
      options
    );

    expect(result.outgoing).toEqual([]);
  });

  it('應該處理無副檔名的檔案', async () => {
    const options: CallHierarchyOptions = {
      direction: 'outgoing',
      depth: 1,
    };

    const result = await analyzer.analyzeWithDefinition(
      'myFunction',
      '/test/Makefile',
      { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
      ['/test/Makefile'],
      options
    );

    expect(result).toBeDefined();
  });
});

// ============================================================================
// JavaScript 特定場景測試
// ============================================================================

describe('JavaScript 特定場景', () => {
  let analyzer: CallHierarchyAnalyzer;
  let mockParserRegistry: ParserRegistry;
  let mockFileSystem: IFileSystem;

  beforeEach(() => {
    const mockParser = {
      parse: vi.fn().mockResolvedValue({
        babelAST: {},
        sourceCode: 'const x = 1;',
      }),
      canParse: vi.fn().mockReturnValue(true),
    };

    mockParserRegistry = {
      getParser: vi.fn().mockReturnValue(mockParser),
    } as unknown as ParserRegistry;

    mockFileSystem = {
      readFile: vi.fn().mockResolvedValue('const x = 1;'),
    } as unknown as IFileSystem;

    analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);
  });

  describe('ES6+ 語法', () => {
    it('應該處理箭頭函數名稱', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'myArrowFunc',
        '/test/file.js',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.js'],
        options
      );

      expect(result).toBeDefined();
      expect(result.functionName).toBe('myArrowFunc');
    });

    it('應該處理 async 函數名稱', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'fetchData',
        '/test/file.js',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.js'],
        options
      );

      expect(result).toBeDefined();
      expect(result.functionName).toBe('fetchData');
    });

    it('應該處理 generator 函數名稱', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'myGenerator',
        '/test/file.js',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.js'],
        options
      );

      expect(result).toBeDefined();
      expect(result.functionName).toBe('myGenerator');
    });
  });

  describe('CommonJS 模式', () => {
    it('應該處理 module.exports 函數', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'exportedFunction',
        '/test/module.cjs',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/module.cjs'],
        options
      );

      expect(result).toBeDefined();
    });

    it('應該處理 require 導入的函數', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'requiredModule',
        '/test/consumer.cjs',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/consumer.cjs'],
        options
      );

      expect(result).toBeDefined();
    });
  });

  describe('JSX 元件', () => {
    it('應該處理 React 元件名稱', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'MyComponent',
        '/test/component.jsx',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 10, column: 1, offset: 100 } },
        ['/test/component.jsx'],
        options
      );

      expect(result).toBeDefined();
      expect(result.functionName).toBe('MyComponent');
    });

    it('應該處理 React Hook 名稱', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'useCustomHook',
        '/test/hooks.jsx',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/hooks.jsx'],
        options
      );

      expect(result).toBeDefined();
      expect(result.functionName).toBe('useCustomHook');
    });
  });

  describe('類別方法', () => {
    it('應該處理類別方法名稱', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'classMethod',
        '/test/class.js',
        { start: { line: 5, column: 3, offset: 50 }, end: { line: 10, column: 3, offset: 100 } },
        ['/test/class.js'],
        options
      );

      expect(result).toBeDefined();
      expect(result.functionName).toBe('classMethod');
    });

    it('應該處理靜態方法名稱', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'staticMethod',
        '/test/class.js',
        { start: { line: 15, column: 3, offset: 150 }, end: { line: 20, column: 3, offset: 200 } },
        ['/test/class.js'],
        options
      );

      expect(result).toBeDefined();
      expect(result.functionName).toBe('staticMethod');
    });

    it('應該處理 getter/setter', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'value',
        '/test/class.js',
        { start: { line: 25, column: 3, offset: 250 }, end: { line: 27, column: 3, offset: 270 } },
        ['/test/class.js'],
        options
      );

      expect(result).toBeDefined();
    });
  });
});

// ============================================================================
// Mocked Incoming Calls 測試
// ============================================================================

describe('Mocked Incoming Calls - JavaScript', () => {
  let analyzer: CallHierarchyAnalyzer;
  let mockParserRegistry: ParserRegistry;
  let mockFileSystem: IFileSystem;

  beforeEach(() => {
    const mockParser = {
      parse: vi.fn().mockResolvedValue({
        babelAST: {},
        sourceCode: 'const x = 1;',
      }),
      canParse: vi.fn().mockReturnValue(true),
    };

    mockParserRegistry = {
      getParser: vi.fn().mockReturnValue(mockParser),
    } as unknown as ParserRegistry;

    mockFileSystem = {
      readFile: vi.fn().mockResolvedValue('const x = 1;'),
    } as unknown as IFileSystem;
  });

  it('應該正確追蹤呼叫鏈', async () => {
    const mockSymbolFinder = {
      findDefinition: vi.fn().mockResolvedValue(null),
      findCallSites: vi.fn().mockImplementation((name: string) => {
        if (name === 'targetFunc') {
          return Promise.resolve([{
            functionName: 'callerA',
            location: {
              filePath: '/test/caller.js',
              range: { start: { line: 10, column: 5, offset: 0 }, end: { line: 10, column: 20, offset: 15 } },
            },
          }]);
        }
        return Promise.resolve([]);
      }),
    };

    analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);
    Object.defineProperty(analyzer, 'symbolFinder', {
      value: mockSymbolFinder,
      writable: true,
    });

    const result = await analyzer.analyzeWithDefinition(
      'targetFunc',
      '/test/target.js',
      { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
      ['/test/caller.js', '/test/target.js'],
      { direction: 'incoming', depth: 2 }
    );

    expect(result.incoming.length).toBe(1);
    // JavaScript 沒有 tsSourceFile，所以 findEnclosingFunction 返回 null
    // caller 會是 '<anonymous>'
    expect(result.incoming[0].caller).toBe('<anonymous>');
  });

  it('應該處理多個呼叫點', async () => {
    const mockSymbolFinder = {
      findDefinition: vi.fn().mockResolvedValue(null),
      findCallSites: vi.fn().mockResolvedValue([
        {
          functionName: 'utilFunction',
          location: {
            filePath: '/test/a.js',
            range: { start: { line: 5, column: 3, offset: 0 }, end: { line: 5, column: 18, offset: 15 } },
          },
        },
        {
          functionName: 'utilFunction',
          location: {
            filePath: '/test/b.js',
            range: { start: { line: 10, column: 7, offset: 0 }, end: { line: 10, column: 22, offset: 15 } },
          },
        },
        {
          functionName: 'utilFunction',
          location: {
            filePath: '/test/c.js',
            range: { start: { line: 15, column: 1, offset: 0 }, end: { line: 15, column: 16, offset: 15 } },
          },
        },
      ]),
    };

    analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);
    Object.defineProperty(analyzer, 'symbolFinder', {
      value: mockSymbolFinder,
      writable: true,
    });

    const result = await analyzer.analyzeWithDefinition(
      'utilFunction',
      '/test/util.js',
      { start: { line: 1, column: 1, offset: 0 }, end: { line: 10, column: 1, offset: 100 } },
      ['/test/a.js', '/test/b.js', '/test/c.js', '/test/util.js'],
      { direction: 'incoming', depth: 1 }
    );

    expect(result.incoming.length).toBe(3);
  });

  it('應該排除定義檔案中的自身呼叫', async () => {
    const mockSymbolFinder = {
      findDefinition: vi.fn().mockResolvedValue(null),
      findCallSites: vi.fn().mockResolvedValue([
        {
          functionName: 'targetFunc',
          location: {
            filePath: '/test/target.js', // 同一檔案
            range: { start: { line: 10, column: 5, offset: 0 }, end: { line: 10, column: 20, offset: 15 } },
          },
        },
        {
          functionName: 'targetFunc',
          location: {
            filePath: '/test/caller.js', // 不同檔案
            range: { start: { line: 5, column: 3, offset: 0 }, end: { line: 5, column: 18, offset: 15 } },
          },
        },
      ]),
    };

    analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);
    Object.defineProperty(analyzer, 'symbolFinder', {
      value: mockSymbolFinder,
      writable: true,
    });

    const result = await analyzer.analyzeWithDefinition(
      'targetFunc',
      '/test/target.js',
      { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
      ['/test/target.js', '/test/caller.js'],
      { direction: 'incoming', depth: 1 }
    );

    // 應該只有一個 incoming call（排除同檔案的自身呼叫）
    expect(result.incoming.length).toBe(1);
    expect(result.incoming[0].location.filePath).toBe('/test/caller.js');
  });
});
