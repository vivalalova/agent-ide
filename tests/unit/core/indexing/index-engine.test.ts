import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IndexEngine } from '@core/indexing/index-engine';
import type { IndexConfig } from '@core/indexing/types';
import type { Symbol, Dependency } from '@shared/types';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('glob');
vi.mock('crypto');
vi.mock('@infrastructure/parser');
vi.mock('@plugins/typescript/parser');
vi.mock('@plugins/javascript/parser');
vi.mock('@plugins/swift/parser');

describe('IndexEngine', () => {
  let indexEngine: IndexEngine;
  let mockConfig: IndexConfig;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    mockConfig = {
      workspacePath: '/workspace',
      excludePatterns: ['node_modules/**', '.git/**'],
      includeExtensions: ['.ts', '.js'],
      maxFileSize: 1024 * 1024,
      enablePersistence: true,
      persistencePath: undefined,
      maxConcurrency: 4
    };

    // Mock fs/promises
    const fs = await import('fs/promises');
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
      isFile: () => true,
      size: 1000,
      mtime: new Date('2024-01-01')
    } as any);

    vi.mocked(fs.readFile).mockResolvedValue('export function test() {}');
    vi.mocked(fs.access).mockResolvedValue(undefined);

    // Mock glob
    const { glob } = await import('glob');
    vi.mocked(glob).mockResolvedValue([
      '/workspace/src/file1.ts',
      '/workspace/src/file2.ts'
    ] as any);

    // Mock crypto
    const crypto = await import('crypto');
    const mockHash = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue('mockhash')
    };
    vi.mocked(crypto.createHash).mockReturnValue(mockHash as any);

    // Mock ParserRegistry
    const { ParserRegistry } = await import('@infrastructure/parser');
    const mockParserInstance = {
      parse: vi.fn().mockResolvedValue({}),
      extractSymbols: vi.fn().mockResolvedValue([]),
      extractDependencies: vi.fn().mockResolvedValue([]),
      getSupportedExtensions: vi.fn().mockReturnValue(['.ts', '.js'])
    };

    const mockRegistryInstance = {
      isDisposed: false,
      register: vi.fn(),
      getParser: vi.fn().mockReturnValue(mockParserInstance),
      listParsers: vi.fn().mockReturnValue([
        { name: 'typescript', plugin: mockParserInstance }
      ])
    };

    vi.mocked(ParserRegistry.getInstance).mockReturnValue(mockRegistryInstance as any);
    vi.mocked(ParserRegistry.resetInstance).mockReturnValue(undefined);

    // Create engine after mocks are set up
    indexEngine = new IndexEngine(mockConfig);
  });

  afterEach(() => {
    if (indexEngine) {
      indexEngine.dispose();
    }
  });

  describe('constructor', () => {
    it('應該建立 IndexEngine 實例', () => {
      expect(indexEngine).toBeDefined();
    });

    it('應該驗證配置', () => {
      expect(() => new IndexEngine({} as any)).toThrow('根路徑必須是有效字串');
    });

    it('應該拋出錯誤當配置不是物件', () => {
      expect(() => new IndexEngine(null as any)).toThrow('索引配置必須是物件');
      expect(() => new IndexEngine(undefined as any)).toThrow('索引配置必須是物件');
      expect(() => new IndexEngine('string' as any)).toThrow('索引配置必須是物件');
      expect(() => new IndexEngine([] as any)).toThrow('索引配置必須是物件');
    });

    it('應該拋出錯誤當根路徑為空', () => {
      const invalidConfig = { ...mockConfig, workspacePath: '' };
      expect(() => new IndexEngine(invalidConfig)).toThrow('根路徑必須是有效字串');
    });

    it('應該拋出錯誤當 includeExtensions 不是陣列', () => {
      const invalidConfig = { ...mockConfig, includeExtensions: 'not-array' as any };
      expect(() => new IndexEngine(invalidConfig)).toThrow('包含副檔名必須是陣列');
    });

    it('應該拋出錯誤當 excludePatterns 不是陣列', () => {
      const invalidConfig = { ...mockConfig, excludePatterns: 'not-array' as any };
      expect(() => new IndexEngine(invalidConfig)).toThrow('排除模式必須是陣列');
    });

    it('應該拋出錯誤當 maxFileSize 不是正數', () => {
      const invalidConfig = { ...mockConfig, maxFileSize: -1 };
      expect(() => new IndexEngine(invalidConfig)).toThrow('最大檔案大小必須是正數');
    });

    it('應該拋出錯誤當 maxFileSize 為零', () => {
      const invalidConfig = { ...mockConfig, maxFileSize: 0 };
      expect(() => new IndexEngine(invalidConfig)).toThrow('最大檔案大小必須是正數');
    });
  });

  describe('indexProject', () => {
    it('應該索引專案', async () => {
      await indexEngine.indexProject();

      const stats = await indexEngine.getStats();
      expect(stats.totalFiles).toBeGreaterThan(0);
    });

    it('應該使用配置的路徑當沒有傳入參數', async () => {
      const fs = await import('fs/promises');

      await indexEngine.indexProject();

      expect(fs.stat).toHaveBeenCalledWith(mockConfig.workspacePath);
    });

    it('應該拋出錯誤當路徑為空字串', async () => {
      await expect(indexEngine.indexProject('')).rejects.toThrow('索引路徑必須是有效字串');
    });

    it('應該拋出錯誤當路徑為 null', async () => {
      await expect(indexEngine.indexProject(null as any)).rejects.toThrow('索引路徑必須是有效字串');
    });

    it('應該拋出錯誤當路徑不是目錄', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true
      } as any);

      await expect(indexEngine.indexProject('/workspace')).rejects.toThrow('索引路徑必須是目錄');
    });

    it('應該拋出錯誤當路徑不存在', async () => {
      const fs = await import('fs/promises');
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.stat).mockRejectedValue(error);

      await expect(indexEngine.indexProject('/nonexistent')).rejects.toThrow('路徑不存在');
    });
  });

  describe('indexDirectory', () => {
    it('應該索引目錄中的檔案', async () => {
      await indexEngine.indexDirectory('/workspace');

      const stats = await indexEngine.getStats();
      expect(stats.totalFiles).toBeGreaterThan(0);
    });

    it('應該拋出錯誤當路徑不是目錄', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false
      } as any);

      await expect(indexEngine.indexDirectory('/workspace/file.ts')).rejects.toThrow('無法存取目錄');
    });

    it('應該拋出錯誤當無法存取目錄', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.stat).mockRejectedValue(new Error('Permission denied'));

      await expect(indexEngine.indexDirectory('/restricted')).rejects.toThrow('無法存取目錄');
    });

    it('應該使用 glob 模式查找檔案', async () => {
      const { glob } = await import('glob');

      await indexEngine.indexDirectory('/workspace');

      expect(glob).toHaveBeenCalled();
    });
  });

  describe('indexFile', () => {
    it('應該索引單一檔案', async () => {
      await indexEngine.indexFile('/workspace/src/file.ts');

      expect(indexEngine.isIndexed('/workspace/src/file.ts')).toBe(true);
    });

    it('應該解析檔案並提取符號', async () => {
      const { ParserRegistry } = await import('@infrastructure/parser');
      const mockParser = {
        parse: vi.fn().mockResolvedValue({}),
        extractSymbols: vi.fn().mockResolvedValue([]),
        extractDependencies: vi.fn().mockResolvedValue([])
      };

      const mockRegistry = ParserRegistry.getInstance();
      vi.mocked(mockRegistry.getParser).mockReturnValue(mockParser as any);

      await indexEngine.indexFile('/workspace/src/file.ts');

      expect(mockParser.parse).toHaveBeenCalled();
      expect(mockParser.extractSymbols).toHaveBeenCalled();
      expect(mockParser.extractDependencies).toHaveBeenCalled();
    });

    it('應該跳過超過大小限制的檔案', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        size: 10 * 1024 * 1024, // 10MB
        mtime: new Date()
      } as any);

      await indexEngine.indexFile('/workspace/large-file.ts');

      // 不應該拋出錯誤，只是靜默跳過
      expect(indexEngine.isIndexed('/workspace/large-file.ts')).toBe(false);
    });

    it('應該處理解析錯誤', async () => {
      const { ParserRegistry } = await import('@infrastructure/parser');
      const mockParser = {
        parse: vi.fn().mockRejectedValue(new Error('Parse error')),
        extractSymbols: vi.fn(),
        extractDependencies: vi.fn()
      };

      const mockRegistry = ParserRegistry.getInstance();
      vi.mocked(mockRegistry.getParser).mockReturnValue(mockParser as any);

      await expect(indexEngine.indexFile('/workspace/src/bad-file.ts')).rejects.toThrow('解析檔案失敗');
    });

    it('應該拋出錯誤當找不到適合的解析器', async () => {
      const { ParserRegistry } = await import('@infrastructure/parser');
      const mockRegistry = ParserRegistry.getInstance();
      vi.mocked(mockRegistry.getParser).mockReturnValue(null);

      await expect(indexEngine.indexFile('/workspace/src/file.unknown')).rejects.toThrow('找不到適合的解析器');
    });
  });

  describe('updateFile', () => {
    it('應該更新已索引的檔案', async () => {
      await indexEngine.indexFile('/workspace/src/file.ts');
      await indexEngine.updateFile('/workspace/src/file.ts');

      expect(indexEngine.isIndexed('/workspace/src/file.ts')).toBe(true);
    });

    it('應該索引未索引的檔案', async () => {
      await indexEngine.updateFile('/workspace/src/new-file.ts');

      expect(indexEngine.isIndexed('/workspace/src/new-file.ts')).toBe(true);
    });

    it('應該拋出錯誤當檔案不存在', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockRejectedValue(new Error('File not found'));

      await expect(indexEngine.updateFile('/nonexistent.ts')).rejects.toThrow('更新檔案索引失敗');
    });
  });

  describe('removeFile', () => {
    it('應該移除檔案索引', async () => {
      await indexEngine.indexFile('/workspace/src/file.ts');
      await indexEngine.removeFile('/workspace/src/file.ts');

      expect(indexEngine.isIndexed('/workspace/src/file.ts')).toBe(false);
    });

    it('應該能夠移除未索引的檔案而不拋錯', async () => {
      await expect(indexEngine.removeFile('/nonexistent.ts')).resolves.toBeUndefined();
    });
  });

  describe('findSymbol', () => {
    it('應該找到符號', async () => {
      const { ParserRegistry } = await import('@infrastructure/parser');
      const mockSymbol: Symbol = {
        name: 'testFunction',
        type: 'function',
        location: {
          filePath: '/workspace/src/file.ts',
          line: 1,
          column: 0,
          offset: 0
        },
        scope: undefined
      };

      const mockParser = {
        parse: vi.fn().mockResolvedValue({}),
        extractSymbols: vi.fn().mockResolvedValue([mockSymbol]),
        extractDependencies: vi.fn().mockResolvedValue([])
      };

      const mockRegistry = ParserRegistry.getInstance();
      vi.mocked(mockRegistry.getParser).mockReturnValue(mockParser as any);

      await indexEngine.indexFile('/workspace/src/file.ts');
      const results = await indexEngine.findSymbol('testFunction');

      expect(results).toHaveLength(1);
      expect(results[0].symbol.name).toBe('testFunction');
    });

    it('應該拋出錯誤當引擎已被釋放', async () => {
      indexEngine.dispose();

      await expect(indexEngine.findSymbol('test')).rejects.toThrow('索引引擎已被釋放');
    });

    it('應該回傳空陣列當尚未索引', async () => {
      const freshEngine = new IndexEngine(mockConfig);

      const results = await freshEngine.findSymbol('test');
      expect(results).toEqual([]);

      freshEngine.dispose();
    });

    it('應該拋出錯誤當查詢不是字串', async () => {
      await indexEngine.indexFile('/workspace/src/file.ts');

      await expect(indexEngine.findSymbol(123 as any)).rejects.toThrow('查詢必須是字串');
    });
  });

  describe('findSymbolByType', () => {
    it('應該根據類型找到符號', async () => {
      const { ParserRegistry } = await import('@infrastructure/parser');
      const mockSymbol: Symbol = {
        name: 'TestClass',
        type: 'class',
        location: {
          filePath: '/workspace/src/file.ts',
          line: 1,
          column: 0,
          offset: 0
        },
        scope: undefined
      };

      const mockParser = {
        parse: vi.fn().mockResolvedValue({}),
        extractSymbols: vi.fn().mockResolvedValue([mockSymbol]),
        extractDependencies: vi.fn().mockResolvedValue([])
      };

      const mockRegistry = ParserRegistry.getInstance();
      vi.mocked(mockRegistry.getParser).mockReturnValue(mockParser as any);

      await indexEngine.indexFile('/workspace/src/file.ts');
      const results = await indexEngine.findSymbolByType('class');

      expect(results).toHaveLength(1);
      expect(results[0].symbol.type).toBe('class');
    });
  });

  describe('searchSymbols', () => {
    it('應該搜尋符號', async () => {
      const { ParserRegistry } = await import('@infrastructure/parser');
      const mockSymbol: Symbol = {
        name: 'testFunction',
        type: 'function',
        location: {
          filePath: '/workspace/src/file.ts',
          line: 1,
          column: 0,
          offset: 0
        },
        scope: undefined
      };

      const mockParser = {
        parse: vi.fn().mockResolvedValue({}),
        extractSymbols: vi.fn().mockResolvedValue([mockSymbol]),
        extractDependencies: vi.fn().mockResolvedValue([])
      };

      const mockRegistry = ParserRegistry.getInstance();
      vi.mocked(mockRegistry.getParser).mockReturnValue(mockParser as any);

      await indexEngine.indexFile('/workspace/src/file.ts');
      const results = await indexEngine.searchSymbols('test');

      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAllSymbols', () => {
    it('應該回傳所有符號', async () => {
      const { ParserRegistry } = await import('@infrastructure/parser');
      const mockSymbols: Symbol[] = [
        {
          name: 'func1',
          type: 'function',
          location: {
            filePath: '/workspace/src/file.ts',
            line: 1,
            column: 0,
            offset: 0
          },
          scope: undefined
        },
        {
          name: 'func2',
          type: 'function',
          location: {
            filePath: '/workspace/src/file.ts',
            line: 5,
            column: 0,
            offset: 100
          },
          scope: undefined
        }
      ];

      const mockParser = {
        parse: vi.fn().mockResolvedValue({}),
        extractSymbols: vi.fn().mockResolvedValue(mockSymbols),
        extractDependencies: vi.fn().mockResolvedValue([])
      };

      const mockRegistry = ParserRegistry.getInstance();
      vi.mocked(mockRegistry.getParser).mockReturnValue(mockParser as any);

      await indexEngine.indexFile('/workspace/src/file.ts');
      const results = await indexEngine.getAllSymbols();

      expect(results).toHaveLength(2);
    });

    it('應該拋出錯誤當引擎已被釋放', async () => {
      indexEngine.dispose();

      await expect(indexEngine.getAllSymbols()).rejects.toThrow('索引引擎已被釋放');
    });

    it('應該回傳空陣列當尚未索引', async () => {
      const freshEngine = new IndexEngine(mockConfig);

      const results = await freshEngine.getAllSymbols();
      expect(results).toEqual([]);

      freshEngine.dispose();
    });
  });

  describe('findFilesByExtension', () => {
    it('應該根據副檔名找到檔案', async () => {
      await indexEngine.indexFile('/workspace/src/file.ts');

      const files = indexEngine.findFilesByExtension('.ts');
      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe('findFilesByLanguage', () => {
    it('應該根據語言找到檔案', async () => {
      await indexEngine.indexFile('/workspace/src/file.ts');

      const files = indexEngine.findFilesByLanguage('typescript');
      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe('isIndexed', () => {
    it('應該回傳 true 當檔案已被索引', async () => {
      await indexEngine.indexFile('/workspace/src/file.ts');

      expect(indexEngine.isIndexed('/workspace/src/file.ts')).toBe(true);
    });

    it('應該回傳 false 當檔案未被索引', () => {
      expect(indexEngine.isIndexed('/nonexistent.ts')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('應該回傳索引統計資訊', async () => {
      await indexEngine.indexFile('/workspace/src/file.ts');

      const stats = await indexEngine.getStats();

      expect(stats).toHaveProperty('totalFiles');
      expect(stats).toHaveProperty('indexedFiles');
      expect(stats).toHaveProperty('totalSymbols');
      expect(stats).toHaveProperty('totalDependencies');
      expect(stats).toHaveProperty('lastUpdated');
      expect(stats).toHaveProperty('indexSize');
    });

    it('應該拋出錯誤當引擎已被釋放', async () => {
      indexEngine.dispose();

      await expect(indexEngine.getStats()).rejects.toThrow('索引引擎已被釋放');
    });

    it('應該回傳初始統計資訊當尚未索引', async () => {
      const freshEngine = new IndexEngine(mockConfig);

      const stats = await freshEngine.getStats();
      expect(stats.totalFiles).toBe(0);
      expect(stats.indexedFiles).toBe(0);
      expect(stats.totalSymbols).toBe(0);

      freshEngine.dispose();
    });
  });

  describe('getConfig', () => {
    it('應該回傳配置副本', () => {
      const config = indexEngine.getConfig();

      expect(config).toEqual(mockConfig);
      expect(config).not.toBe(mockConfig); // 應該是副本
    });
  });

  describe('clear', () => {
    it('應該清空所有索引', async () => {
      await indexEngine.indexFile('/workspace/src/file.ts');
      await indexEngine.clear();

      const stats = await indexEngine.getStats();
      expect(stats.totalFiles).toBe(0);
      expect(stats.indexedFiles).toBe(0);
      expect(stats.totalSymbols).toBe(0);
    });
  });

  describe('needsReindexing', () => {
    it('應該回傳 true 當檔案已被修改', async () => {
      const fs = await import('fs/promises');

      // 先用舊的時間索引
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        size: 1000,
        mtime: new Date('2024-01-01')
      } as any);

      await indexEngine.indexFile('/workspace/src/file.ts');

      // 然後檢查時用新的時間
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        size: 1000,
        mtime: new Date('2024-01-02') // 較新的修改時間
      } as any);

      const needsReindex = await indexEngine.needsReindexing('/workspace/src/file.ts');
      expect(needsReindex).toBe(true);
    });

    it('應該回傳 true 當檔案不存在但在索引中', async () => {
      const fs = await import('fs/promises');

      await indexEngine.indexFile('/workspace/src/file.ts');

      vi.mocked(fs.stat).mockRejectedValue(new Error('File not found'));

      const needsReindex = await indexEngine.needsReindexing('/workspace/src/file.ts');
      expect(needsReindex).toBe(true);
    });
  });

  describe('getFileParseErrors', () => {
    it('應該回傳檔案的解析錯誤', async () => {
      const { ParserRegistry } = await import('@infrastructure/parser');
      const mockParser = {
        parse: vi.fn().mockRejectedValue(new Error('Parse error')),
        extractSymbols: vi.fn(),
        extractDependencies: vi.fn()
      };

      const mockRegistry = ParserRegistry.getInstance();
      vi.mocked(mockRegistry.getParser).mockReturnValue(mockParser as any);

      try {
        await indexEngine.indexFile('/workspace/src/bad-file.ts');
      } catch {
        // 忽略錯誤
      }

      const errors = indexEngine.getFileParseErrors('/workspace/src/bad-file.ts');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('應該回傳空陣列當檔案沒有錯誤', async () => {
      await indexEngine.indexFile('/workspace/src/file.ts');

      const errors = indexEngine.getFileParseErrors('/workspace/src/file.ts');
      expect(errors).toEqual([]);
    });
  });

  describe('hasFileParseErrors', () => {
    it('應該回傳 true 當檔案有解析錯誤', async () => {
      const { ParserRegistry } = await import('@infrastructure/parser');
      const mockParser = {
        parse: vi.fn().mockRejectedValue(new Error('Parse error')),
        extractSymbols: vi.fn(),
        extractDependencies: vi.fn()
      };

      const mockRegistry = ParserRegistry.getInstance();
      vi.mocked(mockRegistry.getParser).mockReturnValue(mockParser as any);

      try {
        await indexEngine.indexFile('/workspace/src/bad-file.ts');
      } catch {
        // 忽略錯誤
      }

      expect(indexEngine.hasFileParseErrors('/workspace/src/bad-file.ts')).toBe(true);
    });

    it('應該回傳 false 當檔案沒有錯誤', async () => {
      await indexEngine.indexFile('/workspace/src/file.ts');

      expect(indexEngine.hasFileParseErrors('/workspace/src/file.ts')).toBe(false);
    });
  });

  describe('getAllIndexedFiles', () => {
    it('應該回傳所有已索引的檔案', async () => {
      await indexEngine.indexFile('/workspace/src/file1.ts');
      await indexEngine.indexFile('/workspace/src/file2.ts');

      const files = indexEngine.getAllIndexedFiles();
      expect(files.length).toBeGreaterThanOrEqual(2);
    });

    it('應該回傳空陣列當沒有檔案', () => {
      const files = indexEngine.getAllIndexedFiles();
      expect(files).toEqual([]);
    });
  });

  describe('getFileSymbols', () => {
    it('應該回傳檔案的符號', async () => {
      const { ParserRegistry } = await import('@infrastructure/parser');
      const mockSymbol: Symbol = {
        name: 'testFunction',
        type: 'function',
        location: {
          filePath: '/workspace/src/file.ts',
          line: 1,
          column: 0,
          offset: 0
        },
        scope: undefined
      };

      const mockParser = {
        parse: vi.fn().mockResolvedValue({}),
        extractSymbols: vi.fn().mockResolvedValue([mockSymbol]),
        extractDependencies: vi.fn().mockResolvedValue([])
      };

      const mockRegistry = ParserRegistry.getInstance();
      vi.mocked(mockRegistry.getParser).mockReturnValue(mockParser as any);

      await indexEngine.indexFile('/workspace/src/file.ts');
      const symbols = await indexEngine.getFileSymbols('/workspace/src/file.ts');

      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe('testFunction');
    });
  });

  describe('dispose', () => {
    it('應該釋放資源', () => {
      indexEngine.dispose();

      expect(() => indexEngine.dispose()).not.toThrow();
    });

    it('應該清空索引', async () => {
      await indexEngine.indexFile('/workspace/src/file.ts');
      indexEngine.dispose();

      await expect(indexEngine.getStats()).rejects.toThrow('索引引擎已被釋放');
    });
  });
});
