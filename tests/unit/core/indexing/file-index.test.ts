import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileIndex } from '@core/indexing/file-index';
import type { FileInfo, IndexConfig } from '@core/indexing/types';
import type { Symbol, Dependency } from '@shared/types';

describe('FileIndex', () => {
  let fileIndex: FileIndex;
  let mockConfig: IndexConfig;
  let mockFileInfo: FileInfo;

  beforeEach(() => {
    mockConfig = {
      workspacePath: '/workspace',
      excludePatterns: ['node_modules/**', '.git/**'],
      includeExtensions: ['.ts', '.js'],
      maxFileSize: 1024 * 1024,
      enablePersistence: true,
      persistencePath: undefined,
      maxConcurrency: 4
    };

    mockFileInfo = {
      filePath: '/workspace/src/file.ts',
      lastModified: new Date('2024-01-01'),
      size: 1000,
      extension: '.ts',
      language: 'typescript',
      checksum: 'abc123'
    };

    fileIndex = new FileIndex(mockConfig);
  });

  describe('addFile', () => {
    it('應該新增檔案到索引', async () => {
      await fileIndex.addFile(mockFileInfo);

      expect(fileIndex.hasFile(mockFileInfo.filePath)).toBe(true);
    });

    it('應該初始化檔案為未索引狀態', async () => {
      await fileIndex.addFile(mockFileInfo);

      expect(fileIndex.isFileIndexed(mockFileInfo.filePath)).toBe(false);
    });

    it('應該能夠新增多個檔案', async () => {
      const fileInfo2 = { ...mockFileInfo, filePath: '/workspace/src/file2.ts' };

      await fileIndex.addFile(mockFileInfo);
      await fileIndex.addFile(fileInfo2);

      expect(fileIndex.hasFile(mockFileInfo.filePath)).toBe(true);
      expect(fileIndex.hasFile(fileInfo2.filePath)).toBe(true);
      expect(fileIndex.getTotalFiles()).toBe(2);
    });
  });

  describe('removeFile', () => {
    it('應該移除檔案從索引', async () => {
      await fileIndex.addFile(mockFileInfo);
      await fileIndex.removeFile(mockFileInfo.filePath);

      expect(fileIndex.hasFile(mockFileInfo.filePath)).toBe(false);
    });

    it('應該能夠移除不存在的檔案而不拋錯', async () => {
      await expect(fileIndex.removeFile('/nonexistent.ts')).resolves.toBeUndefined();
    });

    it('應該更新檔案總數', async () => {
      await fileIndex.addFile(mockFileInfo);
      expect(fileIndex.getTotalFiles()).toBe(1);

      await fileIndex.removeFile(mockFileInfo.filePath);
      expect(fileIndex.getTotalFiles()).toBe(0);
    });
  });

  describe('hasFile', () => {
    it('應該回傳 true 當檔案存在', async () => {
      await fileIndex.addFile(mockFileInfo);
      expect(fileIndex.hasFile(mockFileInfo.filePath)).toBe(true);
    });

    it('應該回傳 false 當檔案不存在', () => {
      expect(fileIndex.hasFile('/nonexistent.ts')).toBe(false);
    });
  });

  describe('isFileIndexed', () => {
    it('應該回傳 false 當檔案未被索引', async () => {
      await fileIndex.addFile(mockFileInfo);
      expect(fileIndex.isFileIndexed(mockFileInfo.filePath)).toBe(false);
    });

    it('應該回傳 true 當檔案已被索引', async () => {
      await fileIndex.addFile(mockFileInfo);
      await fileIndex.setFileSymbols(mockFileInfo.filePath, []);

      expect(fileIndex.isFileIndexed(mockFileInfo.filePath)).toBe(true);
    });

    it('應該回傳 false 當檔案不存在', () => {
      expect(fileIndex.isFileIndexed('/nonexistent.ts')).toBe(false);
    });
  });

  describe('getFileInfo', () => {
    it('應該回傳檔案資訊', async () => {
      await fileIndex.addFile(mockFileInfo);
      const fileInfo = fileIndex.getFileInfo(mockFileInfo.filePath);

      expect(fileInfo).toEqual(mockFileInfo);
    });

    it('應該回傳 null 當檔案不存在', () => {
      const fileInfo = fileIndex.getFileInfo('/nonexistent.ts');
      expect(fileInfo).toBeNull();
    });
  });

  describe('setFileSymbols', () => {
    it('應該設定檔案的符號', async () => {
      const symbols: Symbol[] = [
        {
          name: 'testFunction',
          type: 'function',
          location: {
            filePath: mockFileInfo.filePath,
            line: 1,
            column: 0,
            offset: 0
          },
          scope: undefined
        }
      ];

      await fileIndex.addFile(mockFileInfo);
      await fileIndex.setFileSymbols(mockFileInfo.filePath, symbols);

      const retrievedSymbols = fileIndex.getFileSymbols(mockFileInfo.filePath);
      expect(retrievedSymbols).toEqual(symbols);
    });

    it('應該標記檔案為已索引', async () => {
      await fileIndex.addFile(mockFileInfo);
      await fileIndex.setFileSymbols(mockFileInfo.filePath, []);

      expect(fileIndex.isFileIndexed(mockFileInfo.filePath)).toBe(true);
    });

    it('應該拋出錯誤當檔案不存在於索引中', async () => {
      await expect(
        fileIndex.setFileSymbols('/nonexistent.ts', [])
      ).rejects.toThrow('檔案不存在於索引中');
    });

    it('應該能夠更新已存在的符號', async () => {
      const symbols1: Symbol[] = [
        {
          name: 'function1',
          type: 'function',
          location: {
            filePath: mockFileInfo.filePath,
            line: 1,
            column: 0,
            offset: 0
          },
          scope: undefined
        }
      ];

      const symbols2: Symbol[] = [
        {
          name: 'function2',
          type: 'function',
          location: {
            filePath: mockFileInfo.filePath,
            line: 5,
            column: 0,
            offset: 100
          },
          scope: undefined
        }
      ];

      await fileIndex.addFile(mockFileInfo);
      await fileIndex.setFileSymbols(mockFileInfo.filePath, symbols1);
      await fileIndex.setFileSymbols(mockFileInfo.filePath, symbols2);

      const retrievedSymbols = fileIndex.getFileSymbols(mockFileInfo.filePath);
      expect(retrievedSymbols).toEqual(symbols2);
    });
  });

  describe('getFileSymbols', () => {
    it('應該回傳空陣列當檔案不存在', () => {
      const symbols = fileIndex.getFileSymbols('/nonexistent.ts');
      expect(symbols).toEqual([]);
    });

    it('應該回傳空陣列當檔案未設定符號', async () => {
      await fileIndex.addFile(mockFileInfo);
      const symbols = fileIndex.getFileSymbols(mockFileInfo.filePath);
      expect(symbols).toEqual([]);
    });
  });

  describe('setFileDependencies', () => {
    it('應該設定檔案的依賴關係', async () => {
      const dependencies: Dependency[] = [
        {
          source: mockFileInfo.filePath,
          target: '/workspace/src/utils.ts',
          type: 'import'
        }
      ];

      await fileIndex.addFile(mockFileInfo);
      await fileIndex.setFileDependencies(mockFileInfo.filePath, dependencies);

      const retrievedDeps = fileIndex.getFileDependencies(mockFileInfo.filePath);
      expect(retrievedDeps).toEqual(dependencies);
    });

    it('應該拋出錯誤當檔案不存在於索引中', async () => {
      await expect(
        fileIndex.setFileDependencies('/nonexistent.ts', [])
      ).rejects.toThrow('檔案不存在於索引中');
    });

    it('應該能夠更新已存在的依賴', async () => {
      const deps1: Dependency[] = [
        {
          source: mockFileInfo.filePath,
          target: '/workspace/src/utils1.ts',
          type: 'import'
        }
      ];

      const deps2: Dependency[] = [
        {
          source: mockFileInfo.filePath,
          target: '/workspace/src/utils2.ts',
          type: 'import'
        }
      ];

      await fileIndex.addFile(mockFileInfo);
      await fileIndex.setFileDependencies(mockFileInfo.filePath, deps1);
      await fileIndex.setFileDependencies(mockFileInfo.filePath, deps2);

      const retrievedDeps = fileIndex.getFileDependencies(mockFileInfo.filePath);
      expect(retrievedDeps).toEqual(deps2);
    });
  });

  describe('getFileDependencies', () => {
    it('應該回傳空陣列當檔案不存在', () => {
      const deps = fileIndex.getFileDependencies('/nonexistent.ts');
      expect(deps).toEqual([]);
    });

    it('應該回傳空陣列當檔案未設定依賴', async () => {
      await fileIndex.addFile(mockFileInfo);
      const deps = fileIndex.getFileDependencies(mockFileInfo.filePath);
      expect(deps).toEqual([]);
    });
  });

  describe('findFilesByExtension', () => {
    it('應該找到指定副檔名的檔案', async () => {
      const tsFile = { ...mockFileInfo, filePath: '/workspace/src/file1.ts' };
      const jsFile = {
        ...mockFileInfo,
        filePath: '/workspace/src/file2.js',
        extension: '.js'
      };

      await fileIndex.addFile(tsFile);
      await fileIndex.addFile(jsFile);

      const tsFiles = fileIndex.findFilesByExtension('.ts');
      expect(tsFiles).toHaveLength(1);
      expect(tsFiles[0].filePath).toBe(tsFile.filePath);
    });

    it('應該回傳空陣列當沒有匹配的檔案', () => {
      const files = fileIndex.findFilesByExtension('.py');
      expect(files).toEqual([]);
    });

    it('應該找到多個相同副檔名的檔案', async () => {
      const file1 = { ...mockFileInfo, filePath: '/workspace/src/file1.ts' };
      const file2 = { ...mockFileInfo, filePath: '/workspace/src/file2.ts' };

      await fileIndex.addFile(file1);
      await fileIndex.addFile(file2);

      const tsFiles = fileIndex.findFilesByExtension('.ts');
      expect(tsFiles).toHaveLength(2);
    });
  });

  describe('findFilesByLanguage', () => {
    it('應該找到指定語言的檔案', async () => {
      const tsFile = {
        ...mockFileInfo,
        filePath: '/workspace/src/file1.ts',
        language: 'typescript'
      };
      const jsFile = {
        ...mockFileInfo,
        filePath: '/workspace/src/file2.js',
        language: 'javascript',
        extension: '.js'
      };

      await fileIndex.addFile(tsFile);
      await fileIndex.addFile(jsFile);

      const tsFiles = fileIndex.findFilesByLanguage('typescript');
      expect(tsFiles).toHaveLength(1);
      expect(tsFiles[0].filePath).toBe(tsFile.filePath);
    });

    it('應該回傳空陣列當沒有匹配的檔案', () => {
      const files = fileIndex.findFilesByLanguage('python');
      expect(files).toEqual([]);
    });

    it('應該找到多個相同語言的檔案', async () => {
      const file1 = {
        ...mockFileInfo,
        filePath: '/workspace/src/file1.ts',
        language: 'typescript'
      };
      const file2 = {
        ...mockFileInfo,
        filePath: '/workspace/src/file2.ts',
        language: 'typescript'
      };

      await fileIndex.addFile(file1);
      await fileIndex.addFile(file2);

      const tsFiles = fileIndex.findFilesByLanguage('typescript');
      expect(tsFiles).toHaveLength(2);
    });
  });

  describe('getAllFiles', () => {
    it('應該回傳所有檔案', async () => {
      const file1 = { ...mockFileInfo, filePath: '/workspace/src/file1.ts' };
      const file2 = { ...mockFileInfo, filePath: '/workspace/src/file2.ts' };

      await fileIndex.addFile(file1);
      await fileIndex.addFile(file2);

      const allFiles = fileIndex.getAllFiles();
      expect(allFiles).toHaveLength(2);
    });

    it('應該回傳空陣列當沒有檔案', () => {
      const allFiles = fileIndex.getAllFiles();
      expect(allFiles).toEqual([]);
    });
  });

  describe('getTotalFiles', () => {
    it('應該回傳正確的檔案總數', async () => {
      expect(fileIndex.getTotalFiles()).toBe(0);

      await fileIndex.addFile(mockFileInfo);
      expect(fileIndex.getTotalFiles()).toBe(1);

      await fileIndex.addFile({ ...mockFileInfo, filePath: '/workspace/src/file2.ts' });
      expect(fileIndex.getTotalFiles()).toBe(2);
    });
  });

  describe('getIndexedFilesCount', () => {
    it('應該回傳正確的已索引檔案數', async () => {
      const file1 = { ...mockFileInfo, filePath: '/workspace/src/file1.ts' };
      const file2 = { ...mockFileInfo, filePath: '/workspace/src/file2.ts' };

      await fileIndex.addFile(file1);
      await fileIndex.addFile(file2);

      expect(fileIndex.getIndexedFilesCount()).toBe(0);

      await fileIndex.setFileSymbols(file1.filePath, []);
      expect(fileIndex.getIndexedFilesCount()).toBe(1);

      await fileIndex.setFileSymbols(file2.filePath, []);
      expect(fileIndex.getIndexedFilesCount()).toBe(2);
    });
  });

  describe('getStats', () => {
    it('應該回傳正確的統計資訊', async () => {
      const symbols: Symbol[] = [
        {
          name: 'testFunction',
          type: 'function',
          location: {
            filePath: mockFileInfo.filePath,
            line: 1,
            column: 0,
            offset: 0
          },
          scope: undefined
        }
      ];

      const dependencies: Dependency[] = [
        {
          source: mockFileInfo.filePath,
          target: '/workspace/src/utils.ts',
          type: 'import'
        }
      ];

      await fileIndex.addFile(mockFileInfo);
      await fileIndex.setFileSymbols(mockFileInfo.filePath, symbols);
      await fileIndex.setFileDependencies(mockFileInfo.filePath, dependencies);

      const stats = fileIndex.getStats();

      expect(stats.totalFiles).toBe(1);
      expect(stats.indexedFiles).toBe(1);
      expect(stats.totalSymbols).toBe(1);
      expect(stats.totalDependencies).toBe(1);
      expect(stats.lastUpdated).toBeInstanceOf(Date);
      expect(stats.indexSize).toBeGreaterThan(0);
    });

    it('應該回傳空統計資訊當沒有檔案', () => {
      const stats = fileIndex.getStats();

      expect(stats.totalFiles).toBe(0);
      expect(stats.indexedFiles).toBe(0);
      expect(stats.totalSymbols).toBe(0);
      expect(stats.totalDependencies).toBe(0);
    });
  });

  describe('clear', () => {
    it('應該清空所有索引', async () => {
      await fileIndex.addFile(mockFileInfo);
      await fileIndex.clear();

      expect(fileIndex.getTotalFiles()).toBe(0);
      expect(fileIndex.hasFile(mockFileInfo.filePath)).toBe(false);
    });
  });

  describe('needsReindexing', () => {
    it('應該回傳 true 當檔案不在索引中', () => {
      const result = fileIndex.needsReindexing('/nonexistent.ts', new Date());
      expect(result).toBe(true);
    });

    it('應該回傳 true 當檔案未被索引', async () => {
      await fileIndex.addFile(mockFileInfo);
      const result = fileIndex.needsReindexing(mockFileInfo.filePath, new Date());
      expect(result).toBe(true);
    });

    it('應該回傳 true 當檔案已被修改', async () => {
      await fileIndex.addFile(mockFileInfo);
      await fileIndex.setFileSymbols(mockFileInfo.filePath, []);

      const newerDate = new Date('2024-01-02');
      const result = fileIndex.needsReindexing(mockFileInfo.filePath, newerDate);
      expect(result).toBe(true);
    });

    it('應該回傳 false 當檔案未被修改', async () => {
      await fileIndex.addFile(mockFileInfo);
      await fileIndex.setFileSymbols(mockFileInfo.filePath, []);

      const sameDate = new Date('2024-01-01');
      const result = fileIndex.needsReindexing(mockFileInfo.filePath, sameDate);
      expect(result).toBe(false);
    });

    it('應該回傳 false 當檔案比索引舊', async () => {
      await fileIndex.addFile(mockFileInfo);
      await fileIndex.setFileSymbols(mockFileInfo.filePath, []);

      const olderDate = new Date('2023-12-31');
      const result = fileIndex.needsReindexing(mockFileInfo.filePath, olderDate);
      expect(result).toBe(false);
    });
  });

  describe('updateFileInfo', () => {
    it('應該更新檔案資訊', async () => {
      await fileIndex.addFile(mockFileInfo);

      const updatedFileInfo = {
        ...mockFileInfo,
        lastModified: new Date('2024-01-02'),
        size: 2000,
        checksum: 'def456'
      };

      await fileIndex.updateFileInfo(mockFileInfo.filePath, updatedFileInfo);

      const retrievedInfo = fileIndex.getFileInfo(mockFileInfo.filePath);
      expect(retrievedInfo).toEqual(updatedFileInfo);
    });

    it('應該拋出錯誤當檔案不存在於索引中', async () => {
      await expect(
        fileIndex.updateFileInfo('/nonexistent.ts', mockFileInfo)
      ).rejects.toThrow('檔案不存在於索引中');
    });

    it('應該保留原有的符號和依賴', async () => {
      const symbols: Symbol[] = [
        {
          name: 'testFunction',
          type: 'function',
          location: {
            filePath: mockFileInfo.filePath,
            line: 1,
            column: 0,
            offset: 0
          },
          scope: undefined
        }
      ];

      await fileIndex.addFile(mockFileInfo);
      await fileIndex.setFileSymbols(mockFileInfo.filePath, symbols);

      const updatedFileInfo = { ...mockFileInfo, size: 2000 };
      await fileIndex.updateFileInfo(mockFileInfo.filePath, updatedFileInfo);

      const retrievedSymbols = fileIndex.getFileSymbols(mockFileInfo.filePath);
      expect(retrievedSymbols).toEqual(symbols);
    });
  });

  describe('setFileParseErrors', () => {
    it('應該設定檔案的解析錯誤', async () => {
      const errors = ['語法錯誤', '類型錯誤'];

      await fileIndex.addFile(mockFileInfo);
      await fileIndex.setFileParseErrors(mockFileInfo.filePath, errors);

      const retrievedErrors = fileIndex.getFileParseErrors(mockFileInfo.filePath);
      expect(retrievedErrors).toEqual(errors);
    });

    it('應該拋出錯誤當檔案不存在於索引中', async () => {
      await expect(
        fileIndex.setFileParseErrors('/nonexistent.ts', ['錯誤'])
      ).rejects.toThrow('檔案不存在於索引中');
    });
  });

  describe('getFileParseErrors', () => {
    it('應該回傳空陣列當檔案不存在', () => {
      const errors = fileIndex.getFileParseErrors('/nonexistent.ts');
      expect(errors).toEqual([]);
    });

    it('應該回傳空陣列當檔案沒有解析錯誤', async () => {
      await fileIndex.addFile(mockFileInfo);
      const errors = fileIndex.getFileParseErrors(mockFileInfo.filePath);
      expect(errors).toEqual([]);
    });
  });

  describe('hasFileParseErrors', () => {
    it('應該回傳 true 當檔案有解析錯誤', async () => {
      await fileIndex.addFile(mockFileInfo);
      await fileIndex.setFileParseErrors(mockFileInfo.filePath, ['錯誤']);

      expect(fileIndex.hasFileParseErrors(mockFileInfo.filePath)).toBe(true);
    });

    it('應該回傳 false 當檔案沒有解析錯誤', async () => {
      await fileIndex.addFile(mockFileInfo);
      expect(fileIndex.hasFileParseErrors(mockFileInfo.filePath)).toBe(false);
    });

    it('應該回傳 false 當檔案不存在', () => {
      expect(fileIndex.hasFileParseErrors('/nonexistent.ts')).toBe(false);
    });
  });
});
