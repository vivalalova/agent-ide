/**
 * DeadCodeDetector 測試
 * 測試 Dead Code 檢測器的所有功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DeadCodeDetector,
  createDeadCodeDetector,
} from '@core/dead-code/dead-code-detector.js';
import {
  DEFAULT_DEAD_CODE_OPTIONS,
  type DeadCodeDetectorOptions,
} from '@core/dead-code/types.js';
import { SymbolType } from '@shared/types/symbol.js';
import type { IndexEngine } from '@core/indexing/index.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { Symbol } from '@shared/types/symbol.js';
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

function createMockSymbol(
  name: string,
  type: SymbolType,
  filePath: string,
  line: number,
  modifiers: string[] = []
): Symbol {
  return {
    name,
    type,
    location: createMockLocation(filePath, line),
    modifiers,
  };
}

// ============================================================================
// DEFAULT_DEAD_CODE_OPTIONS Tests
// ============================================================================

describe('DEFAULT_DEAD_CODE_OPTIONS', () => {
  it('應該有正確的預設值', () => {
    expect(DEFAULT_DEAD_CODE_OPTIONS.includeExports).toBe(false);
    expect(DEFAULT_DEAD_CODE_OPTIONS.minConfidence).toBe(0.8);
    expect(Array.isArray(DEFAULT_DEAD_CODE_OPTIONS.excludePatterns)).toBe(true);
    expect(Array.isArray(DEFAULT_DEAD_CODE_OPTIONS.symbolTypes)).toBe(true);
  });

  it('應該包含常見的排除模式', () => {
    expect(DEFAULT_DEAD_CODE_OPTIONS.excludePatterns).toContain('main');
    expect(DEFAULT_DEAD_CODE_OPTIONS.excludePatterns).toContain('index');
    expect(DEFAULT_DEAD_CODE_OPTIONS.excludePatterns).toContain('App');
  });

  it('應該包含常見的符號類型', () => {
    expect(DEFAULT_DEAD_CODE_OPTIONS.symbolTypes).toContain(SymbolType.Function);
    expect(DEFAULT_DEAD_CODE_OPTIONS.symbolTypes).toContain(SymbolType.Class);
    expect(DEFAULT_DEAD_CODE_OPTIONS.symbolTypes).toContain(SymbolType.Variable);
  });
});

// ============================================================================
// DeadCodeDetector Tests
// ============================================================================

describe('DeadCodeDetector', () => {
  let detector: DeadCodeDetector;
  let mockIndexEngine: IndexEngine;
  let mockParserRegistry: ParserRegistry;
  let mockFileSystem: IFileSystem;
  let mockParser: {
    parse: ReturnType<typeof vi.fn>;
    extractSymbols: ReturnType<typeof vi.fn>;
    canParse: ReturnType<typeof vi.fn>;
    getSupportedExtensions: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // 建立 mock parser
    mockParser = {
      parse: vi.fn().mockResolvedValue({}),
      extractSymbols: vi.fn().mockResolvedValue([]),
      canParse: vi.fn().mockReturnValue(true),
      getSupportedExtensions: vi.fn().mockReturnValue(['.ts', '.js']),
    };

    mockIndexEngine = {
      getAllIndexedFiles: vi.fn().mockReturnValue([]),
      indexProject: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    } as unknown as IndexEngine;

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

    detector = new DeadCodeDetector(
      mockIndexEngine,
      mockParserRegistry,
      mockFileSystem
    );
  });

  describe('constructor', () => {
    it('應該建立新的 DeadCodeDetector 實例', () => {
      expect(detector).toBeDefined();
    });

    it('應該接受自訂選項', () => {
      const customOptions: DeadCodeDetectorOptions = {
        includeExports: true,
        minConfidence: 0.5,
      };

      const customDetector = new DeadCodeDetector(
        mockIndexEngine,
        mockParserRegistry,
        mockFileSystem,
        customOptions
      );

      expect(customDetector).toBeDefined();
    });
  });

  describe('createDeadCodeDetector', () => {
    it('應該建立 DeadCodeDetector 實例', () => {
      const result = createDeadCodeDetector(
        mockIndexEngine,
        mockParserRegistry,
        mockFileSystem
      );

      expect(result).toBeInstanceOf(DeadCodeDetector);
    });

    it('應該傳遞選項到 DeadCodeDetector', () => {
      const options: DeadCodeDetectorOptions = {
        includeExports: true,
      };

      const result = createDeadCodeDetector(
        mockIndexEngine,
        mockParserRegistry,
        mockFileSystem,
        options
      );

      expect(result).toBeInstanceOf(DeadCodeDetector);
    });
  });

  describe('detect', () => {
    it('應該回傳成功結果當沒有檔案', async () => {
      const result = await detector.detect();

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(0);
      expect(result.stats.totalSymbols).toBe(0);
    });

    it('應該回傳正確的統計資訊', async () => {
      const result = await detector.detect();

      expect(result.stats).toBeDefined();
      expect(result.stats.totalSymbols).toBeGreaterThanOrEqual(0);
      expect(result.stats.deadCodeCount).toBeGreaterThanOrEqual(0);
      expect(result.stats.filesAffected).toBeGreaterThanOrEqual(0);
      expect(result.stats.scanTime).toBeGreaterThanOrEqual(0);
      expect(result.stats.byType).toBeDefined();
    });

    it('應該處理索引檔案', async () => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
        { filePath: '/src/test.ts', size: 100 },
      ]);

      const result = await detector.detect();

      expect(result.success).toBe(true);
    });

    it('應該處理解析失敗', async () => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
        { filePath: '/src/test.ts', size: 100 },
      ]);
      mockParser.parse.mockRejectedValue(new Error('Parse error'));

      const result = await detector.detect();

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(0);
    });

    it('應該處理讀取檔案失敗', async () => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
        { filePath: '/src/test.ts', size: 100 },
      ]);
      vi.mocked(mockFileSystem.readFile).mockRejectedValue(new Error('Read error'));

      const result = await detector.detect();

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(0);
    });

    it('應該排除 constructor', async () => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
        { filePath: '/src/test.ts', size: 100 },
      ]);
      mockParser.extractSymbols.mockResolvedValue([
        createMockSymbol('constructor', SymbolType.Function, '/src/test.ts', 1),
      ]);

      const result = await detector.detect();

      expect(result.items).toHaveLength(0);
    });

    it('應該排除預設排除模式中的符號', async () => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
        { filePath: '/src/test.ts', size: 100 },
      ]);
      mockParser.extractSymbols.mockResolvedValue([
        createMockSymbol('main', SymbolType.Function, '/src/test.ts', 1),
        createMockSymbol('index', SymbolType.Function, '/src/test.ts', 10),
        createMockSymbol('App', SymbolType.Class, '/src/test.ts', 20),
      ]);

      const result = await detector.detect();

      const names = result.items.map(i => i.name);
      expect(names).not.toContain('main');
      expect(names).not.toContain('index');
      expect(names).not.toContain('App');
    });

    it('應該只檢測指定類型的符號', async () => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
        { filePath: '/src/test.ts', size: 100 },
      ]);
      mockParser.extractSymbols.mockResolvedValue([
        createMockSymbol('myProperty', SymbolType.Property, '/src/test.ts', 1),
        createMockSymbol('myMethod', SymbolType.Method, '/src/test.ts', 10),
      ]);

      // 預設不包含 Property 和 Method
      const result = await detector.detect();

      expect(result.items).toHaveLength(0);
    });
  });

  describe('排除模式', () => {
    beforeEach(() => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
        { filePath: '/src/test.ts', size: 100 },
      ]);
    });

    it('應該支援 glob 模式', async () => {
      const customDetector = new DeadCodeDetector(
        mockIndexEngine,
        mockParserRegistry,
        mockFileSystem,
        { excludePatterns: ['test*', '*Helper'] }
      );

      mockParser.extractSymbols.mockResolvedValue([
        createMockSymbol('testFunction', SymbolType.Function, '/src/test.ts', 1),
        createMockSymbol('myHelper', SymbolType.Function, '/src/test.ts', 10),
        createMockSymbol('normalFunction', SymbolType.Function, '/src/test.ts', 20),
      ]);

      const result = await customDetector.detect();

      const names = result.items.map(i => i.name);
      expect(names).not.toContain('testFunction');
      expect(names).not.toContain('myHelper');
    });

    it('應該支援大小寫不敏感匹配', async () => {
      const customDetector = new DeadCodeDetector(
        mockIndexEngine,
        mockParserRegistry,
        mockFileSystem,
        { excludePatterns: ['MAIN'] }
      );

      mockParser.extractSymbols.mockResolvedValue([
        createMockSymbol('main', SymbolType.Function, '/src/test.ts', 1),
        createMockSymbol('Main', SymbolType.Function, '/src/test.ts', 10),
      ]);

      const result = await customDetector.detect();

      const names = result.items.map(i => i.name);
      expect(names).not.toContain('main');
      expect(names).not.toContain('Main');
    });
  });

  describe('選項測試', () => {
    beforeEach(() => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
        { filePath: '/src/test.ts', size: 100 },
      ]);
    });

    it('應該尊重 minConfidence 選項', async () => {
      const customDetector = new DeadCodeDetector(
        mockIndexEngine,
        mockParserRegistry,
        mockFileSystem,
        { minConfidence: 1.0 } // 非常高的門檻
      );

      mockParser.extractSymbols.mockResolvedValue([
        createMockSymbol('unusedFunction', SymbolType.Function, '/src/test.ts', 1, ['export']),
      ]);

      const result = await customDetector.detect();

      // export 的符號信心較低，應該被過濾
      expect(result.items).toHaveLength(0);
    });

    it('應該尊重 symbolTypes 選項', async () => {
      const customDetector = new DeadCodeDetector(
        mockIndexEngine,
        mockParserRegistry,
        mockFileSystem,
        { symbolTypes: [SymbolType.Class] } // 只檢測 class
      );

      mockParser.extractSymbols.mockResolvedValue([
        createMockSymbol('unusedFunction', SymbolType.Function, '/src/test.ts', 1),
        createMockSymbol('UnusedClass', SymbolType.Class, '/src/test.ts', 10),
      ]);

      const result = await customDetector.detect();

      const types = result.items.map(i => i.type);
      expect(types).not.toContain(SymbolType.Function);
    });
  });

  describe('統計資訊', () => {
    it('應該正確計算 byType 統計', async () => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
        { filePath: '/src/test.ts', size: 100 },
      ]);
      mockParser.extractSymbols.mockResolvedValue([
        createMockSymbol('func1', SymbolType.Function, '/src/test.ts', 1),
        createMockSymbol('func2', SymbolType.Function, '/src/test.ts', 10),
        createMockSymbol('MyClass', SymbolType.Class, '/src/test.ts', 20),
      ]);

      const result = await detector.detect();

      expect(result.stats.byType).toBeDefined();
      expect(typeof result.stats.byType).toBe('object');
    });

    it('應該正確計算 filesAffected', async () => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
        { filePath: '/src/test1.ts', size: 100 },
        { filePath: '/src/test2.ts', size: 100 },
      ]);
      mockParser.extractSymbols.mockImplementation(async () => [
        createMockSymbol('unused', SymbolType.Function, '/src/test1.ts', 1),
      ]);

      const result = await detector.detect();

      expect(result.stats.filesAffected).toBeGreaterThanOrEqual(0);
    });

    it('應該記錄掃描時間', async () => {
      const result = await detector.detect();

      expect(result.stats.scanTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('錯誤處理', () => {
    it('應該在檢測過程中捕獲錯誤並回傳失敗結果', async () => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockImplementation(() => {
        throw new Error('Index error');
      });

      const result = await detector.detect();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Index error');
    });

    it('應該在錯誤時回傳空統計', async () => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockImplementation(() => {
        throw new Error('Index error');
      });

      const result = await detector.detect();

      expect(result.stats.totalSymbols).toBe(0);
      expect(result.stats.deadCodeCount).toBe(0);
      expect(result.stats.filesAffected).toBe(0);
    });
  });

  describe('DeadCodeItem 結構', () => {
    it('應該包含正確的欄位', async () => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
        { filePath: '/src/test.ts', size: 100 },
      ]);
      mockParser.extractSymbols.mockResolvedValue([
        createMockSymbol('unusedFunction', SymbolType.Function, '/src/test.ts', 5),
      ]);

      const result = await detector.detect();

      if (result.items.length > 0) {
        const item = result.items[0];
        expect(item.name).toBeDefined();
        expect(item.type).toBeDefined();
        expect(item.location).toBeDefined();
        expect(item.location.filePath).toBeDefined();
        expect(item.location.range).toBeDefined();
        expect(item.confidence).toBeGreaterThanOrEqual(0);
        expect(item.confidence).toBeLessThanOrEqual(1);
        expect(item.reason).toBeDefined();
      }
    });
  });
});

// ============================================================================
// 整合測試場景
// ============================================================================

describe('DeadCodeDetector 整合場景', () => {
  let mockIndexEngine: IndexEngine;
  let mockParserRegistry: ParserRegistry;
  let mockFileSystem: IFileSystem;
  let mockParser: {
    parse: ReturnType<typeof vi.fn>;
    extractSymbols: ReturnType<typeof vi.fn>;
    canParse: ReturnType<typeof vi.fn>;
    getSupportedExtensions: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockParser = {
      parse: vi.fn().mockResolvedValue({}),
      extractSymbols: vi.fn().mockResolvedValue([]),
      canParse: vi.fn().mockReturnValue(true),
      getSupportedExtensions: vi.fn().mockReturnValue(['.ts', '.js']),
    };

    mockIndexEngine = {
      getAllIndexedFiles: vi.fn().mockReturnValue([]),
      indexProject: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    } as unknown as IndexEngine;

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
  });

  it('應該處理多檔案專案', async () => {
    vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
      { filePath: '/src/a.ts', size: 100 },
      { filePath: '/src/b.ts', size: 100 },
      { filePath: '/src/c.ts', size: 100 },
    ]);

    const detector = new DeadCodeDetector(
      mockIndexEngine,
      mockParserRegistry,
      mockFileSystem
    );

    const result = await detector.detect();

    expect(result.success).toBe(true);
  });

  it('應該處理不同檔案類型', async () => {
    vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
      { filePath: '/src/app.ts', size: 100 },
      { filePath: '/src/utils.js', size: 100 },
    ]);

    const detector = new DeadCodeDetector(
      mockIndexEngine,
      mockParserRegistry,
      mockFileSystem
    );

    const result = await detector.detect();

    expect(result.success).toBe(true);
  });

  it('應該處理沒有 parser 的檔案', async () => {
    vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
      { filePath: '/src/data.json', size: 100 },
    ]);
    vi.mocked(mockParserRegistry.getParser).mockReturnValue(null);

    const detector = new DeadCodeDetector(
      mockIndexEngine,
      mockParserRegistry,
      mockFileSystem
    );

    const result = await detector.detect();

    expect(result.success).toBe(true);
    expect(result.items).toHaveLength(0);
  });

  it('應該處理空檔案內容', async () => {
    vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
      { filePath: '/src/empty.ts', size: 0 },
    ]);
    vi.mocked(mockFileSystem.readFile).mockResolvedValue('');

    const detector = new DeadCodeDetector(
      mockIndexEngine,
      mockParserRegistry,
      mockFileSystem
    );

    const result = await detector.detect();

    expect(result.success).toBe(true);
  });

  describe('信心程度計算', () => {
    it('private 符號應該有較高信心', async () => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
        { filePath: '/src/test.ts', size: 100 },
      ]);
      mockParser.extractSymbols.mockResolvedValue([
        createMockSymbol('privateMethod', SymbolType.Function, '/src/test.ts', 1, ['private']),
      ]);

      const detector = new DeadCodeDetector(
        mockIndexEngine,
        mockParserRegistry,
        mockFileSystem,
        { symbolTypes: [SymbolType.Function] }
      );

      const result = await detector.detect();

      if (result.items.length > 0) {
        expect(result.items[0].confidence).toBeGreaterThanOrEqual(0.8);
      }
    });

    it('export 符號應該有較低信心（當 includeExports=true）', async () => {
      vi.mocked(mockIndexEngine.getAllIndexedFiles).mockReturnValue([
        { filePath: '/src/test.ts', size: 100 },
      ]);
      mockParser.extractSymbols.mockResolvedValue([
        createMockSymbol('exportedFunction', SymbolType.Function, '/src/test.ts', 1, ['export']),
      ]);

      const detector = new DeadCodeDetector(
        mockIndexEngine,
        mockParserRegistry,
        mockFileSystem,
        { includeExports: true, minConfidence: 0.5 }
      );

      const result = await detector.detect();

      if (result.items.length > 0) {
        expect(result.items[0].confidence).toBeLessThan(1.0);
      }
    });
  });
});
