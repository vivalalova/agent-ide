import { describe, it, expect } from 'vitest';
import {
  createFileInfo,
  createIndexConfig,
  createSearchOptions,
  isFileInfo,
  isIndexConfig,
  calculateProgress,
  shouldIndexFile
} from '@core/indexing/types';

describe('Indexing Types', () => {
  describe('createFileInfo', () => {
    it('應該建立有效的 FileInfo', () => {
      const fileInfo = createFileInfo(
        '/path/to/file.ts',
        new Date('2024-01-01'),
        1000,
        '.ts',
        'typescript',
        'abc123'
      );

      expect(fileInfo.filePath).toBe('/path/to/file.ts');
      expect(fileInfo.lastModified).toEqual(new Date('2024-01-01'));
      expect(fileInfo.size).toBe(1000);
      expect(fileInfo.extension).toBe('.ts');
      expect(fileInfo.language).toBe('typescript');
      expect(fileInfo.checksum).toBe('abc123');
    });

    it('應該在沒有提供 language 時使用 undefined', () => {
      const fileInfo = createFileInfo(
        '/path/to/file.ts',
        new Date('2024-01-01'),
        1000,
        '.ts'
      );

      expect(fileInfo.language).toBeUndefined();
    });

    it('應該在沒有提供 checksum 時使用空字串', () => {
      const fileInfo = createFileInfo(
        '/path/to/file.ts',
        new Date('2024-01-01'),
        1000,
        '.ts'
      );

      expect(fileInfo.checksum).toBe('');
    });

    it('應該拋出錯誤當檔案路徑為空', () => {
      expect(() =>
        createFileInfo('', new Date(), 1000, '.ts')
      ).toThrow('檔案路徑不能為空');
    });

    it('應該拋出錯誤當檔案路徑只有空白', () => {
      expect(() =>
        createFileInfo('   ', new Date(), 1000, '.ts')
      ).toThrow('檔案路徑不能為空');
    });

    it('應該拋出錯誤當檔案大小為負數', () => {
      expect(() =>
        createFileInfo('/path/to/file.ts', new Date(), -1, '.ts')
      ).toThrow('檔案大小不能為負數');
    });
  });

  describe('createIndexConfig', () => {
    it('應該建立有效的 IndexConfig', () => {
      const config = createIndexConfig('/workspace/path', {
        excludePatterns: ['test/**'],
        includeExtensions: ['.ts'],
        maxFileSize: 2048,
        enablePersistence: true,
        persistencePath: '/cache',
        maxConcurrency: 8
      });

      expect(config.workspacePath).toBe('/workspace/path');
      expect(config.excludePatterns).toEqual(['test/**']);
      expect(config.includeExtensions).toEqual(['.ts']);
      expect(config.maxFileSize).toBe(2048);
      expect(config.enablePersistence).toBe(true);
      expect(config.persistencePath).toBe('/cache');
      expect(config.maxConcurrency).toBe(8);
    });

    it('應該使用預設值當未提供 options', () => {
      const config = createIndexConfig('/workspace/path');

      expect(config.workspacePath).toBe('/workspace/path');
      expect(config.excludePatterns).toEqual(['node_modules/**', '.git/**', 'dist/**']);
      expect(config.includeExtensions).toEqual(['.ts', '.js', '.tsx', '.jsx']);
      expect(config.maxFileSize).toBe(1024 * 1024);
      expect(config.enablePersistence).toBe(true);
      expect(config.persistencePath).toBeUndefined();
      expect(config.maxConcurrency).toBe(4);
    });

    it('應該拋出錯誤當工作區路徑為空', () => {
      expect(() =>
        createIndexConfig('')
      ).toThrow('工作區路徑不能為空');
    });

    it('應該拋出錯誤當工作區路徑只有空白', () => {
      expect(() =>
        createIndexConfig('   ')
      ).toThrow('工作區路徑不能為空');
    });

    it('應該允許部分覆寫預設值', () => {
      const config = createIndexConfig('/workspace/path', {
        maxFileSize: 2048
      });

      expect(config.maxFileSize).toBe(2048);
      expect(config.excludePatterns).toEqual(['node_modules/**', '.git/**', 'dist/**']);
      expect(config.includeExtensions).toEqual(['.ts', '.js', '.tsx', '.jsx']);
    });
  });

  describe('createSearchOptions', () => {
    it('應該建立有效的 SearchOptions並覆寫預設值', () => {
      const options = createSearchOptions({
        caseSensitive: true,
        maxResults: 50
      });

      expect(options.caseSensitive).toBe(true);
      expect(options.maxResults).toBe(50);
      // 其他屬性使用預設值
      expect(options.fuzzy).toBeDefined();
      expect(options.includeFileInfo).toBeDefined();
    });

    it('應該使用預設值當未提供 options', () => {
      const options = createSearchOptions();

      expect(options.caseSensitive).toBe(false);
      expect(options.fuzzy).toBe(true);
      expect(options.maxResults).toBe(100);
      expect(options.includeFileInfo).toBe(true);
    });

    it('應該允許部分覆寫預設值', () => {
      const options = createSearchOptions({
        caseSensitive: true
      });

      expect(options.caseSensitive).toBe(true);
      expect(options.fuzzy).toBe(true);
      expect(options.maxResults).toBe(100);
      expect(options.includeFileInfo).toBe(true);
    });
  });

  describe('isFileInfo', () => {
    it('應該驗證有效的 FileInfo', () => {
      const fileInfo = {
        filePath: '/path/to/file.ts',
        lastModified: new Date(),
        size: 1000,
        extension: '.ts',
        language: 'typescript',
        checksum: 'abc123'
      };

      expect(isFileInfo(fileInfo)).toBe(true);
    });

    it('應該接受沒有 language 的 FileInfo', () => {
      const fileInfo = {
        filePath: '/path/to/file.ts',
        lastModified: new Date(),
        size: 1000,
        extension: '.ts',
        language: undefined,
        checksum: 'abc123'
      };

      expect(isFileInfo(fileInfo)).toBe(true);
    });

    it('應該拒絕 null', () => {
      expect(isFileInfo(null)).toBe(false);
    });

    it('應該拒絕 undefined', () => {
      expect(isFileInfo(undefined)).toBe(false);
    });

    it('應該拒絕非物件', () => {
      expect(isFileInfo('string')).toBe(false);
      expect(isFileInfo(123)).toBe(false);
      expect(isFileInfo(true)).toBe(false);
    });

    it('應該拒絕空檔案路徑', () => {
      const fileInfo = {
        filePath: '',
        lastModified: new Date(),
        size: 1000,
        extension: '.ts',
        language: 'typescript',
        checksum: 'abc123'
      };

      expect(isFileInfo(fileInfo)).toBe(false);
    });

    it('應該拒絕負數大小', () => {
      const fileInfo = {
        filePath: '/path/to/file.ts',
        lastModified: new Date(),
        size: -1,
        extension: '.ts',
        language: 'typescript',
        checksum: 'abc123'
      };

      expect(isFileInfo(fileInfo)).toBe(false);
    });

    it('應該拒絕非 Date 的 lastModified', () => {
      const fileInfo = {
        filePath: '/path/to/file.ts',
        lastModified: '2024-01-01',
        size: 1000,
        extension: '.ts',
        language: 'typescript',
        checksum: 'abc123'
      };

      expect(isFileInfo(fileInfo)).toBe(false);
    });

    it('應該拒絕缺少必要欄位的物件', () => {
      const fileInfo = {
        filePath: '/path/to/file.ts',
        lastModified: new Date(),
        size: 1000
      };

      expect(isFileInfo(fileInfo)).toBe(false);
    });
  });

  describe('isIndexConfig', () => {
    it('應該驗證有效的 IndexConfig', () => {
      const config = {
        workspacePath: '/workspace/path',
        excludePatterns: ['node_modules/**'],
        includeExtensions: ['.ts', '.js'],
        maxFileSize: 1024,
        enablePersistence: true,
        persistencePath: '/cache',
        maxConcurrency: 4
      };

      expect(isIndexConfig(config)).toBe(true);
    });

    it('應該接受沒有 persistencePath 的 IndexConfig', () => {
      const config = {
        workspacePath: '/workspace/path',
        excludePatterns: ['node_modules/**'],
        includeExtensions: ['.ts', '.js'],
        maxFileSize: 1024,
        enablePersistence: true,
        persistencePath: undefined,
        maxConcurrency: 4
      };

      expect(isIndexConfig(config)).toBe(true);
    });

    it('應該拒絕 null', () => {
      expect(isIndexConfig(null)).toBe(false);
    });

    it('應該拒絕 undefined', () => {
      expect(isIndexConfig(undefined)).toBe(false);
    });

    it('應該拒絕空工作區路徑', () => {
      const config = {
        workspacePath: '',
        excludePatterns: ['node_modules/**'],
        includeExtensions: ['.ts', '.js'],
        maxFileSize: 1024,
        enablePersistence: true,
        persistencePath: '/cache',
        maxConcurrency: 4
      };

      expect(isIndexConfig(config)).toBe(false);
    });

    it('應該拒絕負數或零的 maxFileSize', () => {
      const config = {
        workspacePath: '/workspace/path',
        excludePatterns: ['node_modules/**'],
        includeExtensions: ['.ts', '.js'],
        maxFileSize: 0,
        enablePersistence: true,
        persistencePath: '/cache',
        maxConcurrency: 4
      };

      expect(isIndexConfig(config)).toBe(false);
    });

    it('應該拒絕負數或零的 maxConcurrency', () => {
      const config = {
        workspacePath: '/workspace/path',
        excludePatterns: ['node_modules/**'],
        includeExtensions: ['.ts', '.js'],
        maxFileSize: 1024,
        enablePersistence: true,
        persistencePath: '/cache',
        maxConcurrency: 0
      };

      expect(isIndexConfig(config)).toBe(false);
    });

    it('應該拒絕非陣列的 excludePatterns', () => {
      const config = {
        workspacePath: '/workspace/path',
        excludePatterns: 'node_modules/**',
        includeExtensions: ['.ts', '.js'],
        maxFileSize: 1024,
        enablePersistence: true,
        persistencePath: '/cache',
        maxConcurrency: 4
      };

      expect(isIndexConfig(config)).toBe(false);
    });

    it('應該拒絕非陣列的 includeExtensions', () => {
      const config = {
        workspacePath: '/workspace/path',
        excludePatterns: ['node_modules/**'],
        includeExtensions: '.ts',
        maxFileSize: 1024,
        enablePersistence: true,
        persistencePath: '/cache',
        maxConcurrency: 4
      };

      expect(isIndexConfig(config)).toBe(false);
    });
  });

  describe('calculateProgress', () => {
    it('應該計算正確的百分比', () => {
      expect(calculateProgress(0, 100)).toBe(0);
      expect(calculateProgress(50, 100)).toBe(50);
      expect(calculateProgress(100, 100)).toBe(100);
    });

    it('應該四捨五入到整數', () => {
      expect(calculateProgress(33, 100)).toBe(33);
      expect(calculateProgress(66, 100)).toBe(66);
    });

    it('應該在 total 為 0 時回傳 100', () => {
      expect(calculateProgress(0, 0)).toBe(100);
    });

    it('應該處理大數字', () => {
      expect(calculateProgress(500, 1000)).toBe(50);
      expect(calculateProgress(9999, 10000)).toBe(100);
    });

    it('應該處理小數百分比', () => {
      expect(calculateProgress(1, 3)).toBe(33);
      expect(calculateProgress(2, 3)).toBe(67);
    });
  });

  describe('shouldIndexFile', () => {
    const baseConfig = {
      workspacePath: '/workspace',
      excludePatterns: ['node_modules/**', '.git/**', 'dist/**'],
      includeExtensions: ['.ts', '.js', '.tsx', '.jsx'],
      maxFileSize: 1024 * 1024,
      enablePersistence: true,
      persistencePath: undefined,
      maxConcurrency: 4
    };

    it('應該接受包含在 includeExtensions 中的檔案', () => {
      expect(shouldIndexFile('/workspace/src/file.ts', baseConfig)).toBe(true);
      expect(shouldIndexFile('/workspace/src/file.js', baseConfig)).toBe(true);
      expect(shouldIndexFile('/workspace/src/file.tsx', baseConfig)).toBe(true);
      expect(shouldIndexFile('/workspace/src/file.jsx', baseConfig)).toBe(true);
    });

    it('應該拒絕不包含在 includeExtensions 中的檔案', () => {
      expect(shouldIndexFile('/workspace/src/file.py', baseConfig)).toBe(false);
      expect(shouldIndexFile('/workspace/src/file.txt', baseConfig)).toBe(false);
      expect(shouldIndexFile('/workspace/src/file', baseConfig)).toBe(false);
    });

    it('應該排除匹配 excludePatterns 的檔案', () => {
      // 測試排除模式的基本功能
      // 根據 matchesPattern 的實作，**/dir/** 會匹配路徑中包含 dir 的檔案（排除第一個部分）
      const testConfig = {
        ...baseConfig,
        excludePatterns: ['*.test.ts', 'temp/**']
      };

      expect(shouldIndexFile('file.test.ts', testConfig)).toBe(false);
      expect(shouldIndexFile('temp/file.ts', testConfig)).toBe(false);
      expect(shouldIndexFile('src/file.ts', testConfig)).toBe(true);
    });

    it('應該接受不匹配 excludePatterns 的檔案', () => {
      expect(shouldIndexFile('/workspace/src/index.ts', baseConfig)).toBe(true);
      expect(shouldIndexFile('/workspace/lib/utils.js', baseConfig)).toBe(true);
    });

    it('應該處理複雜的路徑', () => {
      expect(shouldIndexFile('/workspace/src/components/Button/index.tsx', baseConfig)).toBe(true);
      expect(shouldIndexFile('/workspace/src/utils/helpers/string.ts', baseConfig)).toBe(true);
    });

    it('應該正確處理自訂排除模式', () => {
      const customConfig = {
        ...baseConfig,
        excludePatterns: ['test/**', '*.test.ts']
      };

      // test/** 會匹配以 test/ 開頭的路徑
      expect(shouldIndexFile('test/file.ts', customConfig)).toBe(false);
      // *.test.ts 會匹配以 .test.ts 結尾的檔案（在同一層）
      expect(shouldIndexFile('file.test.ts', customConfig)).toBe(false);
    });

    it('應該處理根目錄的檔案', () => {
      expect(shouldIndexFile('/workspace/index.ts', baseConfig)).toBe(true);
    });
  });
});
