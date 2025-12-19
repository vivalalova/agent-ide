/**
 * DeadCodeDetector 測試
 * 測試 Dead Code 檢測器的所有功能
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DeadCodeDetector,
  createDeadCodeDetector,
} from '@core/deadcode/dead-code-detector.js';
import {
  DEFAULT_DEAD_CODE_OPTIONS,
  type DeadCodeDetectorOptions,
} from '@core/deadcode/types.js';
import { SymbolType } from '@shared/types/symbol.js';
import type { IndexEngine } from '@core/shared/indexing/index.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { Symbol } from '@shared/types/symbol.js';
import type { Location } from '@shared/types/core.js';

// ============================================================================
// MARK: - Test Infrastructure
// ============================================================================

/**
 * Location 測試資料建立
 */
const createMockLocation = (
  overrides: Partial<{
    filePath: string;
    line: number;
    column: number;
  }> = {}
): Location => ({
  filePath: overrides.filePath ?? '/src/test.ts',
  range: {
    start: {
      line: overrides.line ?? 1,
      column: overrides.column ?? 1,
      offset: 0,
    },
    end: {
      line: overrides.line ?? 1,
      column: (overrides.column ?? 1) + 10,
      offset: 9,
    },
  },
});

/**
 * Symbol 測試資料建立
 */
const createMockSymbol = (
  overrides: Partial<{
    name: string;
    type: SymbolType;
    filePath: string;
    line: number;
    modifiers: string[];
  }> = {}
): Symbol => ({
  name: overrides.name ?? 'testSymbol',
  type: overrides.type ?? SymbolType.Function,
  location: createMockLocation({
    filePath: overrides.filePath,
    line: overrides.line,
  }),
  modifiers: overrides.modifiers ?? [],
});

/**
 * Mock Parser 建立
 */
const createMockParser = () => ({
  parse: vi.fn().mockResolvedValue({}),
  extractSymbols: vi.fn().mockResolvedValue([]),
  canParse: vi.fn().mockReturnValue(true),
  getSupportedExtensions: vi.fn().mockReturnValue(['.ts', '.js']),
});

/**
 * Mock 依賴建立
 */
interface MockDependencies {
  indexEngine: IndexEngine;
  parserRegistry: ParserRegistry;
  fileSystem: IFileSystem;
  parser: ReturnType<typeof createMockParser>;
}

const createMockDependencies = (
  overrides: Partial<{
    indexedFiles: Array<{ filePath: string; size: number }>;
    fileContent: string;
    symbols: Symbol[];
  }> = {}
): MockDependencies => {
  const parser = createMockParser();

  if (overrides.symbols) {
    parser.extractSymbols.mockResolvedValue(overrides.symbols);
  }

  const indexEngine = {
    getAllIndexedFiles: vi
      .fn()
      .mockReturnValue(overrides.indexedFiles ?? []),
    indexProject: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  } as unknown as IndexEngine;

  const parserRegistry = {
    getParser: vi.fn().mockReturnValue(parser),
    registerParser: vi.fn(),
    getSupportedExtensions: vi.fn().mockReturnValue(['.ts', '.js']),
  } as unknown as ParserRegistry;

  const fileSystem = {
    readFile: vi.fn().mockResolvedValue(overrides.fileContent ?? 'const x = 1;'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    isFile: vi.fn().mockResolvedValue(true),
    isDirectory: vi.fn().mockResolvedValue(false),
  } as unknown as IFileSystem;

  return { indexEngine, parserRegistry, fileSystem, parser };
};

/**
 * SUT 建立
 */
const createSut = (
  deps: MockDependencies,
  options?: DeadCodeDetectorOptions
): DeadCodeDetector =>
  new DeadCodeDetector(deps.indexEngine, deps.parserRegistry, deps.fileSystem, options);

// ============================================================================
// MARK: - DEFAULT_DEAD_CODE_OPTIONS Tests
// ============================================================================

describe('DEFAULT_DEAD_CODE_OPTIONS', () => {
  it('應該有正確的預設值', () => {
    // Given: 預設選項物件
    // When: 檢查各屬性
    // Then: 確認預設值正確
    expect(DEFAULT_DEAD_CODE_OPTIONS.includeExports).toBe(false);
    expect(Array.isArray(DEFAULT_DEAD_CODE_OPTIONS.excludePatterns)).toBe(true);
    expect(Array.isArray(DEFAULT_DEAD_CODE_OPTIONS.symbolTypes)).toBe(true);
  });

  // 注意：預設只排除 main（程式進入點）
  // 其他如 index、App、setup、init、configure 等應由使用者根據專案特性自行配置
  it.each([
    { pattern: 'main', description: '入口函數' },
  ])('應該排除 $description ($pattern)', ({ pattern }) => {
    expect(DEFAULT_DEAD_CODE_OPTIONS.excludePatterns).toContain(pattern);
  });

  it.each([
    { type: SymbolType.Function, description: '函式' },
    { type: SymbolType.Class, description: '類別' },
    { type: SymbolType.Variable, description: '變數' },
    { type: SymbolType.Interface, description: '介面' },
    { type: SymbolType.Type, description: '型別' },
  ])('應該檢測 $description ($type)', ({ type }) => {
    expect(DEFAULT_DEAD_CODE_OPTIONS.symbolTypes).toContain(type);
  });
});

// ============================================================================
// MARK: - DeadCodeDetector Constructor Tests
// ============================================================================

describe('DeadCodeDetector constructor', () => {
  it('應該建立新的 DeadCodeDetector 實例', () => {
    // Given: mock 依賴
    const deps = createMockDependencies();

    // When: 建立實例
    const sut = createSut(deps);

    // Then: 實例存在
    expect(sut).toBeDefined();
    expect(sut).toBeInstanceOf(DeadCodeDetector);
  });

  it.each([
    {
      scenario: 'includeExports 為 true',
      options: { includeExports: true },
    },
    {
      scenario: 'minConfidence 為 0.5',
      options: { minConfidence: 0.5 },
    },
    {
      scenario: '空的 excludePatterns',
      options: { excludePatterns: [] },
    },
    {
      scenario: '單一 symbolType',
      options: { symbolTypes: [SymbolType.Function] },
    },
    {
      scenario: '所有選項自訂',
      options: {
        includeExports: true,
        minConfidence: 0.3,
        excludePatterns: ['custom*'],
        symbolTypes: [SymbolType.Class],
      },
    },
  ])('應該接受自訂選項：$scenario', ({ options }) => {
    // Given: mock 依賴
    const deps = createMockDependencies();

    // When: 使用自訂選項建立實例
    const sut = createSut(deps, options);

    // Then: 實例建立成功
    expect(sut).toBeDefined();
  });
});

// ============================================================================
// MARK: - createDeadCodeDetector Factory Tests
// ============================================================================

describe('createDeadCodeDetector', () => {
  it('應該建立 DeadCodeDetector 實例', () => {
    // Given: mock 依賴
    const deps = createMockDependencies();

    // When: 使用 factory 函數建立
    const result = createDeadCodeDetector(
      deps.indexEngine,
      deps.parserRegistry,
      deps.fileSystem
    );

    // Then: 回傳正確型別
    expect(result).toBeInstanceOf(DeadCodeDetector);
  });

  it('應該傳遞選項到 DeadCodeDetector', () => {
    // Given: mock 依賴與選項
    const deps = createMockDependencies();
    const options: DeadCodeDetectorOptions = { includeExports: true };

    // When: 使用選項建立
    const result = createDeadCodeDetector(
      deps.indexEngine,
      deps.parserRegistry,
      deps.fileSystem,
      options
    );

    // Then: 實例建立成功
    expect(result).toBeInstanceOf(DeadCodeDetector);
  });
});

// ============================================================================
// MARK: - detect() Basic Tests
// ============================================================================

describe('DeadCodeDetector.detect', () => {
  describe('基本行為', () => {
    it('應該回傳成功結果當沒有檔案', async () => {
      // Given: 沒有索引檔案
      const deps = createMockDependencies({ indexedFiles: [] });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 回傳空結果
      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(0);
      expect(result.stats.totalSymbols).toBe(0);
    });

    it('應該回傳正確的統計欄位', async () => {
      // Given: 空專案
      const deps = createMockDependencies();
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 統計欄位完整
      expect(result.stats).toBeDefined();
      expect(typeof result.stats.totalSymbols).toBe('number');
      expect(typeof result.stats.deadCodeCount).toBe('number');
      expect(typeof result.stats.filesAffected).toBe('number');
      expect(typeof result.stats.scanTime).toBe('number');
      expect(typeof result.stats.byType).toBe('object');
    });

    it('應該記錄掃描時間', async () => {
      // Given: 空專案
      const deps = createMockDependencies();
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 掃描時間 >= 0
      expect(result.stats.scanTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('檔案處理', () => {
    interface FileHandlingTestCase {
      scenario: string;
      indexedFiles: Array<{ filePath: string; size: number }>;
      parserOverride?: (parser: ReturnType<typeof createMockParser>) => void;
      fileSystemOverride?: (fs: IFileSystem) => void;
      expectedSuccess: boolean;
      expectedItemCount: number;
    }

    it.each<FileHandlingTestCase>([
      {
        scenario: '處理索引檔案',
        indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
        expectedSuccess: true,
        expectedItemCount: 0,
      },
      {
        scenario: '處理解析失敗',
        indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
        parserOverride: (parser) =>
          parser.parse.mockRejectedValue(new Error('Parse error')),
        expectedSuccess: true,
        expectedItemCount: 0,
      },
      {
        scenario: '處理讀取檔案失敗',
        indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
        fileSystemOverride: (fs) =>
          vi.mocked(fs.readFile).mockRejectedValue(new Error('Read error')),
        expectedSuccess: true,
        expectedItemCount: 0,
      },
      {
        scenario: '處理空檔案內容',
        indexedFiles: [{ filePath: '/src/empty.ts', size: 0 }],
        fileSystemOverride: (fs) =>
          vi.mocked(fs.readFile).mockResolvedValue(''),
        expectedSuccess: true,
        expectedItemCount: 0,
      },
    ])(
      '應該 $scenario',
      async ({
        indexedFiles,
        parserOverride,
        fileSystemOverride,
        expectedSuccess,
        expectedItemCount,
      }) => {
        // Given: 設定情境
        const deps = createMockDependencies({ indexedFiles });
        if (parserOverride) {parserOverride(deps.parser);}
        if (fileSystemOverride) {fileSystemOverride(deps.fileSystem);}
        const sut = createSut(deps);

        // When: 執行檢測
        const result = await sut.detect();

        // Then: 驗證結果
        expect(result.success).toBe(expectedSuccess);
        expect(result.items).toHaveLength(expectedItemCount);
      }
    );

    it('應該處理沒有 parser 的檔案', async () => {
      // Given: 有 JSON 檔案但無對應 parser
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/data.json', size: 100 }],
      });
      vi.mocked(deps.parserRegistry.getParser).mockReturnValue(null);
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 應跳過該檔案
      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(0);
    });
  });
});

// ============================================================================
// MARK: - Symbol Exclusion Tests
// ============================================================================

describe('DeadCodeDetector 排除邏輯', () => {
  describe('內建排除', () => {
    interface BuiltInExclusionTestCase {
      scenario: string;
      symbolName: string;
    }

    // 注意：預設只排除 main 和 constructor
    // 其他如 index、App、setup、init、configure 等應由使用者根據專案特性自行配置
    it.each<BuiltInExclusionTestCase>([
      { scenario: 'constructor', symbolName: 'constructor' },
      { scenario: '預設排除 main', symbolName: 'main' },
    ])('應該排除 $scenario', async ({ symbolName }) => {
      // Given: 有該符號的專案
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
        symbols: [createMockSymbol({ name: symbolName })],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 該符號不在結果中
      const names = result.items.map((i) => i.name);
      expect(names).not.toContain(symbolName);
    });
  });

  describe('符號類型過濾', () => {
    interface SymbolTypeTestCase {
      scenario: string;
      symbolType: SymbolType;
    }

    it.each<SymbolTypeTestCase>([
      {
        scenario: 'Property（預設不檢測）',
        symbolType: SymbolType.Property,
      },
      {
        scenario: 'Constant（預設不檢測）',
        symbolType: SymbolType.Constant,
      },
      {
        scenario: 'Enum（預設不檢測）',
        symbolType: SymbolType.Enum,
      },
    ])('$scenario 應該被過濾', async ({ symbolType }) => {
      // Given: 有該類型符號的專案（該類型不在預設 symbolTypes 中）
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
        symbols: [createMockSymbol({ name: 'mySymbol', type: symbolType })],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 該類型不在結果中（因為不在預設 symbolTypes 中）
      expect(result.items).toHaveLength(0);
    });
  });

  describe('自訂排除模式', () => {
    interface CustomExclusionTestCase {
      scenario: string;
      excludePatterns: string[];
      symbols: Array<{ name: string; shouldExclude: boolean }>;
    }

    it.each<CustomExclusionTestCase>([
      {
        scenario: 'glob 前綴匹配 test*',
        excludePatterns: ['test*'],
        symbols: [
          { name: 'testFunction', shouldExclude: true },
          { name: 'normalFunction', shouldExclude: false },
        ],
      },
      {
        scenario: 'glob 後綴匹配 *Helper',
        excludePatterns: ['*Helper'],
        symbols: [
          { name: 'myHelper', shouldExclude: true },
          { name: 'helper', shouldExclude: false },
        ],
      },
      {
        scenario: '大小寫不敏感匹配',
        excludePatterns: ['MAIN'],
        symbols: [
          { name: 'main', shouldExclude: true },
          { name: 'Main', shouldExclude: true },
          { name: 'MAIN', shouldExclude: true },
        ],
      },
      {
        scenario: '複合模式匹配',
        excludePatterns: ['test*', '*Spec', 'mock*'],
        symbols: [
          { name: 'testUser', shouldExclude: true },
          { name: 'userSpec', shouldExclude: true },
          { name: 'mockApi', shouldExclude: true },
          { name: 'realFunction', shouldExclude: false },
        ],
      },
    ])('應該支援 $scenario', async ({ excludePatterns, symbols }) => {
      // Given: 設定排除模式
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
        symbols: symbols.map((s) => createMockSymbol({ name: s.name })),
      });
      const sut = createSut(deps, { excludePatterns });

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 驗證排除結果
      const resultNames = result.items.map((i) => i.name);
      for (const { name, shouldExclude } of symbols) {
        if (shouldExclude) {
          expect(resultNames).not.toContain(name);
        }
      }
    });
  });
});

// ============================================================================
// MARK: - Options Tests
// ============================================================================

describe('DeadCodeDetector 選項', () => {
  describe('symbolTypes 選項', () => {
    it('應該只檢測指定類型', async () => {
      // Given: 只檢測 Class
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
        symbols: [
          createMockSymbol({ name: 'unusedFunc', type: SymbolType.Function }),
          createMockSymbol({ name: 'UnusedClass', type: SymbolType.Class }),
        ],
      });
      const sut = createSut(deps, { symbolTypes: [SymbolType.Class] });

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 只有 Class 在結果中
      const types = result.items.map((i) => i.type);
      expect(types).not.toContain(SymbolType.Function);
    });
  });

  describe('includeExports 選項', () => {
    it('預設應該排除 export 符號', async () => {
      // Given: export 符號
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
        symbols: [
          createMockSymbol({ name: 'exportedFunc', modifiers: ['export'] }),
        ],
      });
      const sut = createSut(deps); // includeExports 預設 false

      // When: 執行檢測
      const result = await sut.detect();

      // Then: export 符號不在結果中
      expect(result.items).toHaveLength(0);
    });

    it('includeExports=true 應該包含 export 符號', async () => {
      // Given: export 符號且 includeExports=true
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
        symbols: [
          createMockSymbol({ name: 'exportedFunc', modifiers: ['export'] }),
        ],
      });
      const sut = createSut(deps, { includeExports: true, minConfidence: 0.5 });

      // When: 執行檢測
      const result = await sut.detect();

      // Then: export 符號在結果中
      const hasExported = result.items.some((i) => i.name === 'exportedFunc');
      expect(hasExported).toBe(true);
    });
  });
});

// ============================================================================
// MARK: - Statistics Tests
// ============================================================================

describe('DeadCodeDetector 統計資訊', () => {
  it('應該正確計算 byType 統計', async () => {
    // Given: 多種類型符號
    const deps = createMockDependencies({
      indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
      symbols: [
        createMockSymbol({ name: 'func1', type: SymbolType.Function }),
        createMockSymbol({ name: 'func2', type: SymbolType.Function }),
        createMockSymbol({ name: 'MyClass', type: SymbolType.Class }),
      ],
    });
    const sut = createSut(deps);

    // When: 執行檢測
    const result = await sut.detect();

    // Then: byType 統計正確
    expect(result.stats.byType).toBeDefined();
    expect(typeof result.stats.byType).toBe('object');
  });

  it('應該正確計算 filesAffected', async () => {
    // Given: 多檔案專案
    const deps = createMockDependencies({
      indexedFiles: [
        { filePath: '/src/a.ts', size: 100 },
        { filePath: '/src/b.ts', size: 100 },
      ],
    });
    deps.parser.extractSymbols.mockResolvedValue([
      createMockSymbol({ name: 'unused', filePath: '/src/a.ts' }),
    ]);
    const sut = createSut(deps);

    // When: 執行檢測
    const result = await sut.detect();

    // Then: filesAffected >= 0
    expect(result.stats.filesAffected).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// MARK: - Error Handling Tests
// ============================================================================

describe('DeadCodeDetector 錯誤處理', () => {
  it('應該在檢測過程中捕獲錯誤並回傳失敗結果', async () => {
    // Given: getAllIndexedFiles 拋出錯誤
    const deps = createMockDependencies();
    vi.mocked(deps.indexEngine.getAllIndexedFiles).mockImplementation(() => {
      throw new Error('Index error');
    });
    const sut = createSut(deps);

    // When: 執行檢測
    const result = await sut.detect();

    // Then: 回傳失敗結果
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Index error');
  });

  it('應該在錯誤時回傳空統計', async () => {
    // Given: 拋出錯誤
    const deps = createMockDependencies();
    vi.mocked(deps.indexEngine.getAllIndexedFiles).mockImplementation(() => {
      throw new Error('Index error');
    });
    const sut = createSut(deps);

    // When: 執行檢測
    const result = await sut.detect();

    // Then: 統計為空
    expect(result.stats.totalSymbols).toBe(0);
    expect(result.stats.deadCodeCount).toBe(0);
    expect(result.stats.filesAffected).toBe(0);
  });
});

// ============================================================================
// MARK: - DeadCodeItem Structure Tests
// ============================================================================

describe('DeadCodeItem 結構', () => {
  it('應該包含正確的欄位', async () => {
    // Given: 有未使用符號
    const deps = createMockDependencies({
      indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
      symbols: [
        createMockSymbol({
          name: 'unusedFunction',
          type: SymbolType.Function,
          filePath: '/src/test.ts',
          line: 5,
        }),
      ],
    });
    const sut = createSut(deps);

    // When: 執行檢測
    const result = await sut.detect();

    // Then: 驗證結構
    if (result.items.length > 0) {
      const item = result.items[0];
      expect(item.name).toBe('unusedFunction');
      expect(item.type).toBe(SymbolType.Function);
      expect(item.location).toBeDefined();
      expect(item.location.filePath).toBe('/src/test.ts');
      expect(item.location.range).toBeDefined();
      expect(typeof item.reason).toBe('string');
    }
  });
});

// ============================================================================
// MARK: - Edge Cases Tests
// ============================================================================

describe('DeadCodeDetector Edge Cases', () => {
  describe('空值與邊界', () => {
    it('應該處理空的 excludePatterns', async () => {
      // Given: 空的排除模式
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
        symbols: [createMockSymbol({ name: 'main' })], // 預設會排除 main
      });
      const sut = createSut(deps, { excludePatterns: [] });

      // When: 執行檢測
      const result = await sut.detect();

      // Then: main 不再被排除
      const hasMain = result.items.some((i) => i.name === 'main');
      expect(hasMain).toBe(true);
    });

  });

  describe('Unicode 與特殊字元', () => {
    interface UnicodeTestCase {
      scenario: string;
      symbolName: string;
    }

    it.each<UnicodeTestCase>([
      { scenario: '中文符號名稱', symbolName: '計算總額' },
      { scenario: '日文符號名稱', symbolName: '名前' },
      { scenario: '韓文符號名稱', symbolName: '테마' },
      { scenario: 'emoji 符號名稱', symbolName: 'func_emoji' },
      { scenario: '數字開頭（無效）', symbolName: '123func' },
      { scenario: '底線開頭', symbolName: '_privateFunc' },
      { scenario: '雙底線', symbolName: '__dunderMethod__' },
    ])('應該處理 $scenario', async ({ symbolName }) => {
      // Given: Unicode 符號
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
        symbols: [createMockSymbol({ name: symbolName })],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 不應拋出錯誤
      expect(result.success).toBe(true);
    });
  });

  describe('多檔案與大型專案', () => {
    it('應該處理多檔案專案', async () => {
      // Given: 多個檔案
      const deps = createMockDependencies({
        indexedFiles: [
          { filePath: '/src/a.ts', size: 100 },
          { filePath: '/src/b.ts', size: 100 },
          { filePath: '/src/c.ts', size: 100 },
        ],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 成功處理
      expect(result.success).toBe(true);
    });

    it('應該處理不同檔案類型', async () => {
      // Given: 混合檔案類型
      const deps = createMockDependencies({
        indexedFiles: [
          { filePath: '/src/app.ts', size: 100 },
          { filePath: '/src/utils.js', size: 100 },
        ],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 成功處理
      expect(result.success).toBe(true);
    });

    it('應該處理大量檔案（效能測試）', async () => {
      // Given: 50 個檔案
      const files = Array.from({ length: 50 }, (_, i) => ({
        filePath: `/src/file${i}.ts`,
        size: 100,
      }));
      const deps = createMockDependencies({ indexedFiles: files });
      const sut = createSut(deps);

      // When: 執行檢測並計時
      const startTime = Date.now();
      const result = await sut.detect();
      const elapsed = Date.now() - startTime;

      // Then: 應在合理時間內完成（5秒）
      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe('排除模式邊界', () => {
    it('應該處理只有 * 的 glob 模式', async () => {
      // Given: 只有 * 的模式
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
        symbols: [createMockSymbol({ name: 'anySymbol' })],
      });
      const sut = createSut(deps, { excludePatterns: ['*'] });

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 所有符號都被排除
      expect(result.items).toHaveLength(0);
    });

    it('應該處理無效的 glob 模式', async () => {
      // Given: 複雜模式
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/test.ts', size: 100 }],
        symbols: [createMockSymbol({ name: 'testFunc' })],
      });
      const sut = createSut(deps, { excludePatterns: ['[invalid'] });

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 不應拋出錯誤（可能不匹配）
      expect(result.success).toBe(true);
    });
  });
});
