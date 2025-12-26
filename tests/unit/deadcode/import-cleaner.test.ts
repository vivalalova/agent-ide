/**
 * ImportCleaner 單元測試
 * 測試 import 清理器的各種場景
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportCleaner } from '@core/deadcode/import-cleaner.js';
import { DeadCodeCacheService } from '@core/deadcode/shared-cache.js';
import type { RemovalOperation } from '@core/deadcode/types.js';
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
 * 建立 RemovalOperation
 */
function createRemovalOperation(
  filePath: string,
  symbolName: string,
  range = { start: { line: 5, column: 1, offset: 0 }, end: { line: 5, column: 20, offset: 19 } }
): RemovalOperation {
  return {
    filePath,
    range,
    originalCode: `function ${symbolName}() {}`,
    symbolName,
    symbolType: SymbolType.Function
  };
}

// ===== 測試 =====

describe('ImportCleaner', () => {
  let importCleaner: ImportCleaner;
  let mockFileSystem: IFileSystem;
  let mockParserRegistry: ParserRegistry;
  let mockParser: ParserPlugin;
  let cacheService: DeadCodeCacheService;

  beforeEach(() => {
    mockParser = createMockParser();
    mockParserRegistry = createMockParserRegistry(mockParser);
    mockFileSystem = createMockFileSystem({});
    cacheService = new DeadCodeCacheService();
    importCleaner = new ImportCleaner(mockFileSystem, mockParserRegistry, cacheService);
  });

  describe('analyzeImportCleanups - 基本功能', () => {
    it('應該返回空結果當沒有 removals', async () => {
      const result = await importCleaner.analyzeImportCleanups([]);

      expect(result.cleanups).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('應該在無法讀取檔案時產生警告', async () => {
      const removals = [createRemovalOperation('/nonexistent.ts', 'foo')];

      const result = await importCleaner.analyzeImportCleanups(removals);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('無法讀取檔案');
    });

    it('應該處理多個檔案', async () => {
      const files = {
        '/file1.ts': 'import { foo } from \'./utils\';\nfunction foo() {}',
        '/file2.ts': 'import { bar } from \'./utils\';\nfunction bar() {}'
      };
      mockFileSystem = createMockFileSystem(files);
      cacheService = new DeadCodeCacheService();
      importCleaner = new ImportCleaner(mockFileSystem, mockParserRegistry, cacheService);

      const removals = [
        createRemovalOperation('/file1.ts', 'foo'),
        createRemovalOperation('/file2.ts', 'bar')
      ];

      const result = await importCleaner.analyzeImportCleanups(removals);

      // 每個檔案都應該被處理
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('analyzeImportCleanups - 完整刪除', () => {
    it('當所有符號都未使用時應產生 delete cleanup', async () => {
      const fileContent = `import { unusedFunc } from './utils';
export function main() {}`;
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      cacheService = new DeadCodeCacheService();
      importCleaner = new ImportCleaner(mockFileSystem, mockParserRegistry, cacheService);

      const removals = [createRemovalOperation('/test.ts', 'unusedFunc')];

      // Mock Parser 的 getImportDeclarations
      mockParser.getImportDeclarations = vi.fn().mockReturnValue([{
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 38, offset: 37 } },
        moduleSpecifier: './utils',
        isTypeOnly: false,
        namedImports: [{ name: 'unusedFunc' }],
        rawStatement: 'import { unusedFunc } from \'./utils\';'
      }]);

      const result = await importCleaner.analyzeImportCleanups(removals);

      expect(result.cleanups).toHaveLength(1);
      expect(result.cleanups[0].cleanupType).toBe('delete');
      expect(result.cleanups[0].unusedSymbols).toContain('unusedFunc');
    });

    it('當 import 符號不在 removal 列表中時應跳過', async () => {
      const fileContent = `import { usedFunc } from './utils';
usedFunc();`;
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });
      cacheService = new DeadCodeCacheService();
      importCleaner = new ImportCleaner(mockFileSystem, mockParserRegistry, cacheService);

      // 刪除的符號不是 import 的符號
      const removals = [createRemovalOperation('/test.ts', 'otherFunc')];

      mockParser.getImportDeclarations = vi.fn().mockReturnValue([{
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 35, offset: 34 } },
        moduleSpecifier: './utils',
        isTypeOnly: false,
        namedImports: [{ name: 'usedFunc' }],
        rawStatement: 'import { usedFunc } from \'./utils\';'
      }]);

      const result = await importCleaner.analyzeImportCleanups(removals);

      expect(result.cleanups).toHaveLength(0);
    });
  });

  describe('analyzeImportCleanups - 部分清理', () => {
    it('當部分符號仍在使用時應產生 partial cleanup', async () => {
      const fileContent = `import { used, unused } from './utils';
used();
function unused() {}`;
      mockFileSystem = createMockFileSystem({ '/test.ts': fileContent });

      mockParser.getImportDeclarations = vi.fn().mockReturnValue([{
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 40, offset: 39 } },
        moduleSpecifier: './utils',
        isTypeOnly: false,
        namedImports: [{ name: 'used' }, { name: 'unused' }],
        rawStatement: 'import { used, unused } from \'./utils\';'
      }]);

      cacheService = new DeadCodeCacheService();
      importCleaner = new ImportCleaner(mockFileSystem, mockParserRegistry, cacheService);

      // Mock isImportStillUsed 在建立 instance 之後
      vi.spyOn(importCleaner as never, 'isImportStillUsed' as never)
        .mockImplementation(async (_: string, symbolName: string) => {
          return symbolName === 'used';
        });

      const removals = [
        createRemovalOperation('/test.ts', 'used'),
        createRemovalOperation('/test.ts', 'unused')
      ];

      const result = await importCleaner.analyzeImportCleanups(removals);

      expect(result.cleanups).toHaveLength(1);
      expect(result.cleanups[0].cleanupType).toBe('partial');
      expect(result.cleanups[0].newImport).toContain('used');
      expect(result.cleanups[0].newImport).not.toContain('unused');
    });
  });

  describe('generatePartialImport - 產生部分 import', () => {
    beforeEach(() => {
      mockFileSystem = createMockFileSystem({ '/test.ts': '' });
      cacheService = new DeadCodeCacheService();
      importCleaner = new ImportCleaner(mockFileSystem, mockParserRegistry, cacheService);
    });

    it('應該產生只有 named imports 的語句', () => {
      // 直接測試 generatePartialImport
      const stmt = {
        statement: 'import { a, b, c } from \'./utils\';',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 35, offset: 34 } },
        symbols: [
          { name: 'a' },
          { name: 'b' },
          { name: 'c' }
        ],
        hasDefault: false,
        isNamespace: false
      };

      // 使用 private 方法測試
      const result = (importCleaner as never)['generatePartialImport'](stmt, ['a', 'c']);

      expect(result).toBe('import { a, c } from \'./utils\';');
    });

    it('應該保留別名資訊', () => {
      const stmt = {
        statement: 'import { foo as bar, baz } from \'./utils\';',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 42, offset: 41 } },
        symbols: [
          { name: 'foo', alias: 'bar' },
          { name: 'baz' }
        ],
        hasDefault: false,
        isNamespace: false
      };

      const result = (importCleaner as never)['generatePartialImport'](stmt, ['bar']);

      expect(result).toBe('import { foo as bar } from \'./utils\';');
    });

    it('應該保留 default import', () => {
      const stmt = {
        statement: 'import React, { useState, useEffect } from \'react\';',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 50, offset: 49 } },
        symbols: [
          { name: 'React', isDefault: true },
          { name: 'useState' },
          { name: 'useEffect' }
        ],
        hasDefault: true,
        isNamespace: false
      };

      const result = (importCleaner as never)['generatePartialImport'](stmt, ['React', 'useState']);

      expect(result).toBe('import React, { useState } from \'react\';');
    });

    it('當只有 default import 保留時應產生簡化語句', () => {
      const stmt = {
        statement: 'import React, { useState } from \'react\';',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 40, offset: 39 } },
        symbols: [
          { name: 'React', isDefault: true },
          { name: 'useState' }
        ],
        hasDefault: true,
        isNamespace: false
      };

      const result = (importCleaner as never)['generatePartialImport'](stmt, ['React']);

      expect(result).toBe('import React from \'react\';');
    });

    it('應該對 namespace import 返回 null', () => {
      const stmt = {
        statement: 'import * as utils from \'./utils\';',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 33, offset: 32 } },
        symbols: [{ name: 'utils', isNamespace: true }],
        hasDefault: false,
        isNamespace: true
      };

      const result = (importCleaner as never)['generatePartialImport'](stmt, []);

      expect(result).toBeNull();
    });

    it('當沒有符號需要保留時應返回 null', () => {
      const stmt = {
        statement: 'import { a, b } from \'./utils\';',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 31, offset: 30 } },
        symbols: [{ name: 'a' }, { name: 'b' }],
        hasDefault: false,
        isNamespace: false
      };

      const result = (importCleaner as never)['generatePartialImport'](stmt, []);

      expect(result).toBeNull();
    });

    it('應該保留 type import 關鍵字', () => {
      const stmt = {
        statement: 'import type { User, Admin } from \'./types\';',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 43, offset: 42 } },
        symbols: [{ name: 'User' }, { name: 'Admin' }],
        hasDefault: false,
        isNamespace: false
      };

      const result = (importCleaner as never)['generatePartialImport'](stmt, ['User']);

      expect(result).toBe('import type { User } from \'./types\';');
    });

    it('當 from 路徑無法解析時應返回 null', () => {
      const stmt = {
        statement: 'import { a } invalid syntax',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 27, offset: 26 } },
        symbols: [{ name: 'a' }],
        hasDefault: false,
        isNamespace: false
      };

      const result = (importCleaner as never)['generatePartialImport'](stmt, ['a']);

      expect(result).toBeNull();
    });
  });

  describe('快取管理', () => {
    it('應該能清除快取', async () => {
      const files = { '/test.ts': 'content' };
      mockFileSystem = createMockFileSystem(files);
      cacheService = new DeadCodeCacheService();
      importCleaner = new ImportCleaner(mockFileSystem, mockParserRegistry, cacheService);

      // 讀取一次觸發快取
      await importCleaner.analyzeImportCleanups([createRemovalOperation('/test.ts', 'foo')]);

      // 清除快取（透過 cacheService）
      cacheService.clear();

      // 再次分析應該重新讀取
      await importCleaner.analyzeImportCleanups([createRemovalOperation('/test.ts', 'foo')]);

      // readFile 應該被呼叫兩次
      expect(mockFileSystem.readFile).toHaveBeenCalledTimes(2);
    });

    it('應該使用快取避免重複讀取', async () => {
      const files = { '/test.ts': 'content' };
      mockFileSystem = createMockFileSystem(files);
      cacheService = new DeadCodeCacheService();
      importCleaner = new ImportCleaner(mockFileSystem, mockParserRegistry, cacheService);

      // 讀取兩次
      await importCleaner.analyzeImportCleanups([createRemovalOperation('/test.ts', 'foo')]);
      await importCleaner.analyzeImportCleanups([createRemovalOperation('/test.ts', 'bar')]);

      // 應該只讀取一次
      expect(mockFileSystem.readFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('readFile 邊界條件', () => {
    it('應該處理 Buffer 回傳值', async () => {
      const bufferContent = Buffer.from('import { foo } from "./utils";');
      mockFileSystem = {
        ...createMockFileSystem({}),
        readFile: vi.fn().mockResolvedValue(bufferContent)
      } as unknown as IFileSystem;

      cacheService = new DeadCodeCacheService();
      importCleaner = new ImportCleaner(mockFileSystem, mockParserRegistry, cacheService);

      const removals = [createRemovalOperation('/test.ts', 'foo')];
      const result = await importCleaner.analyzeImportCleanups(removals);

      // 不應該有錯誤
      expect(result.warnings).toHaveLength(0);
    });

    it('應該處理讀取失敗並清除快取', async () => {
      mockFileSystem = createMockFileSystem({});
      cacheService = new DeadCodeCacheService();
      importCleaner = new ImportCleaner(mockFileSystem, mockParserRegistry, cacheService);

      const removals = [createRemovalOperation('/nonexistent.ts', 'foo')];
      const result = await importCleaner.analyzeImportCleanups(removals);

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

// ===== createImportCleaner 工廠函數測試 =====

describe('createImportCleaner', () => {
  it('應該建立 ImportCleaner 實例', async () => {
    const { createImportCleaner } = await import('@core/deadcode/import-cleaner.js');
    const mockFileSystem = createMockFileSystem({});
    const mockParserRegistry = createMockParserRegistry(null);
    const cacheService = new DeadCodeCacheService();

    const cleaner = createImportCleaner(mockFileSystem, mockParserRegistry, cacheService);

    expect(cleaner).toBeInstanceOf(ImportCleaner);
  });
});
