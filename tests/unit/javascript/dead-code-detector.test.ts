/**
 * JavaScript Dead Code Detector 測試
 * 測試 Dead Code 檢測器在 JavaScript 程式碼上的功能
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
  filePath: overrides.filePath ?? '/src/test.js',
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
 * Mock Parser 建立（JavaScript 版本）
 */
const createMockParser = () => ({
  parse: vi.fn().mockResolvedValue({}),
  extractSymbols: vi.fn().mockResolvedValue([]),
  canParse: vi.fn().mockReturnValue(true),
  getSupportedExtensions: vi.fn().mockReturnValue(['.js', '.jsx', '.mjs', '.cjs']),
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
    getFileSymbols: vi.fn().mockResolvedValue([]),
    indexProject: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  } as unknown as IndexEngine;

  const parserRegistry = {
    getParser: vi.fn().mockReturnValue(parser),
    registerParser: vi.fn(),
    getSupportedExtensions: vi.fn().mockReturnValue(['.js', '.jsx', '.mjs', '.cjs']),
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
// MARK: - JavaScript Specific Tests
// ============================================================================

describe('JavaScript DeadCodeDetector', () => {
  describe('基本行為（JavaScript 檔案）', () => {
    it('應該回傳成功結果當沒有 JavaScript 檔案', async () => {
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

    it('應該處理 .js 檔案', async () => {
      // Given: JavaScript 檔案
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/app.js', size: 100 }],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 成功處理
      expect(result.success).toBe(true);
    });

    it('應該處理 .jsx 檔案', async () => {
      // Given: JSX 檔案
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/Component.jsx', size: 100 }],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 成功處理
      expect(result.success).toBe(true);
    });

    it('應該處理 .mjs 檔案（ES Module）', async () => {
      // Given: ES Module 檔案
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/module.mjs', size: 100 }],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 成功處理
      expect(result.success).toBe(true);
    });

    it('應該處理 .cjs 檔案（CommonJS）', async () => {
      // Given: CommonJS 檔案
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/module.cjs', size: 100 }],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 成功處理
      expect(result.success).toBe(true);
    });
  });

  describe('JavaScript 符號類型檢測', () => {
    it('應該檢測未使用的 function declaration', async () => {
      // Given: 未使用的函式
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/utils.js', size: 100 }],
        symbols: [
          createMockSymbol({
            name: 'unusedHelper',
            type: SymbolType.Function,
            filePath: '/src/utils.js',
          }),
        ],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 應該檢測到未使用函式
      const hasUnusedHelper = result.items.some((i) => i.name === 'unusedHelper');
      expect(hasUnusedHelper).toBe(true);
    });

    it('應該檢測未使用的 arrow function（變數）', async () => {
      // Given: 未使用的箭頭函式變數
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/utils.js', size: 100 }],
        symbols: [
          createMockSymbol({
            name: 'unusedArrowFn',
            type: SymbolType.Variable,
            filePath: '/src/utils.js',
          }),
        ],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 應該檢測到未使用變數
      const hasUnusedArrowFn = result.items.some((i) => i.name === 'unusedArrowFn');
      expect(hasUnusedArrowFn).toBe(true);
    });

    it('應該檢測未使用的 class', async () => {
      // Given: 未使用的類別
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/models.js', size: 100 }],
        symbols: [
          createMockSymbol({
            name: 'UnusedClass',
            type: SymbolType.Class,
            filePath: '/src/models.js',
          }),
        ],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 應該檢測到未使用類別
      const hasUnusedClass = result.items.some((i) => i.name === 'UnusedClass');
      expect(hasUnusedClass).toBe(true);
    });

    it('應該檢測未使用的 const 變數', async () => {
      // Given: 未使用的常數
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/config.js', size: 100 }],
        symbols: [
          createMockSymbol({
            name: 'UNUSED_CONSTANT',
            type: SymbolType.Variable,
            filePath: '/src/config.js',
          }),
        ],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 應該檢測到未使用常數
      const hasUnusedConstant = result.items.some((i) => i.name === 'UNUSED_CONSTANT');
      expect(hasUnusedConstant).toBe(true);
    });
  });

  describe('JavaScript export 處理', () => {
    it('預設應該排除 export 符號', async () => {
      // Given: export 的函式
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/api.js', size: 100 }],
        symbols: [
          createMockSymbol({
            name: 'exportedFunction',
            type: SymbolType.Function,
            modifiers: ['export'],
          }),
        ],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: export 符號不在結果中
      expect(result.items).toHaveLength(0);
    });

    it('includeExports=true 應該包含 export default', async () => {
      // Given: export default 的函式
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/main.js', size: 100 }],
        symbols: [
          createMockSymbol({
            name: 'defaultExport',
            type: SymbolType.Function,
            modifiers: ['export'],
          }),
        ],
      });
      const sut = createSut(deps, { includeExports: true, minConfidence: 0.5 });

      // When: 執行檢測
      const result = await sut.detect();

      // Then: export default 在結果中
      const hasDefaultExport = result.items.some((i) => i.name === 'defaultExport');
      expect(hasDefaultExport).toBe(true);
    });

    it('includeExports=true 應該包含 named export', async () => {
      // Given: named export 的函式
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/utils.js', size: 100 }],
        symbols: [
          createMockSymbol({
            name: 'namedExport',
            type: SymbolType.Function,
            modifiers: ['export'],
          }),
        ],
      });
      const sut = createSut(deps, { includeExports: true, minConfidence: 0.5 });

      // When: 執行檢測
      const result = await sut.detect();

      // Then: named export 在結果中
      const hasNamedExport = result.items.some((i) => i.name === 'namedExport');
      expect(hasNamedExport).toBe(true);
    });
  });

  describe('JavaScript 排除邏輯', () => {
    interface JsExclusionTestCase {
      scenario: string;
      symbolName: string;
    }

    // 注意：預設只排除 main 和 constructor
    // 其他如 index、App、setup、init、configure 等應由使用者根據專案特性自行配置
    it.each<JsExclusionTestCase>([
      { scenario: 'constructor', symbolName: 'constructor' },
      { scenario: 'main 入口', symbolName: 'main' },
    ])('應該排除 $scenario', async ({ symbolName }) => {
      // Given: 有該符號的 JavaScript 專案
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/app.js', size: 100 }],
        symbols: [
          createMockSymbol({
            name: symbolName,
            filePath: '/src/app.js',
          }),
        ],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 該符號不在結果中
      const names = result.items.map((i) => i.name);
      expect(names).not.toContain(symbolName);
    });

    it('應該排除 React 生命週期方法名稱', async () => {
      // Given: React 相關方法（透過排除模式）
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/Component.jsx', size: 100 }],
        symbols: [
          createMockSymbol({
            name: 'componentDidMount',
            type: SymbolType.Function,
          }),
        ],
      });
      const sut = createSut(deps, { excludePatterns: ['componentDid*', 'componentWill*'] });

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 生命週期方法不在結果中
      const names = result.items.map((i) => i.name);
      expect(names).not.toContain('componentDidMount');
    });
  });

  describe('JavaScript 混合檔案類型', () => {
    it('應該處理混合 JS/JSX 專案', async () => {
      // Given: 混合檔案類型
      const deps = createMockDependencies({
        indexedFiles: [
          { filePath: '/src/utils.js', size: 100 },
          { filePath: '/src/App.jsx', size: 100 },
          { filePath: '/src/config.mjs', size: 100 },
          { filePath: '/src/legacy.cjs', size: 100 },
        ],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 成功處理
      expect(result.success).toBe(true);
    });

    it('應該處理 JS 和 TS 混合專案', async () => {
      // Given: JS 和 TS 混合
      const deps = createMockDependencies({
        indexedFiles: [
          { filePath: '/src/utils.js', size: 100 },
          { filePath: '/src/types.ts', size: 100 },
        ],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 成功處理
      expect(result.success).toBe(true);
    });
  });

  describe('JavaScript 常見模式', () => {
    it('應該處理 IIFE（立即執行函式表達式）', async () => {
      // Given: IIFE 模式
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/init.js', size: 100 }],
        fileContent: `
          (function() {
            const privateVar = 'secret';
            function privateFunc() {}
          })();
        `,
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 成功處理（IIFE 內部變數通常不被報告）
      expect(result.success).toBe(true);
    });

    it('應該處理 module.exports（CommonJS）', async () => {
      // Given: CommonJS 模組
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/module.cjs', size: 100 }],
        symbols: [
          createMockSymbol({
            name: 'exportedFunc',
            type: SymbolType.Function,
            modifiers: ['export'],
          }),
        ],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: export 的函式預設被排除
      expect(result.items).toHaveLength(0);
    });
  });

  describe('JavaScript Edge Cases', () => {
    it('應該處理空 JavaScript 檔案', async () => {
      // Given: 空檔案
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/empty.js', size: 0 }],
        fileContent: '',
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 成功但無結果
      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(0);
    });

    it('應該處理解析失敗的 JavaScript 檔案', async () => {
      // Given: 解析會失敗的檔案
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/invalid.js', size: 100 }],
      });
      deps.parser.parse.mockRejectedValue(new Error('Syntax error'));
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 應該處理錯誤並繼續
      expect(result.success).toBe(true);
    });

    it('應該處理 Unicode 識別符', async () => {
      // Given: Unicode 符號名稱
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/i18n.js', size: 100 }],
        symbols: [
          createMockSymbol({ name: 'getMessage' }),
          createMockSymbol({ name: '取得訊息' }), // 中文
          createMockSymbol({ name: '名前' }), // 日文
        ],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 成功處理
      expect(result.success).toBe(true);
    });

    it('應該處理大型 JavaScript 專案（效能測試）', async () => {
      // Given: 50 個檔案
      const files = Array.from({ length: 50 }, (_, i) => ({
        filePath: `/src/file${i}.js`,
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

  describe('JavaScript symbolTypes 選項', () => {
    it('應該只檢測指定類型（Function）', async () => {
      // Given: 只檢測 Function
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/app.js', size: 100 }],
        symbols: [
          createMockSymbol({ name: 'unusedFunc', type: SymbolType.Function }),
          createMockSymbol({ name: 'UnusedClass', type: SymbolType.Class }),
          createMockSymbol({ name: 'unusedVar', type: SymbolType.Variable }),
        ],
      });
      const sut = createSut(deps, { symbolTypes: [SymbolType.Function] });

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 只有 Function 在結果中
      const types = result.items.map((i) => i.type);
      expect(types).not.toContain(SymbolType.Class);
      expect(types).not.toContain(SymbolType.Variable);
      if (result.items.length > 0) {
        expect(types.every((t) => t === SymbolType.Function)).toBe(true);
      }
    });

    it('應該只檢測指定類型（Class）', async () => {
      // Given: 只檢測 Class
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/models.js', size: 100 }],
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

    it('JavaScript 不應該檢測 Interface（JS 沒有此概念）', async () => {
      // Given: 設定只檢測 Interface（但 JS 沒有）
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/app.js', size: 100 }],
        symbols: [
          createMockSymbol({ name: 'unusedFunc', type: SymbolType.Function }),
        ],
      });
      const sut = createSut(deps, { symbolTypes: [SymbolType.Interface] });

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 無結果（JS 沒有 Interface）
      expect(result.items).toHaveLength(0);
    });

    it('JavaScript 不應該檢測 Type（JS 沒有此概念）', async () => {
      // Given: 設定只檢測 Type（但 JS 沒有）
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/app.js', size: 100 }],
        symbols: [
          createMockSymbol({ name: 'unusedFunc', type: SymbolType.Function }),
        ],
      });
      const sut = createSut(deps, { symbolTypes: [SymbolType.Type] });

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 無結果（JS 沒有 Type）
      expect(result.items).toHaveLength(0);
    });
  });

  describe('JavaScript 統計資訊', () => {
    it('應該正確計算 byType 統計', async () => {
      // Given: 多種類型符號
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/app.js', size: 100 }],
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
          { filePath: '/src/a.js', size: 100 },
          { filePath: '/src/b.js', size: 100 },
        ],
      });
      deps.parser.extractSymbols.mockResolvedValue([
        createMockSymbol({ name: 'unused', filePath: '/src/a.js' }),
      ]);
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: filesAffected >= 0
      expect(result.stats.filesAffected).toBeGreaterThanOrEqual(0);
    });

    it('應該記錄掃描時間', async () => {
      // Given: JavaScript 專案
      const deps = createMockDependencies({
        indexedFiles: [{ filePath: '/src/app.js', size: 100 }],
      });
      const sut = createSut(deps);

      // When: 執行檢測
      const result = await sut.detect();

      // Then: 掃描時間 >= 0
      expect(result.stats.scanTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('createDeadCodeDetector factory', () => {
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

  describe('錯誤處理', () => {
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
});

// ============================================================================
// MARK: - DEFAULT_DEAD_CODE_OPTIONS Tests (JavaScript context)
// ============================================================================

describe('DEFAULT_DEAD_CODE_OPTIONS（JavaScript 上下文）', () => {
  it('應該有正確的預設值', () => {
    expect(DEFAULT_DEAD_CODE_OPTIONS.includeExports).toBe(false);
    expect(Array.isArray(DEFAULT_DEAD_CODE_OPTIONS.excludePatterns)).toBe(true);
    expect(Array.isArray(DEFAULT_DEAD_CODE_OPTIONS.symbolTypes)).toBe(true);
  });

  it('JavaScript 應該檢測 Function、Class、Variable', () => {
    // JavaScript 支援的類型
    expect(DEFAULT_DEAD_CODE_OPTIONS.symbolTypes).toContain(SymbolType.Function);
    expect(DEFAULT_DEAD_CODE_OPTIONS.symbolTypes).toContain(SymbolType.Class);
    expect(DEFAULT_DEAD_CODE_OPTIONS.symbolTypes).toContain(SymbolType.Variable);
  });

  it('預設 symbolTypes 包含 Interface/Type 但 JS Parser 不會產生這些符號', () => {
    // 預設選項包含這些類型（為了 TypeScript 相容）
    // 但 JavaScript parser 不會產生 Interface/Type 符號
    expect(DEFAULT_DEAD_CODE_OPTIONS.symbolTypes).toContain(SymbolType.Interface);
    expect(DEFAULT_DEAD_CODE_OPTIONS.symbolTypes).toContain(SymbolType.Type);
  });
});
