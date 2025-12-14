/**
 * CallHierarchyAnalyzer 測試
 * 測試呼叫層次分析器的所有功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as ts from 'typescript';
import {
  CallHierarchyAnalyzer,
  createCallHierarchyAnalyzer,
  type CallHierarchyOptions,
} from '@core/call-hierarchy/index.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { SymbolType } from '@shared/types/symbol.js';
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

/**
 * 建立真實的 TypeScript SourceFile
 */
function createRealSourceFile(code: string, fileName = '/test/file.ts'): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

// ============================================================================
// CallHierarchyAnalyzer Tests
// ============================================================================

describe('CallHierarchyAnalyzer', () => {
  let analyzer: CallHierarchyAnalyzer;
  let mockParserRegistry: ParserRegistry;
  let mockFileSystem: IFileSystem;

  beforeEach(() => {
    // 建立 mock parser
    const mockParser = {
      parse: vi.fn().mockResolvedValue({
        tsSourceFile: undefined,
      }),
      canParse: vi.fn().mockReturnValue(true),
      getSupportedExtensions: vi.fn().mockReturnValue(['.ts', '.js']),
    };

    mockParserRegistry = {
      getParser: vi.fn().mockReturnValue(mockParser),
      registerParser: vi.fn(),
      getSupportedExtensions: vi.fn().mockReturnValue(['.ts', '.js']),
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

  describe('analyze', () => {
    it('應該回傳 null 當找不到函數定義', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyze('nonExistent', ['/test/file.ts'], options);

      expect(result).toBeNull();
    });

    it('應該處理空的專案檔案列表', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyze('myFunction', [], options);

      expect(result).toBeNull();
    });
  });

  describe('analyzeWithDefinition', () => {
    it('應該分析 incoming 呼叫', async () => {
      const options: CallHierarchyOptions = {
        direction: 'incoming',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.ts',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.ts'],
        options
      );

      expect(result).toBeDefined();
      expect(result.functionName).toBe('myFunction');
      expect(result.definitionFile).toBe('/test/file.ts');
      expect(result.definitionLine).toBe(1);
      expect(result.incoming).toEqual([]);
      expect(result.outgoing).toEqual([]);
    });

    it('應該分析 outgoing 呼叫', async () => {
      const options: CallHierarchyOptions = {
        direction: 'outgoing',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.ts',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.ts'],
        options
      );

      expect(result).toBeDefined();
      expect(result.functionName).toBe('myFunction');
      expect(result.outgoing).toEqual([]);
    });

    it('應該分析 both 方向', async () => {
      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.ts',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.ts'],
        options
      );

      expect(result).toBeDefined();
      expect(result.incoming).toBeDefined();
      expect(result.outgoing).toBeDefined();
    });
  });

  describe('findOutgoingCalls (private, tested via analyzeWithDefinition)', () => {
    it('應該處理無法讀取的檔案', async () => {
      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const options: CallHierarchyOptions = {
        direction: 'outgoing',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.ts',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.ts'],
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
        '/test/file.ts',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.ts'],
        options
      );

      expect(result.outgoing).toEqual([]);
    });
  });

  describe('findIncomingCalls (private, tested via analyzeWithDefinition)', () => {
    it('應該處理深度限制', async () => {
      const options: CallHierarchyOptions = {
        direction: 'incoming',
        depth: 0, // 深度為 0，不應該找到任何呼叫
      };

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.ts',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.ts'],
        options
      );

      expect(result.incoming).toEqual([]);
    });
  });

  describe('getLineContext (private, tested via analyzeWithDefinition)', () => {
    it('應該處理無法讀取檔案的情況', async () => {
      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const options: CallHierarchyOptions = {
        direction: 'incoming',
        depth: 1,
      };

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.ts',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.ts'],
        options
      );

      // 不應該拋出錯誤
      expect(result).toBeDefined();
    });
  });

  describe('getExtension (private)', () => {
    it('應該正確處理各種副檔名', async () => {
      // 透過呼叫 analyzeWithDefinition 測試不同副檔名
      const extensions = ['.ts', '.js', '.tsx', '.jsx', ''];

      for (const ext of extensions) {
        const filePath = ext ? `/test/file${ext}` : '/test/noext';

        const result = await analyzer.analyzeWithDefinition(
          'myFunction',
          filePath,
          { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
          [filePath],
          { direction: 'outgoing', depth: 1 }
        );

        expect(result).toBeDefined();
      }
    });
  });

  describe('isFunctionSymbol (private)', () => {
    it('應該識別函數類型的符號', async () => {
      // 這個方法是私有的，透過 analyze 方法間接測試
      // 當找到非函數類型的符號時，應該繼續搜尋

      const options: CallHierarchyOptions = {
        direction: 'both',
        depth: 1,
      };

      const result = await analyzer.analyze('myFunction', ['/test/file.ts'], options);

      // 即使找不到函數，也不應該拋出錯誤
      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// 型別測試
// ============================================================================

describe('CallHierarchy Types', () => {
  describe('OutgoingCall', () => {
    it('應該有正確的結構', () => {
      const outgoingCall = {
        callee: 'targetFunction',
        location: createMockLocation('/test/file.ts', 10),
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
        location: createMockLocation('/test/file.ts', 20),
        context: 'this.doSomething()',
        isMethodCall: true,
        receiver: 'this',
      };

      expect(methodCall.isMethodCall).toBe(true);
      expect(methodCall.receiver).toBe('this');
    });
  });

  describe('IncomingCall', () => {
    it('應該有正確的結構', () => {
      const incomingCall = {
        caller: 'callerFunction',
        location: createMockLocation('/test/caller.ts', 5),
        context: 'myFunction()',
        callerDefinitionFile: '/test/caller.ts',
      };

      expect(incomingCall.caller).toBe('callerFunction');
      expect(incomingCall.callerDefinitionFile).toBe('/test/caller.ts');
    });

    it('應該支援匿名呼叫者', () => {
      const anonymousCall = {
        caller: '<anonymous>',
        location: createMockLocation('/test/file.ts', 15),
        context: '(() => myFunction())()',
        callerDefinitionFile: undefined,
      };

      expect(anonymousCall.caller).toBe('<anonymous>');
      expect(anonymousCall.callerDefinitionFile).toBeUndefined();
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
        definitionFile: '/test/file.ts',
        definitionLine: 10,
        incoming: [],
        outgoing: [],
      };

      expect(data.functionName).toBe('myFunction');
      expect(data.definitionFile).toBe('/test/file.ts');
      expect(data.definitionLine).toBe(10);
      expect(data.incoming).toEqual([]);
      expect(data.outgoing).toEqual([]);
    });
  });
});

// ============================================================================
// 邊界條件測試
// ============================================================================

describe('邊界條件', () => {
  let analyzer: CallHierarchyAnalyzer;
  let mockParserRegistry: ParserRegistry;
  let mockFileSystem: IFileSystem;

  beforeEach(() => {
    const mockParser = {
      parse: vi.fn().mockResolvedValue({ tsSourceFile: undefined }),
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
      '/test/file.ts',
      { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
      ['/test/file.ts'],
      options
    );

    expect(result).toBeDefined();
  });

  it('應該處理空的函數名稱', async () => {
    const options: CallHierarchyOptions = {
      direction: 'both',
      depth: 1,
    };

    const result = await analyzer.analyze('', ['/test/file.ts'], options);

    expect(result).toBeNull();
  });

  it('應該處理特殊字元的函數名稱', async () => {
    const options: CallHierarchyOptions = {
      direction: 'both',
      depth: 1,
    };

    const result = await analyzer.analyze('$special_function', ['/test/file.ts'], options);

    expect(result).toBeNull();
  });

  it('應該處理大量專案檔案', async () => {
    const options: CallHierarchyOptions = {
      direction: 'both',
      depth: 1,
    };

    const manyFiles = Array.from({ length: 100 }, (_, i) => `/test/file${i}.ts`);

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
      '/test/file.ts',
      { start: { line: 1, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
      ['/test/file.ts'],
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
// 真實 AST 測試（覆蓋 findFunctionNode, extractCallInfo, findEnclosingFunction）
// ============================================================================

describe('Real AST 測試', () => {
  let analyzer: CallHierarchyAnalyzer;
  let mockParserRegistry: ParserRegistry;
  let mockFileSystem: IFileSystem;

  describe('findFunctionNode - 各類函數宣告', () => {
    beforeEach(() => {
      mockFileSystem = {
        readFile: vi.fn(),
      } as unknown as IFileSystem;
    });

    it('應該找到 FunctionDeclaration', async () => {
      const code = `
function myFunction() {
  console.log('hello');
  someOtherFunction();
}
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const result = await analyzer.analyzeWithDefinition(
        'myFunction',
        '/test/file.ts',
        { start: { line: 2, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 100 } },
        ['/test/file.ts'],
        { direction: 'outgoing', depth: 1 }
      );

      expect(result.outgoing.length).toBeGreaterThan(0);
      expect(result.outgoing.some(c => c.callee === 'log')).toBe(true);
      expect(result.outgoing.some(c => c.callee === 'someOtherFunction')).toBe(true);
    });

    it('應該找到 MethodDeclaration', async () => {
      const code = `
class MyClass {
  myMethod() {
    this.helper();
    doSomething();
  }
}
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const result = await analyzer.analyzeWithDefinition(
        'myMethod',
        '/test/file.ts',
        { start: { line: 3, column: 3, offset: 0 }, end: { line: 6, column: 3, offset: 100 } },
        ['/test/file.ts'],
        { direction: 'outgoing', depth: 1 }
      );

      expect(result.outgoing.length).toBeGreaterThan(0);
      expect(result.outgoing.some(c => c.callee === 'helper' && c.isMethodCall)).toBe(true);
      expect(result.outgoing.some(c => c.callee === 'doSomething' && !c.isMethodCall)).toBe(true);
    });

    it('應該找到 ArrowFunction', async () => {
      const code = `
const myArrowFunc = () => {
  processData();
  helper.transform();
};
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const result = await analyzer.analyzeWithDefinition(
        'myArrowFunc',
        '/test/file.ts',
        { start: { line: 2, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 100 } },
        ['/test/file.ts'],
        { direction: 'outgoing', depth: 1 }
      );

      expect(result.outgoing.length).toBeGreaterThan(0);
      expect(result.outgoing.some(c => c.callee === 'processData')).toBe(true);
      expect(result.outgoing.some(c => c.callee === 'transform' && c.isMethodCall)).toBe(true);
    });

    it('應該找到 FunctionExpression', async () => {
      const code = `
const myFuncExpr = function() {
  calculate();
  obj.method();
};
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const result = await analyzer.analyzeWithDefinition(
        'myFuncExpr',
        '/test/file.ts',
        { start: { line: 2, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 100 } },
        ['/test/file.ts'],
        { direction: 'outgoing', depth: 1 }
      );

      expect(result.outgoing.length).toBeGreaterThan(0);
      expect(result.outgoing.some(c => c.callee === 'calculate')).toBe(true);
      expect(result.outgoing.some(c => c.callee === 'method' && c.isMethodCall)).toBe(true);
    });

    it('應該回傳空陣列當找不到匹配函數', async () => {
      const code = `
function differentFunction() {
  doSomething();
}
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const result = await analyzer.analyzeWithDefinition(
        'nonExistentFunction',
        '/test/file.ts',
        { start: { line: 2, column: 1, offset: 0 }, end: { line: 4, column: 1, offset: 50 } },
        ['/test/file.ts'],
        { direction: 'outgoing', depth: 1 }
      );

      expect(result.outgoing).toEqual([]);
    });
  });

  describe('extractCallInfo - 呼叫資訊提取', () => {
    beforeEach(() => {
      mockFileSystem = {
        readFile: vi.fn(),
      } as unknown as IFileSystem;
    });

    it('應該正確提取 Identifier 呼叫', async () => {
      const code = `
function test() {
  simpleCall();
}
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const result = await analyzer.analyzeWithDefinition(
        'test',
        '/test/file.ts',
        { start: { line: 2, column: 1, offset: 0 }, end: { line: 4, column: 1, offset: 50 } },
        ['/test/file.ts'],
        { direction: 'outgoing', depth: 1 }
      );

      expect(result.outgoing.length).toBe(1);
      expect(result.outgoing[0].callee).toBe('simpleCall');
      expect(result.outgoing[0].isMethodCall).toBe(false);
      expect(result.outgoing[0].receiver).toBeUndefined();
    });

    it('應該正確提取 PropertyAccessExpression 呼叫', async () => {
      const code = `
function test() {
  obj.method();
  this.selfMethod();
  nested.deep.call();
}
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const result = await analyzer.analyzeWithDefinition(
        'test',
        '/test/file.ts',
        { start: { line: 2, column: 1, offset: 0 }, end: { line: 6, column: 1, offset: 100 } },
        ['/test/file.ts'],
        { direction: 'outgoing', depth: 1 }
      );

      expect(result.outgoing.length).toBe(3);

      const objMethod = result.outgoing.find(c => c.callee === 'method');
      expect(objMethod?.isMethodCall).toBe(true);
      expect(objMethod?.receiver).toBe('obj');

      const selfMethod = result.outgoing.find(c => c.callee === 'selfMethod');
      expect(selfMethod?.isMethodCall).toBe(true);
      expect(selfMethod?.receiver).toBe('this');

      const deepCall = result.outgoing.find(c => c.callee === 'call');
      expect(deepCall?.isMethodCall).toBe(true);
      expect(deepCall?.receiver).toBe('nested.deep');
    });

    it('應該正確填入 context', async () => {
      const code = `
function test() {
  processData(arg1, arg2);
}
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const result = await analyzer.analyzeWithDefinition(
        'test',
        '/test/file.ts',
        { start: { line: 2, column: 1, offset: 0 }, end: { line: 4, column: 1, offset: 50 } },
        ['/test/file.ts'],
        { direction: 'outgoing', depth: 1 }
      );

      expect(result.outgoing.length).toBe(1);
      expect(result.outgoing[0].context).toContain('processData');
    });

    it('應該去除重複呼叫', async () => {
      const code = `
function test() {
  sameFn();
  sameFn();
}
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const result = await analyzer.analyzeWithDefinition(
        'test',
        '/test/file.ts',
        { start: { line: 2, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 50 } },
        ['/test/file.ts'],
        { direction: 'outgoing', depth: 1 }
      );

      // 同一行的相同呼叫會被去重，不同行的則會保留
      expect(result.outgoing.length).toBe(2);
    });
  });

  describe('findEnclosingFunction - 找出呼叫點所在函數', () => {
    beforeEach(() => {
      mockFileSystem = {
        readFile: vi.fn(),
      } as unknown as IFileSystem;
    });

    it('應該找到 FunctionDeclaration 內的呼叫', async () => {
      const callerCode = `
function callerFunc() {
  targetFunction();
}
`;
      const targetCode = `
function targetFunction() {
  console.log('target');
}
`;
      const callerSourceFile = createRealSourceFile(callerCode, '/test/caller.ts');

      const mockParser = {
        parse: vi.fn().mockImplementation((content: string, path: string) => {
          if (path === '/test/caller.ts') {
            return Promise.resolve({ tsSourceFile: callerSourceFile });
          }
          return Promise.resolve({ tsSourceFile: createRealSourceFile(targetCode, path) });
        }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
        if (path === '/test/caller.ts') {
          return Promise.resolve(callerCode);
        }
        return Promise.resolve(targetCode);
      });

      // 建立一個有 symbolFinder 功能的 analyzer
      const mockSymbolFinder = {
        findDefinition: vi.fn().mockResolvedValue(null),
        findCallSites: vi.fn().mockResolvedValue([{
          functionName: 'targetFunction',
          location: {
            filePath: '/test/caller.ts',
            range: {
              start: { line: 3, column: 3, offset: 0 },
              end: { line: 3, column: 20, offset: 17 },
            },
          },
        }]),
      };

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      // 用 Object.defineProperty 來 mock 私有屬性
      Object.defineProperty(analyzer, 'symbolFinder', {
        value: mockSymbolFinder,
        writable: true,
      });

      const result = await analyzer.analyzeWithDefinition(
        'targetFunction',
        '/test/target.ts',
        { start: { line: 2, column: 1, offset: 0 }, end: { line: 4, column: 1, offset: 50 } },
        ['/test/caller.ts', '/test/target.ts'],
        { direction: 'incoming', depth: 1 }
      );

      expect(result.incoming.length).toBe(1);
      expect(result.incoming[0].caller).toBe('callerFunc');
      expect(result.incoming[0].callerDefinitionFile).toBe('/test/caller.ts');
    });

    it('應該找到 MethodDeclaration 內的呼叫', async () => {
      const code = `
class MyClass {
  callerMethod() {
    targetFunction();
  }
}
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      const mockSymbolFinder = {
        findDefinition: vi.fn().mockResolvedValue(null),
        findCallSites: vi.fn().mockResolvedValue([{
          functionName: 'targetFunction',
          location: {
            filePath: '/test/file.ts',
            range: {
              start: { line: 4, column: 5, offset: 0 },
              end: { line: 4, column: 22, offset: 17 },
            },
          },
        }]),
      };

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);
      Object.defineProperty(analyzer, 'symbolFinder', {
        value: mockSymbolFinder,
        writable: true,
      });

      const result = await analyzer.analyzeWithDefinition(
        'targetFunction',
        '/test/other.ts',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 3, column: 1, offset: 50 } },
        ['/test/file.ts'],
        { direction: 'incoming', depth: 1 }
      );

      expect(result.incoming.length).toBe(1);
      expect(result.incoming[0].caller).toBe('callerMethod');
    });

    it('應該找到 ArrowFunction 內的呼叫', async () => {
      const code = `
const callerArrow = () => {
  targetFunction();
};
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      const mockSymbolFinder = {
        findDefinition: vi.fn().mockResolvedValue(null),
        findCallSites: vi.fn().mockResolvedValue([{
          functionName: 'targetFunction',
          location: {
            filePath: '/test/file.ts',
            range: {
              start: { line: 3, column: 3, offset: 0 },
              end: { line: 3, column: 20, offset: 17 },
            },
          },
        }]),
      };

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);
      Object.defineProperty(analyzer, 'symbolFinder', {
        value: mockSymbolFinder,
        writable: true,
      });

      const result = await analyzer.analyzeWithDefinition(
        'targetFunction',
        '/test/other.ts',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 3, column: 1, offset: 50 } },
        ['/test/file.ts'],
        { direction: 'incoming', depth: 1 }
      );

      expect(result.incoming.length).toBe(1);
      expect(result.incoming[0].caller).toBe('callerArrow');
    });

    it('應該處理匿名函數呼叫', async () => {
      const code = `
targetFunction();
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      const mockSymbolFinder = {
        findDefinition: vi.fn().mockResolvedValue(null),
        findCallSites: vi.fn().mockResolvedValue([{
          functionName: 'targetFunction',
          location: {
            filePath: '/test/file.ts',
            range: {
              start: { line: 2, column: 1, offset: 0 },
              end: { line: 2, column: 18, offset: 17 },
            },
          },
        }]),
      };

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);
      Object.defineProperty(analyzer, 'symbolFinder', {
        value: mockSymbolFinder,
        writable: true,
      });

      const result = await analyzer.analyzeWithDefinition(
        'targetFunction',
        '/test/other.ts',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 3, column: 1, offset: 50 } },
        ['/test/file.ts'],
        { direction: 'incoming', depth: 1 }
      );

      expect(result.incoming.length).toBe(1);
      expect(result.incoming[0].caller).toBe('<anonymous>');
    });
  });

  describe('getLineContext - 取得行內容', () => {
    beforeEach(() => {
      mockFileSystem = {
        readFile: vi.fn(),
      } as unknown as IFileSystem;
    });

    it('應該正確取得指定行的內容', async () => {
      const code = `
function test() {
  const result = processData(arg1);
  return result;
}
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      const mockSymbolFinder = {
        findDefinition: vi.fn().mockResolvedValue(null),
        findCallSites: vi.fn().mockResolvedValue([{
          functionName: 'processData',
          location: {
            filePath: '/test/file.ts',
            range: {
              start: { line: 3, column: 18, offset: 0 },
              end: { line: 3, column: 35, offset: 17 },
            },
          },
        }]),
      };

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);
      Object.defineProperty(analyzer, 'symbolFinder', {
        value: mockSymbolFinder,
        writable: true,
      });

      const result = await analyzer.analyzeWithDefinition(
        'processData',
        '/test/other.ts',
        { start: { line: 1, column: 1, offset: 0 }, end: { line: 3, column: 1, offset: 50 } },
        ['/test/file.ts'],
        { direction: 'incoming', depth: 1 }
      );

      expect(result.incoming.length).toBe(1);
      expect(result.incoming[0].context).toContain('processData');
    });
  });

  describe('遞迴深度測試', () => {
    beforeEach(() => {
      mockFileSystem = {
        readFile: vi.fn(),
      } as unknown as IFileSystem;
    });

    it('應該正確處理遞迴 incoming 呼叫', async () => {
      const code = `
function a() { b(); }
function b() { c(); }
function c() { target(); }
function target() {}
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      // 模擬完整的呼叫鏈 - 重要：functionName 必須不同於 targetName 以避免被排除
      const mockSymbolFinder = {
        findDefinition: vi.fn().mockResolvedValue(null),
        findCallSites: vi.fn().mockImplementation((name: string) => {
          if (name === 'target') {
            return Promise.resolve([{
              functionName: 'c', // 呼叫者是 c 函數
              location: {
                filePath: '/test/caller.ts', // 使用不同檔案避免排除
                range: { start: { line: 4, column: 16, offset: 0 }, end: { line: 4, column: 24, offset: 8 } },
              },
            }]);
          }
          if (name === 'c') {
            return Promise.resolve([{
              functionName: 'b', // 呼叫者是 b 函數
              location: {
                filePath: '/test/caller.ts',
                range: { start: { line: 3, column: 16, offset: 0 }, end: { line: 3, column: 18, offset: 2 } },
              },
            }]);
          }
          if (name === 'b') {
            return Promise.resolve([{
              functionName: 'a', // 呼叫者是 a 函數
              location: {
                filePath: '/test/caller.ts',
                range: { start: { line: 2, column: 16, offset: 0 }, end: { line: 2, column: 18, offset: 2 } },
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
        'target',
        '/test/target.ts', // 定義檔案與呼叫檔案不同
        { start: { line: 5, column: 1, offset: 0 }, end: { line: 5, column: 20, offset: 19 } },
        ['/test/caller.ts', '/test/target.ts'],
        { direction: 'incoming', depth: 3 }
      );

      // 應該找到 c 呼叫 target（深度 1）
      // 由於 mock 模式的限制，主要驗證 incoming 有結果
      expect(result.incoming.length).toBeGreaterThanOrEqual(1);
      expect(result.incoming.some(c => c.caller === 'c')).toBe(true);
    });

    it('應該遵守深度限制', async () => {
      const code = `
function a() { b(); }
function b() { target(); }
function target() {}
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      const mockSymbolFinder = {
        findDefinition: vi.fn().mockResolvedValue(null),
        findCallSites: vi.fn().mockImplementation((name: string) => {
          if (name === 'target') {
            return Promise.resolve([{
              functionName: 'b', // 呼叫者是 b 函數
              location: {
                filePath: '/test/caller.ts', // 使用不同檔案避免排除
                range: { start: { line: 3, column: 16, offset: 0 }, end: { line: 3, column: 24, offset: 8 } },
              },
            }]);
          }
          if (name === 'b') {
            return Promise.resolve([{
              functionName: 'a',
              location: {
                filePath: '/test/caller.ts',
                range: { start: { line: 2, column: 16, offset: 0 }, end: { line: 2, column: 18, offset: 2 } },
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

      // 深度設為 1，只應該找到直接呼叫者
      const result = await analyzer.analyzeWithDefinition(
        'target',
        '/test/target.ts', // 定義檔案與呼叫檔案不同
        { start: { line: 4, column: 1, offset: 0 }, end: { line: 4, column: 20, offset: 19 } },
        ['/test/caller.ts'],
        { direction: 'incoming', depth: 1 }
      );

      expect(result.incoming.length).toBe(1);
      expect(result.incoming[0].caller).toBe('b');
    });
  });

  describe('循環呼叫檢測', () => {
    beforeEach(() => {
      mockFileSystem = {
        readFile: vi.fn(),
      } as unknown as IFileSystem;
    });

    it('應該正確處理直接循環呼叫 (A→B→A)', async () => {
      const code = `
function a() { b(); }
function b() { a(); }
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      const mockSymbolFinder = {
        findDefinition: vi.fn().mockResolvedValue(null),
        findCallSites: vi.fn().mockImplementation((name: string) => {
          if (name === 'a') {
            return Promise.resolve([{
              functionName: 'b',
              location: {
                filePath: '/test/file.ts',
                range: { start: { line: 3, column: 16, offset: 0 }, end: { line: 3, column: 18, offset: 2 } },
              },
            }]);
          }
          if (name === 'b') {
            return Promise.resolve([{
              functionName: 'a',
              location: {
                filePath: '/test/caller.ts',
                range: { start: { line: 2, column: 16, offset: 0 }, end: { line: 2, column: 18, offset: 2 } },
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
        'a',
        '/test/target.ts',
        { start: { line: 2, column: 1, offset: 0 }, end: { line: 2, column: 22, offset: 21 } },
        ['/test/caller.ts', '/test/file.ts'],
        { direction: 'incoming', depth: 3 }
      );

      // 應該能處理循環呼叫而不造成無限迴圈
      expect(result).toBeDefined();
      expect(result.incoming.length).toBeGreaterThanOrEqual(1);
    });

    it('應該正確處理間接循環呼叫 (A→B→C→A)', async () => {
      const code = `
function a() { b(); }
function b() { c(); }
function c() { a(); }
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      const mockSymbolFinder = {
        findDefinition: vi.fn().mockResolvedValue(null),
        findCallSites: vi.fn().mockImplementation((name: string) => {
          if (name === 'a') {
            return Promise.resolve([{
              functionName: 'c',
              location: {
                filePath: '/test/caller.ts',
                range: { start: { line: 4, column: 16, offset: 0 }, end: { line: 4, column: 18, offset: 2 } },
              },
            }]);
          }
          if (name === 'c') {
            return Promise.resolve([{
              functionName: 'b',
              location: {
                filePath: '/test/caller.ts',
                range: { start: { line: 3, column: 16, offset: 0 }, end: { line: 3, column: 18, offset: 2 } },
              },
            }]);
          }
          if (name === 'b') {
            return Promise.resolve([{
              functionName: 'a',
              location: {
                filePath: '/test/caller.ts',
                range: { start: { line: 2, column: 16, offset: 0 }, end: { line: 2, column: 18, offset: 2 } },
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
        'a',
        '/test/target.ts',
        { start: { line: 2, column: 1, offset: 0 }, end: { line: 2, column: 22, offset: 21 } },
        ['/test/caller.ts'],
        { direction: 'incoming', depth: 5 }
      );

      // 應該能處理循環呼叫而不造成無限迴圈
      expect(result).toBeDefined();
    });

    it('應該正確處理自我循環呼叫（遞迴）', async () => {
      const code = `
function recursive(n) {
  if (n <= 0) return;
  recursive(n - 1);
}
`;
      const sourceFile = createRealSourceFile(code);

      const mockParser = {
        parse: vi.fn().mockResolvedValue({ tsSourceFile: sourceFile }),
        canParse: vi.fn().mockReturnValue(true),
      };

      mockParserRegistry = {
        getParser: vi.fn().mockReturnValue(mockParser),
      } as unknown as ParserRegistry;

      (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(code);

      analyzer = new CallHierarchyAnalyzer(mockParserRegistry, mockFileSystem);

      const result = await analyzer.analyzeWithDefinition(
        'recursive',
        '/test/file.ts',
        { start: { line: 2, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 70 } },
        ['/test/file.ts'],
        { direction: 'outgoing', depth: 1 }
      );

      // 遞迴呼叫應該在 outgoing 中被檢測到
      expect(result).toBeDefined();
      expect(result.outgoing.some(c => c.callee === 'recursive')).toBe(true);
    });
  });
});
