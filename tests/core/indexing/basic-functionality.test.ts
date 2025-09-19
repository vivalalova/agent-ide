/**
 * 基本功能整合測試
 * 測試核心索引功能的基本運作
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FileIndex } from '../../../src/core/indexing/file-index';
import { SymbolIndex } from '../../../src/core/indexing/symbol-index';
import { createFileInfo, createIndexConfig } from '../../../src/core/indexing/types';
import { createSymbol, SymbolType, createPosition, createRange, createLocation } from '../../../src/shared/types';

describe('基本索引功能整合測試', () => {
  let fileIndex: FileIndex;
  let symbolIndex: SymbolIndex;

  beforeEach(() => {
    const config = createIndexConfig('/test/workspace');
    fileIndex = new FileIndex(config);
    symbolIndex = new SymbolIndex();
  });

  describe('FileIndex 基本功能', () => {
    it('應該能管理檔案索引', async () => {
      const fileInfo = createFileInfo(
        '/test/file.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'abc123'
      );

      await fileIndex.addFile(fileInfo);
      expect(fileIndex.hasFile('/test/file.ts')).toBe(true);
      expect(fileIndex.getTotalFiles()).toBe(1);

      const retrievedInfo = fileIndex.getFileInfo('/test/file.ts');
      expect(retrievedInfo?.filePath).toBe('/test/file.ts');
    });

    it('應該能管理符號關聯', async () => {
      const fileInfo = createFileInfo(
        '/test/file.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'abc123'
      );

      const symbol = createSymbol(
        'testFunction',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(
          createPosition(1, 1),
          createPosition(1, 15)
        ))
      );

      await fileIndex.addFile(fileInfo);
      await fileIndex.setFileSymbols('/test/file.ts', [symbol]);

      const symbols = fileIndex.getFileSymbols('/test/file.ts');
      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe('testFunction');
    });
  });

  describe('SymbolIndex 基本功能', () => {
    it('應該能索引和查詢符號', async () => {
      const fileInfo = createFileInfo(
        '/test/file.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'abc123'
      );

      const symbol = createSymbol(
        'testFunction',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(
          createPosition(1, 1),
          createPosition(1, 15)
        ))
      );

      await symbolIndex.addSymbol(symbol, fileInfo);

      expect(symbolIndex.getTotalSymbols()).toBe(1);
      expect(symbolIndex.hasSymbol('testFunction')).toBe(true);

      const results = await symbolIndex.findSymbol('testFunction');
      expect(results).toHaveLength(1);
      expect(results[0].symbol.name).toBe('testFunction');
    });

    it('應該能按類型查詢符號', async () => {
      const fileInfo = createFileInfo(
        '/test/file.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'abc123'
      );

      const func = createSymbol(
        'myFunction',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(
          createPosition(1, 1),
          createPosition(1, 15)
        ))
      );

      const cls = createSymbol(
        'MyClass',
        SymbolType.Class,
        createLocation('/test/file.ts', createRange(
          createPosition(3, 1),
          createPosition(10, 1)
        ))
      );

      await symbolIndex.addSymbol(func, fileInfo);
      await symbolIndex.addSymbol(cls, fileInfo);

      const functions = await symbolIndex.findSymbolsByType(SymbolType.Function);
      expect(functions).toHaveLength(1);
      expect(functions[0].symbol.name).toBe('myFunction');

      const classes = await symbolIndex.findSymbolsByType(SymbolType.Class);
      expect(classes).toHaveLength(1);
      expect(classes[0].symbol.name).toBe('MyClass');
    });
  });

  describe('統計資訊', () => {
    it('檔案索引統計應該正確', async () => {
      const file1 = createFileInfo('/test/file1.ts', new Date(), 1024, '.ts', 'typescript', 'abc');
      const file2 = createFileInfo('/test/file2.ts', new Date(), 512, '.ts', 'typescript', 'def');

      await fileIndex.addFile(file1);
      await fileIndex.addFile(file2);

      const stats = fileIndex.getStats();
      expect(stats.totalFiles).toBe(2);
      expect(stats.indexedFiles).toBe(0); // 沒有設定符號，所以未完全索引
    });

    it('符號索引統計應該正確', async () => {
      const fileInfo = createFileInfo('/test/file.ts', new Date(), 1024, '.ts', 'typescript', 'abc');

      const symbols = [
        createSymbol('func1', SymbolType.Function, createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))),
        createSymbol('func2', SymbolType.Function, createLocation('/test/file.ts', createRange(createPosition(2, 1), createPosition(2, 10)))),
        createSymbol('MyClass', SymbolType.Class, createLocation('/test/file.ts', createRange(createPosition(5, 1), createPosition(10, 1))))
      ];

      await symbolIndex.addSymbols(symbols, fileInfo);

      const stats = symbolIndex.getStats();
      expect(stats.totalSymbols).toBe(3);
      expect(stats.symbolsByType.get(SymbolType.Function)).toBe(2);
      expect(stats.symbolsByType.get(SymbolType.Class)).toBe(1);
    });
  });

  describe('清理功能', () => {
    it('應該能清空檔案索引', async () => {
      const fileInfo = createFileInfo('/test/file.ts', new Date(), 1024, '.ts', 'typescript', 'abc');
      await fileIndex.addFile(fileInfo);

      expect(fileIndex.getTotalFiles()).toBe(1);
      
      await fileIndex.clear();
      expect(fileIndex.getTotalFiles()).toBe(0);
    });

    it('應該能清空符號索引', async () => {
      const fileInfo = createFileInfo('/test/file.ts', new Date(), 1024, '.ts', 'typescript', 'abc');
      const symbol = createSymbol('test', SymbolType.Function, createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10))));
      
      await symbolIndex.addSymbol(symbol, fileInfo);
      expect(symbolIndex.getTotalSymbols()).toBe(1);

      await symbolIndex.clear();
      expect(symbolIndex.getTotalSymbols()).toBe(0);
    });
  });
});