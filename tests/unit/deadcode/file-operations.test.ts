/**
 * FileOperationsHandler 單元測試
 * 測試檔案操作處理器的各種場景
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileOperationsHandler, createFileOperationsHandler, type FileOperation } from '@core/deadcode/file-operations.js';
import type { DeadCodeRemovalPreview, RemovalOperation, ImportCleanupOperation } from '@core/deadcode/types.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { Range } from '@shared/types/core.js';
import { SymbolType } from '@shared/types/symbol.js';

// ===== Mock 工具函數 =====

/**
 * 建立 mock 的 IFileSystem
 */
function createMockFileSystem(files: Record<string, string> = {}): IFileSystem {
  const fileContents = { ...files };
  return {
    readFile: vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath in fileContents) {
        return fileContents[filePath];
      }
      throw new Error(`File not found: ${filePath}`);
    }),
    writeFile: vi.fn().mockImplementation(async (filePath: string, content: string) => {
      fileContents[filePath] = content;
    }),
    appendFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    readDirectory: vi.fn().mockResolvedValue([]),
    deleteDirectory: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockImplementation(async (filePath: string) => filePath in fileContents),
    getStats: vi.fn().mockResolvedValue({ isFile: true, isDirectory: false, size: 0 }),
    isFile: vi.fn().mockResolvedValue(true),
    isDirectory: vi.fn().mockResolvedValue(false),
    copyFile: vi.fn().mockResolvedValue(undefined),
    moveFile: vi.fn().mockResolvedValue(undefined),
    glob: vi.fn().mockResolvedValue([])
  } as unknown as IFileSystem;
}

/**
 * 建立 Range
 */
function createRange(startLine: number, endLine: number, startColumn = 1, endColumn = 20): Range {
  return {
    start: { line: startLine, column: startColumn, offset: 0 },
    end: { line: endLine, column: endColumn, offset: 19 }
  };
}

/**
 * 建立 RemovalOperation
 */
function createRemovalOperation(
  filePath: string,
  symbolName: string,
  range: Range
): RemovalOperation {
  return {
    filePath,
    range,
    originalCode: `function ${symbolName}() {}`,
    symbolName,
    symbolType: SymbolType.Function
  };
}

/**
 * 建立 ImportCleanupOperation
 */
function createImportCleanup(
  filePath: string,
  range: Range,
  cleanupType: 'delete' | 'partial',
  newImport?: string
): ImportCleanupOperation {
  return {
    filePath,
    range,
    originalImport: "import { foo } from './utils';",
    unusedSymbols: ['foo'],
    cleanupType,
    newImport
  };
}

/**
 * 建立 Preview
 */
function createPreview(
  removals: RemovalOperation[] = [],
  importCleanups: ImportCleanupOperation[] = []
): DeadCodeRemovalPreview {
  return {
    success: true,
    removals,
    importCleanups,
    affectedFiles: [...new Set([...removals.map(r => r.filePath), ...importCleanups.map(c => c.filePath)])],
    summary: {
      totalRemovals: removals.length,
      byType: {},
      filesAffected: 0,
      linesRemoved: 0,
      importsCleanedUp: importCleanups.length
    }
  };
}

// ===== 測試 =====

describe('FileOperationsHandler', () => {
  let handler: FileOperationsHandler;
  let mockFileSystem: IFileSystem;

  beforeEach(() => {
    mockFileSystem = createMockFileSystem({});
    handler = new FileOperationsHandler(mockFileSystem);
  });

  describe('groupOperationsByFile', () => {
    it('應該按檔案分組操作', () => {
      const removals = [
        createRemovalOperation('/file1.ts', 'foo', createRange(1, 1)),
        createRemovalOperation('/file1.ts', 'bar', createRange(2, 2)),
        createRemovalOperation('/file2.ts', 'baz', createRange(1, 1))
      ];
      const preview = createPreview(removals);

      const result = handler.groupOperationsByFile(preview);

      expect(result.size).toBe(2);
      expect(result.get('/file1.ts')).toHaveLength(2);
      expect(result.get('/file2.ts')).toHaveLength(1);
    });

    it('應該去重相同 range 的操作', () => {
      const sameRange = createRange(1, 1);
      const removals = [
        createRemovalOperation('/file.ts', 'foo', sameRange),
        createRemovalOperation('/file.ts', 'bar', sameRange) // 相同 range
      ];
      const preview = createPreview(removals);

      const result = handler.groupOperationsByFile(preview);

      // 相同 range 只保留一個
      expect(result.get('/file.ts')).toHaveLength(1);
    });

    it('應該正確分類 import cleanup 操作', () => {
      const importCleanups = [
        createImportCleanup('/file.ts', createRange(1, 1), 'delete'),
        createImportCleanup('/file.ts', createRange(2, 2), 'partial', "import { bar } from './utils';")
      ];
      const preview = createPreview([], importCleanups);

      const result = handler.groupOperationsByFile(preview);

      expect(result.get('/file.ts')).toHaveLength(2);
      expect(result.get('/file.ts')![0].type).toBe('import-delete');
      expect(result.get('/file.ts')![1].type).toBe('import-partial');
    });

    it('應該混合處理 removals 和 import cleanups', () => {
      const removals = [createRemovalOperation('/file.ts', 'foo', createRange(3, 3))];
      const importCleanups = [createImportCleanup('/file.ts', createRange(1, 1), 'delete')];
      const preview = createPreview(removals, importCleanups);

      const result = handler.groupOperationsByFile(preview);

      expect(result.get('/file.ts')).toHaveLength(2);
    });
  });

  describe('applyFileOperations', () => {
    it('應該套用刪除操作', async () => {
      const fileContent = 'line1\nline2\nline3';
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      handler = new FileOperationsHandler(mockFileSystem);

      const operations: FileOperation[] = [
        { range: createRange(2, 2), type: 'removal' }
      ];

      const result = await handler.applyFileOperations('/test.ts', operations);

      expect(result.removedSymbols).toBe(1);
      expect(mockFileSystem.writeFile).toHaveBeenCalled();
    });

    it('應該套用 partial import cleanup', async () => {
      const fileContent = "import { foo, bar } from './utils';\nconst x = 1;";
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      handler = new FileOperationsHandler(mockFileSystem);

      const operations: FileOperation[] = [
        {
          range: createRange(1, 1),
          type: 'import-partial',
          newContent: "import { bar } from './utils';"
        }
      ];

      const result = await handler.applyFileOperations('/test.ts', operations);

      expect(result.cleanedImports).toBe(1);
      const writeCall = (mockFileSystem.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(writeCall[1]).toContain("import { bar } from './utils';");
    });

    it('應該從後往前排序操作避免位置偏移', async () => {
      const fileContent = 'line1\nline2\nline3\nline4';
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      handler = new FileOperationsHandler(mockFileSystem);

      // 故意以錯誤順序傳入
      const operations: FileOperation[] = [
        { range: createRange(2, 2), type: 'removal' },
        { range: createRange(4, 4), type: 'removal' }
      ];

      await handler.applyFileOperations('/test.ts', operations);

      // 應該先刪除 line4，再刪除 line2
      const writeCall = (mockFileSystem.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(writeCall[1]).toBe('line1\nline3');
    });

    it('應該清理連續空行', async () => {
      const fileContent = 'line1\n\n\n\nline5';
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      handler = new FileOperationsHandler(mockFileSystem);

      const operations: FileOperation[] = [];

      await handler.applyFileOperations('/test.ts', operations);

      const writeCall = (mockFileSystem.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
      // 連續空行應該被壓縮
      expect(writeCall[1]).toBe('line1\n\nline5');
    });

    it('應該保留原始縮排', async () => {
      const fileContent = "  import { foo } from './utils';\n  const x = 1;";
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      handler = new FileOperationsHandler(mockFileSystem);

      const operations: FileOperation[] = [
        {
          range: createRange(1, 1),
          type: 'import-partial',
          newContent: "import { bar } from './utils';"
        }
      ];

      await handler.applyFileOperations('/test.ts', operations);

      const writeCall = (mockFileSystem.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(writeCall[1]).toContain("  import { bar } from './utils';");
    });

    it('當檔案無法讀取時應拋出錯誤', async () => {
      mockFileSystem = createMockFileSystem({});
      handler = new FileOperationsHandler(mockFileSystem);

      const operations: FileOperation[] = [
        { range: createRange(1, 1), type: 'removal' }
      ];

      await expect(
        handler.applyFileOperations('/nonexistent.ts', operations)
      ).rejects.toThrow('無法讀取檔案');
    });

    it('應該處理邊界超出的 range', async () => {
      const fileContent = 'line1\nline2';
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      handler = new FileOperationsHandler(mockFileSystem);

      // range 超出檔案行數
      const operations: FileOperation[] = [
        { range: createRange(100, 100), type: 'removal' }
      ];

      // 不應拋出錯誤
      const result = await handler.applyFileOperations('/test.ts', operations);

      expect(result.removedSymbols).toBe(1);
    });

    it('應該處理 type 排序穩定性', async () => {
      const fileContent = 'line1\nline2\nline3';
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      handler = new FileOperationsHandler(mockFileSystem);

      // 相同位置不同類型
      const operations: FileOperation[] = [
        { range: createRange(2, 2, 1, 10), type: 'removal' },
        { range: createRange(2, 2, 1, 10), type: 'import-delete' }
      ];

      const result = await handler.applyFileOperations('/test.ts', operations);

      // 應該能處理而不崩潰
      expect(result).toBeDefined();
    });
  });

  describe('extractCode', () => {
    it('應該提取單行程式碼', () => {
      const content = 'function foo() { return 1; }';
      // column 是 1-based，substring 用 start.column-1 到 end.column-1
      // range(10, 26) 會取第 9-25 字元 (0-based)，即 'foo() { return 1;'
      const range = createRange(1, 1, 10, 26);

      const result = handler.extractCode(content, range);

      expect(result).toBe('foo() { return 1');
    });

    it('應該提取多行程式碼', () => {
      const content = 'line1\nline2\nline3\nline4';
      const range = createRange(2, 3, 1, 6);

      const result = handler.extractCode(content, range);

      expect(result).toBe('line2\nline3');
    });

    it('應該處理超出邊界的 range', () => {
      const content = 'line1\nline2';
      const range = createRange(100, 100, 1, 10);

      // 不應拋出錯誤
      const result = handler.extractCode(content, range);

      expect(typeof result).toBe('string');
    });

    it('應該處理空內容', () => {
      const content = '';
      const range = createRange(1, 1);

      const result = handler.extractCode(content, range);

      expect(result).toBe('');
    });
  });

  describe('calculateSummary', () => {
    it('應該計算正確的統計', () => {
      const removals: RemovalOperation[] = [
        createRemovalOperation('/file1.ts', 'foo', createRange(1, 3)),
        createRemovalOperation('/file1.ts', 'bar', createRange(5, 7)),
        createRemovalOperation('/file2.ts', 'baz', createRange(1, 2))
      ];
      const importCleanups: ImportCleanupOperation[] = [
        createImportCleanup('/file1.ts', createRange(10, 10), 'delete')
      ];

      const result = handler.calculateSummary(removals, importCleanups);

      expect(result.totalRemovals).toBe(3);
      expect(result.filesAffected).toBe(2);
      expect(result.importsCleanedUp).toBe(1);
      // 行數：(3-1+1) + (7-5+1) + (2-1+1) + (10-10+1) = 3 + 3 + 2 + 1 = 9
      expect(result.linesRemoved).toBe(9);
    });

    it('應該按類型統計', () => {
      const removals: RemovalOperation[] = [
        { ...createRemovalOperation('/f.ts', 'a', createRange(1, 1)), symbolType: SymbolType.Function },
        { ...createRemovalOperation('/f.ts', 'b', createRange(2, 2)), symbolType: SymbolType.Function },
        { ...createRemovalOperation('/f.ts', 'c', createRange(3, 3)), symbolType: SymbolType.Variable }
      ];

      const result = handler.calculateSummary(removals, []);

      expect(result.byType[SymbolType.Function]).toBe(2);
      expect(result.byType[SymbolType.Variable]).toBe(1);
    });

    it('應該處理空輸入', () => {
      const result = handler.calculateSummary([], []);

      expect(result.totalRemovals).toBe(0);
      expect(result.filesAffected).toBe(0);
      expect(result.linesRemoved).toBe(0);
      expect(result.importsCleanedUp).toBe(0);
    });
  });

  describe('collectAffectedFiles', () => {
    it('應該收集所有影響的檔案', () => {
      const removals = [
        createRemovalOperation('/file1.ts', 'foo', createRange(1, 1)),
        createRemovalOperation('/file2.ts', 'bar', createRange(1, 1))
      ];
      const importCleanups = [
        createImportCleanup('/file1.ts', createRange(2, 2), 'delete'),
        createImportCleanup('/file3.ts', createRange(1, 1), 'delete')
      ];

      const result = handler.collectAffectedFiles(removals, importCleanups);

      expect(result).toHaveLength(3);
      expect(result).toContain('/file1.ts');
      expect(result).toContain('/file2.ts');
      expect(result).toContain('/file3.ts');
    });

    it('應該去重', () => {
      const removals = [
        createRemovalOperation('/file.ts', 'foo', createRange(1, 1)),
        createRemovalOperation('/file.ts', 'bar', createRange(2, 2))
      ];

      const result = handler.collectAffectedFiles(removals, []);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('/file.ts');
    });

    it('應該處理空輸入', () => {
      const result = handler.collectAffectedFiles([], []);

      expect(result).toHaveLength(0);
    });
  });

  describe('快取管理', () => {
    it('應該使用快取避免重複讀取', async () => {
      const files = { '/test.ts': 'content' };
      mockFileSystem = createMockFileSystem(files);
      handler = new FileOperationsHandler(mockFileSystem);

      // 讀取兩次
      await handler.readFile('/test.ts');
      await handler.readFile('/test.ts');

      // 應該只讀取一次
      const testFileCalls = (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mock.calls
        .filter((call: string[]) => call[0] === '/test.ts').length;
      expect(testFileCalls).toBe(1);
    });

    it('應該能清除快取', async () => {
      const files = { '/test.ts': 'content' };
      mockFileSystem = createMockFileSystem(files);
      handler = new FileOperationsHandler(mockFileSystem);

      await handler.readFile('/test.ts');
      const callsBeforeClear = (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mock.calls
        .filter((call: string[]) => call[0] === '/test.ts').length;

      handler.clearCache();
      await handler.readFile('/test.ts');

      const callsAfterClear = (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mock.calls
        .filter((call: string[]) => call[0] === '/test.ts').length;

      expect(callsAfterClear).toBe(callsBeforeClear + 1);
    });

    it('寫入後應該更新快取', async () => {
      const files = { '/test.ts': 'old content' };
      mockFileSystem = createMockFileSystem(files);
      handler = new FileOperationsHandler(mockFileSystem);

      await handler.writeFile('/test.ts', 'new content');
      const content = await handler.readFile('/test.ts');

      // 應該從快取讀取新內容
      expect(content).toBe('new content');
      // 不應該呼叫 readFile（從快取讀取）
      const testFileCalls = (mockFileSystem.readFile as ReturnType<typeof vi.fn>).mock.calls
        .filter((call: string[]) => call[0] === '/test.ts').length;
      expect(testFileCalls).toBe(0);
    });
  });

  describe('readFile 邊界條件', () => {
    it('應該處理 Buffer 回傳值', async () => {
      const bufferContent = Buffer.from('file content');
      mockFileSystem = {
        ...createMockFileSystem({}),
        readFile: vi.fn().mockResolvedValue(bufferContent)
      } as unknown as IFileSystem;
      handler = new FileOperationsHandler(mockFileSystem);

      const content = await handler.readFile('/test.ts');

      expect(content).toBe('file content');
    });

    it('讀取失敗應返回 null 並清除快取', async () => {
      mockFileSystem = createMockFileSystem({});
      handler = new FileOperationsHandler(mockFileSystem);

      const content = await handler.readFile('/nonexistent.ts');

      expect(content).toBeNull();
    });
  });

  describe('cleanupEmptyLines', () => {
    it('應該壓縮連續空行', async () => {
      const fileContent = 'line1\n\n\n\nline5';
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      handler = new FileOperationsHandler(mockFileSystem);

      await handler.applyFileOperations('/test.ts', []);

      const writeCall = (mockFileSystem.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(writeCall[1]).toBe('line1\n\nline5');
    });

    it('應該保留單個空行', async () => {
      const fileContent = 'line1\n\nline3';
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      handler = new FileOperationsHandler(mockFileSystem);

      await handler.applyFileOperations('/test.ts', []);

      const writeCall = (mockFileSystem.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(writeCall[1]).toBe('line1\n\nline3');
    });

    it('應該處理全空白行', async () => {
      const fileContent = 'line1\n   \n   \nline4';
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      handler = new FileOperationsHandler(mockFileSystem);

      await handler.applyFileOperations('/test.ts', []);

      const writeCall = (mockFileSystem.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
      // 連續的空白行也應該被壓縮
      expect(writeCall[1]).toBe('line1\n   \nline4');
    });
  });
});

// ===== createFileOperationsHandler 工廠函數測試 =====

describe('createFileOperationsHandler', () => {
  it('應該建立 FileOperationsHandler 實例', () => {
    const mockFileSystem = createMockFileSystem({});

    const handler = createFileOperationsHandler(mockFileSystem);

    expect(handler).toBeInstanceOf(FileOperationsHandler);
  });
});
