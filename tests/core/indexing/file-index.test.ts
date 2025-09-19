/**
 * FileIndex 測試
 * 測試檔案索引的基本功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FileIndex } from '../../../src/core/indexing/file-index';
import { createFileInfo, createIndexConfig } from '../../../src/core/indexing/types';
import { createSymbol, createDependency, SymbolType, DependencyType } from '../../../src/shared/types';
import { createPosition, createRange, createLocation } from '../../../src/shared/types';

describe('FileIndex', () => {
  let fileIndex: FileIndex;
  let config: any;

  beforeEach(() => {
    config = createIndexConfig('/test/workspace');
    fileIndex = new FileIndex(config);
  });

  describe('基本索引功能', () => {
    it('應該能建立新的檔案索引', () => {
      expect(fileIndex).toBeDefined();
      expect(fileIndex.getTotalFiles()).toBe(0);
    });

    it('應該能新增檔案到索引', async () => {
      const fileInfo = createFileInfo(
        '/test/workspace/test.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      await fileIndex.addFile(fileInfo);

      expect(fileIndex.getTotalFiles()).toBe(1);
      expect(fileIndex.hasFile('/test/workspace/test.ts')).toBe(true);
    });

    it('應該能取得檔案資訊', async () => {
      const fileInfo = createFileInfo(
        '/test/workspace/test.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      await fileIndex.addFile(fileInfo);
      const retrievedInfo = fileIndex.getFileInfo('/test/workspace/test.ts');

      expect(retrievedInfo).toEqual(fileInfo);
    });

    it('應該能移除檔案從索引', async () => {
      const fileInfo = createFileInfo(
        '/test/workspace/test.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      await fileIndex.addFile(fileInfo);
      expect(fileIndex.hasFile('/test/workspace/test.ts')).toBe(true);

      await fileIndex.removeFile('/test/workspace/test.ts');
      expect(fileIndex.hasFile('/test/workspace/test.ts')).toBe(false);
    });
  });

  describe('符號管理', () => {
    it('應該能為檔案設定符號', async () => {
      const fileInfo = createFileInfo(
        '/test/workspace/test.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const symbol = createSymbol(
        'testFunction',
        SymbolType.Function,
        createLocation('/test/workspace/test.ts', createRange(
          createPosition(1, 1),
          createPosition(1, 10)
        ))
      );

      await fileIndex.addFile(fileInfo);
      await fileIndex.setFileSymbols('/test/workspace/test.ts', [symbol]);

      const symbols = fileIndex.getFileSymbols('/test/workspace/test.ts');
      expect(symbols).toHaveLength(1);
      expect(symbols[0]).toEqual(symbol);
    });

    it('應該能更新檔案的符號', async () => {
      const fileInfo = createFileInfo(
        '/test/workspace/test.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const symbol1 = createSymbol(
        'function1',
        SymbolType.Function,
        createLocation('/test/workspace/test.ts', createRange(
          createPosition(1, 1),
          createPosition(1, 10)
        ))
      );

      const symbol2 = createSymbol(
        'function2',
        SymbolType.Function,
        createLocation('/test/workspace/test.ts', createRange(
          createPosition(2, 1),
          createPosition(2, 10)
        ))
      );

      await fileIndex.addFile(fileInfo);
      await fileIndex.setFileSymbols('/test/workspace/test.ts', [symbol1]);
      
      let symbols = fileIndex.getFileSymbols('/test/workspace/test.ts');
      expect(symbols).toHaveLength(1);

      await fileIndex.setFileSymbols('/test/workspace/test.ts', [symbol1, symbol2]);
      symbols = fileIndex.getFileSymbols('/test/workspace/test.ts');
      expect(symbols).toHaveLength(2);
    });
  });

  describe('依賴管理', () => {
    it('應該能為檔案設定依賴', async () => {
      const fileInfo = createFileInfo(
        '/test/workspace/test.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const dependency = createDependency(
        './utils',
        DependencyType.Import,
        true,
        ['helper']
      );

      await fileIndex.addFile(fileInfo);
      await fileIndex.setFileDependencies('/test/workspace/test.ts', [dependency]);

      const dependencies = fileIndex.getFileDependencies('/test/workspace/test.ts');
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0]).toEqual(dependency);
    });
  });

  describe('查詢功能', () => {
    it('應該能根據副檔名查詢檔案', async () => {
      const fileInfo1 = createFileInfo(
        '/test/workspace/test.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const fileInfo2 = createFileInfo(
        '/test/workspace/test.js',
        new Date(),
        512,
        '.js',
        'javascript',
        'checksum456'
      );

      await fileIndex.addFile(fileInfo1);
      await fileIndex.addFile(fileInfo2);

      const tsFiles = fileIndex.findFilesByExtension('.ts');
      expect(tsFiles).toHaveLength(1);
      expect(tsFiles[0].filePath).toBe('/test/workspace/test.ts');

      const jsFiles = fileIndex.findFilesByExtension('.js');
      expect(jsFiles).toHaveLength(1);
      expect(jsFiles[0].filePath).toBe('/test/workspace/test.js');
    });

    it('應該能根據語言查詢檔案', async () => {
      const fileInfo1 = createFileInfo(
        '/test/workspace/test.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const fileInfo2 = createFileInfo(
        '/test/workspace/test.js',
        new Date(),
        512,
        '.js',
        'javascript',
        'checksum456'
      );

      await fileIndex.addFile(fileInfo1);
      await fileIndex.addFile(fileInfo2);

      const tsFiles = fileIndex.findFilesByLanguage('typescript');
      expect(tsFiles).toHaveLength(1);
      expect(tsFiles[0].filePath).toBe('/test/workspace/test.ts');
    });

    it('應該能取得所有已索引的檔案', async () => {
      const fileInfo1 = createFileInfo(
        '/test/workspace/test1.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const fileInfo2 = createFileInfo(
        '/test/workspace/test2.ts',
        new Date(),
        512,
        '.ts',
        'typescript',
        'checksum456'
      );

      await fileIndex.addFile(fileInfo1);
      await fileIndex.addFile(fileInfo2);

      const allFiles = fileIndex.getAllFiles();
      expect(allFiles).toHaveLength(2);
      
      const filePaths = allFiles.map(f => f.filePath);
      expect(filePaths).toContain('/test/workspace/test1.ts');
      expect(filePaths).toContain('/test/workspace/test2.ts');
    });
  });

  describe('統計資訊', () => {
    it('應該能取得索引統計資訊', async () => {
      const fileInfo = createFileInfo(
        '/test/workspace/test.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const symbol = createSymbol(
        'testFunction',
        SymbolType.Function,
        createLocation('/test/workspace/test.ts', createRange(
          createPosition(1, 1),
          createPosition(1, 10)
        ))
      );

      const dependency = createDependency(
        './utils',
        DependencyType.Import,
        true,
        ['helper']
      );

      await fileIndex.addFile(fileInfo);
      await fileIndex.setFileSymbols('/test/workspace/test.ts', [symbol]);
      await fileIndex.setFileDependencies('/test/workspace/test.ts', [dependency]);

      const stats = fileIndex.getStats();
      expect(stats.totalFiles).toBe(1);
      expect(stats.totalSymbols).toBe(1);
      expect(stats.totalDependencies).toBe(1);
    });
  });

  describe('清理功能', () => {
    it('應該能清空所有索引', async () => {
      const fileInfo = createFileInfo(
        '/test/workspace/test.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      await fileIndex.addFile(fileInfo);
      expect(fileIndex.getTotalFiles()).toBe(1);

      await fileIndex.clear();
      expect(fileIndex.getTotalFiles()).toBe(0);
    });
  });

  describe('錯誤處理', () => {
    it('取得不存在檔案的資訊應該傳回 null', () => {
      const fileInfo = fileIndex.getFileInfo('/non/existent/file.ts');
      expect(fileInfo).toBeNull();
    });

    it('移除不存在的檔案應該不會出錯', async () => {
      await expect(fileIndex.removeFile('/non/existent/file.ts')).resolves.not.toThrow();
    });

    it('為不存在的檔案設定符號應該拋出錯誤', async () => {
      const symbol = createSymbol(
        'testFunction',
        SymbolType.Function,
        createLocation('/non/existent/file.ts', createRange(
          createPosition(1, 1),
          createPosition(1, 10)
        ))
      );

      await expect(
        fileIndex.setFileSymbols('/non/existent/file.ts', [symbol])
      ).rejects.toThrow();
    });
  });
});