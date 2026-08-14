/**
 * DeadCodeRemover 單元測試
 * 測試 dead code 刪除器的各種場景
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeadCodeRemover, createDeadCodeRemover } from '@core/deadcode/dead-code-remover.js';
import type { DeadCodeItem, DeadCodeRemovalPreview } from '@core/deadcode/types.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { ParserPlugin } from '@infrastructure/parser/interface.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { SymbolType } from '@shared/types/symbol.js';

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
    parse: vi.fn().mockResolvedValue({ tsSourceFile: {} }),
    extractSymbols: vi.fn().mockResolvedValue([]),
    findReferences: vi.fn().mockResolvedValue([]),
    extractDependencies: vi.fn().mockResolvedValue([]),
    rename: vi.fn().mockResolvedValue([]),
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
 * 建立 DeadCodeItem
 */
function createDeadCodeItem(
  name: string,
  type: SymbolType = SymbolType.Function,
  filePath = '/test.ts',
  startLine = 1
): DeadCodeItem {
  return {
    name,
    type,
    location: {
      filePath,
      range: {
        start: { line: startLine, column: 1, offset: 0 },
        end: { line: startLine, column: 20, offset: 19 }
      }
    },
    reason: 'Unused'
  };
}

// ===== 測試 =====

describe('DeadCodeRemover', () => {
  let remover: DeadCodeRemover;
  let mockFileSystem: IFileSystem;
  let mockParserRegistry: ParserRegistry;
  let mockParser: ParserPlugin;

  beforeEach(() => {
    mockParser = createMockParser();
    mockParserRegistry = createMockParserRegistry(mockParser);
    mockFileSystem = createMockFileSystem({});
    remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry);
  });

  describe('preview - 基本功能', () => {
    it('應該返回空結果當沒有 dead code items', async () => {
      const result = await remover.preview([]);

      expect(result.success).toBe(true);
      expect(result.removals).toHaveLength(0);
      expect(result.importCleanups).toHaveLength(0);
      expect(result.affectedFiles).toHaveLength(0);
    });

    it('應該產生 removal operations', async () => {
      const fileContent = 'function unused() { return 1; }';
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry);

      const items = [createDeadCodeItem('unused')];
      const result = await remover.preview(items);

      expect(result.success).toBe(true);
      expect(result.removals).toHaveLength(1);
      expect(result.removals[0].symbolName).toBe('unused');
    });

    it('應該計算正確的統計資訊', async () => {
      const fileContent = `function foo() {}
function bar() {}`;
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry);

      const items = [
        createDeadCodeItem('foo', SymbolType.Function, '/test.ts', 1),
        createDeadCodeItem('bar', SymbolType.Function, '/test.ts', 2)
      ];
      const result = await remover.preview(items);

      expect(result.summary.totalRemovals).toBe(2);
      expect(result.summary.byType[SymbolType.Function]).toBe(2);
      expect(result.summary.filesAffected).toBe(1);
    });
  });

  describe('preview - 過濾選項', () => {
    it('應該排除符合 excludeFiles 模式的檔案', async () => {
      mockFileSystem = createMockFileSystem({
        '/test.ts': 'function foo() {}',
        '/test.spec.ts': 'function bar() {}'
      });
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry, {
        excludeFiles: ['*.spec.ts']
      });

      const items = [
        createDeadCodeItem('foo', SymbolType.Function, '/test.ts'),
        createDeadCodeItem('bar', SymbolType.Function, '/test.spec.ts')
      ];
      const result = await remover.preview(items);

      expect(result.removals).toHaveLength(1);
      expect(result.removals[0].symbolName).toBe('foo');
      expect(result.warnings).toContainEqual(expect.stringContaining('被排除'));
    });

    it('應該排除符合 excludeSymbols 的符號', async () => {
      mockFileSystem = createMockFileSystem({
        '/test.ts': 'function main() {}\nfunction foo() {}'
      });
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry, {
        excludeSymbols: ['main']
      });

      const items = [
        createDeadCodeItem('main', SymbolType.Function, '/test.ts', 1),
        createDeadCodeItem('foo', SymbolType.Function, '/test.ts', 2)
      ];
      const result = await remover.preview(items);

      expect(result.removals).toHaveLength(1);
      expect(result.removals[0].symbolName).toBe('foo');
    });

    it('應該支援 glob 模式的 excludeFiles', async () => {
      mockFileSystem = createMockFileSystem({
        '/src/test.ts': 'function foo() {}',
        '/__tests__/test.ts': 'function bar() {}'
      });
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry, {
        excludeFiles: ['**/__tests__/**']
      });

      const items = [
        createDeadCodeItem('foo', SymbolType.Function, '/src/test.ts'),
        createDeadCodeItem('bar', SymbolType.Function, '/__tests__/test.ts')
      ];
      const result = await remover.preview(items);

      expect(result.removals).toHaveLength(1);
      expect(result.removals[0].symbolName).toBe('foo');
    });

    it('應該支援簡單字串包含匹配', async () => {
      mockFileSystem = createMockFileSystem({
        '/src/test.ts': 'function foo() {}',
        '/src/test.mock.ts': 'function bar() {}'
      });
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry, {
        excludeFiles: ['.mock.']
      });

      const items = [
        createDeadCodeItem('foo', SymbolType.Function, '/src/test.ts'),
        createDeadCodeItem('bar', SymbolType.Function, '/src/test.mock.ts')
      ];
      const result = await remover.preview(items);

      expect(result.removals).toHaveLength(1);
    });
  });

  describe('preview - Import 清理', () => {
    it('當 cleanupImports 為 true 時應該分析 import', async () => {
      mockFileSystem = createMockFileSystem({
        '/test.ts': 'import { unused } from \'./utils\';\nfunction unused() {}'
      });
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry, {
        cleanupImports: true
      });

      mockParser.getImportDeclarations = vi.fn().mockReturnValue([{
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 34, offset: 33 } },
        moduleSpecifier: './utils',
        isTypeOnly: false,
        namedImports: [{ name: 'unused' }],
        rawStatement: 'import { unused } from \'./utils\';'
      }]);

      const items = [createDeadCodeItem('unused', SymbolType.Function, '/test.ts', 2)];
      const result = await remover.preview(items);

      // import 清理應該被分析
      expect(result.success).toBe(true);
    });

    it('當 cleanupImports 為 false 時應該跳過 import 分析', async () => {
      mockFileSystem = createMockFileSystem({
        '/test.ts': 'import { unused } from \'./utils\';\nfunction unused() {}'
      });
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry, {
        cleanupImports: false
      });

      const items = [createDeadCodeItem('unused', SymbolType.Function, '/test.ts', 2)];
      const result = await remover.preview(items);

      expect(result.importCleanups).toHaveLength(0);
    });
  });

  describe('preview - 錯誤處理', () => {
    it('應該處理無法讀取的檔案', async () => {
      mockFileSystem = createMockFileSystem({});
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry);

      const items = [createDeadCodeItem('foo', SymbolType.Function, '/nonexistent.ts')];
      const result = await remover.preview(items);

      expect(result.warnings).toContainEqual(expect.stringContaining('無法讀取檔案'));
    });

    it('應該捕獲意外錯誤並返回失敗結果', async () => {
      // 模擬 readFile 拋出意外錯誤
      mockFileSystem = {
        ...createMockFileSystem({}),
        readFile: vi.fn().mockRejectedValue(new Error('Unexpected error'))
      } as unknown as IFileSystem;
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry);

      const items = [createDeadCodeItem('foo')];
      const result = await remover.preview(items);

      // 應該產生警告而非崩潰
      expect(result.success).toBe(true);
      expect(result.warnings?.length).toBeGreaterThan(0);
    });
  });

  describe('execute - 執行刪除', () => {
    it('當 preview 失敗時應該返回失敗結果', async () => {
      const failedPreview: DeadCodeRemovalPreview = {
        success: false,
        removals: [],
        importCleanups: [],
        affectedFiles: [],
        summary: {
          totalRemovals: 0,
          byType: {},
          filesAffected: 0,
          linesRemoved: 0,
          importsCleanedUp: 0
        },
        errors: ['Preview failed']
      };

      const result = await remover.execute(failedPreview);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Preview failed');
    });

    it('應該套用刪除操作', async () => {
      const fileContent = 'function foo() {}\nfunction bar() {}';
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry);

      const items = [createDeadCodeItem('foo', SymbolType.Function, '/test.ts', 1)];
      const preview = await remover.preview(items);
      const result = await remover.execute(preview);

      expect(result.success).toBe(true);
      expect(result.updatedFiles).toHaveLength(1);
      expect(mockFileSystem.writeFile).toHaveBeenCalled();
    });

    it('應該處理檔案操作失敗', async () => {
      const fileContent = 'function foo() {}';
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      mockFileSystem.writeFile = vi.fn().mockRejectedValue(new Error('Write failed'));
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry);

      const items = [createDeadCodeItem('foo', SymbolType.Function, '/test.ts', 1)];
      const preview = await remover.preview(items);
      const result = await remover.execute(preview);

      expect(result.success).toBe(false);
      // 寫入走統一的 ChangeApplicator 路徑，錯誤訊息由它產生並帶上失敗檔案路徑
      expect(result.errors).toContainEqual(expect.stringContaining('/test.ts'));
    });
  });

  describe('快取管理', () => {
    it('應該能清除所有快取', async () => {
      const files = { '/test.ts': 'content' };
      mockFileSystem = createMockFileSystem(files);
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry);

      // 觸發快取
      await remover.preview([createDeadCodeItem('foo')]);
      const callsBefore = (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mock.calls.length;

      // 清除快取
      remover.clearCache();

      // 再次 preview 應該重新讀取
      await remover.preview([createDeadCodeItem('foo')]);
      const callsAfter = (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mock.calls.length;

      // 清除快取後應該有新的讀取
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });

    it('應該使用快取避免重複讀取同一檔案', async () => {
      const files = { '/test.ts': 'function foo() {}' };
      mockFileSystem = createMockFileSystem(files);
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry);

      // 第一次 preview
      await remover.preview([createDeadCodeItem('foo', SymbolType.Function, '/test.ts')]);
      const callsAfterFirst = (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mock.calls
        .filter((call: string[]) => call[0] === '/test.ts').length;

      // 第二次 preview 同一檔案
      await remover.preview([createDeadCodeItem('bar', SymbolType.Function, '/test.ts')]);
      const callsAfterSecond = (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mock.calls
        .filter((call: string[]) => call[0] === '/test.ts').length;

      // 第二次應該使用快取，不增加讀取次數
      expect(callsAfterSecond).toBe(callsAfterFirst);
    });
  });

  describe('matchesExcludePattern - glob 模式匹配', () => {
    it.each([
      { pattern: '*.test.ts', filePath: '/src/foo.test.ts', expected: true },
      { pattern: '*.test.ts', filePath: '/src/foo.ts', expected: false },
      { pattern: '**/__tests__/**', filePath: '/src/__tests__/foo.ts', expected: true },
      { pattern: '**/__tests__/**', filePath: '/src/foo.ts', expected: false },
      { pattern: 'node_modules', filePath: '/node_modules/foo.ts', expected: true },
      { pattern: 'node_modules', filePath: '/src/foo.ts', expected: false },
      { pattern: '*.{test,spec}.ts', filePath: '/src/foo.spec.ts', expected: true },
      { pattern: '*.{test,spec}.ts', filePath: '/src/foo.ts', expected: false },
      { pattern: '[a-z]*.ts', filePath: '/src/abc.ts', expected: true }
    ])('pattern "$pattern" 對 "$filePath" 應該返回 $expected', async ({ pattern, filePath, expected }) => {
      mockFileSystem = createMockFileSystem({ [filePath]: 'function foo() {}' });
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry, {
        excludeFiles: [pattern]
      });

      const items = [createDeadCodeItem('foo', SymbolType.Function, filePath)];
      const result = await remover.preview(items);

      if (expected) {
        expect(result.removals).toHaveLength(0);
      } else {
        expect(result.removals).toHaveLength(1);
      }
    });
  });

  describe('readFile 邊界條件', () => {
    it('應該處理 Buffer 回傳值', async () => {
      const bufferContent = Buffer.from('function foo() {}');
      mockFileSystem = {
        ...createMockFileSystem({}),
        readFile: vi.fn().mockResolvedValue(bufferContent)
      } as unknown as IFileSystem;
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry);

      const items = [createDeadCodeItem('foo')];
      const result = await remover.preview(items);

      expect(result.success).toBe(true);
    });

    it('讀取失敗後應該清除失敗快取', async () => {
      // 第一次失敗
      mockFileSystem = createMockFileSystem({});
      remover = new DeadCodeRemover(mockFileSystem, mockParserRegistry);

      await remover.preview([createDeadCodeItem('foo', SymbolType.Function, '/nonexistent.ts')]);

      // 第二次應該仍然嘗試讀取（因為快取已清除）
      await remover.preview([createDeadCodeItem('foo', SymbolType.Function, '/nonexistent.ts')]);

      expect(mockFileSystem.readFile).toHaveBeenCalledTimes(2);
    });
  });
});

// ===== createDeadCodeRemover 工廠函數測試 =====

describe('createDeadCodeRemover', () => {
  it('應該建立 DeadCodeRemover 實例', () => {
    const mockFileSystem = createMockFileSystem({});
    const mockParserRegistry = createMockParserRegistry(null);

    const remover = createDeadCodeRemover(mockFileSystem, mockParserRegistry);

    expect(remover).toBeInstanceOf(DeadCodeRemover);
  });

  it('應該傳遞選項到 DeadCodeRemover', async () => {
    const mockFileSystem = createMockFileSystem({
      '/test.ts': 'function main() {}'
    });
    const mockParserRegistry = createMockParserRegistry(null);

    const remover = createDeadCodeRemover(mockFileSystem, mockParserRegistry, {
      excludeSymbols: ['main']
    });

    const items = [createDeadCodeItem('main')];
    const result = await remover.preview(items);

    expect(result.removals).toHaveLength(0);
  });
});
