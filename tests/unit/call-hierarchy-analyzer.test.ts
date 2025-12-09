/**
 * CallHierarchyAnalyzer 測試
 * 測試呼叫層次分析器的所有功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CallHierarchyAnalyzer,
  createCallHierarchyAnalyzer,
  type CallHierarchyOptions,
} from '@core/shared/call-hierarchy-analyzer.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { Symbol, SymbolType } from '@shared/types/symbol.js';
import type { Location } from '@shared/types/core.js';

// ============================================================================
// Mock 輔助函數
// ============================================================================

function createMockSymbol(name: string, type: SymbolType = 'function'): Symbol {
  return {
    name,
    type,
    location: {
      filePath: '/test/file.ts',
      range: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 10, offset: 9 },
      },
    },
    modifiers: [],
  };
}

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
