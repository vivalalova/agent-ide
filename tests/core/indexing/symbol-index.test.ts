/**
 * SymbolIndex 測試
 * 測試符號索引的查詢和管理功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SymbolIndex } from '../../../src/core/indexing/symbol-index';
import { createSymbol, createScope, SymbolType } from '../../../src/shared/types';
import { createPosition, createRange, createLocation } from '../../../src/shared/types';
import { createFileInfo, createSearchOptions } from '../../../src/core/indexing/types';

describe('SymbolIndex', () => {
  let symbolIndex: SymbolIndex;

  beforeEach(() => {
    symbolIndex = new SymbolIndex();
  });

  describe('基本符號管理', () => {
    it('應該能新增符號到索引', async () => {
      const fileInfo = createFileInfo(
        '/test/file.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const symbol = createSymbol(
        'testFunction',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(
          createPosition(1, 1),
          createPosition(1, 10)
        ))
      );

      await symbolIndex.addSymbol(symbol, fileInfo);

      expect(symbolIndex.getTotalSymbols()).toBe(1);
      expect(symbolIndex.hasSymbol('testFunction')).toBe(true);
    });

    it('應該能移除符號從索引', async () => {
      const fileInfo = createFileInfo(
        '/test/file.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const symbol = createSymbol(
        'testFunction',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(
          createPosition(1, 1),
          createPosition(1, 10)
        ))
      );

      await symbolIndex.addSymbol(symbol, fileInfo);
      expect(symbolIndex.hasSymbol('testFunction')).toBe(true);

      await symbolIndex.removeSymbol('testFunction', '/test/file.ts');
      expect(symbolIndex.hasSymbol('testFunction')).toBe(false);
    });

    it('應該能批次新增符號', async () => {
      const fileInfo = createFileInfo(
        '/test/file.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const symbols = [
        createSymbol('function1', SymbolType.Function, createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))),
        createSymbol('function2', SymbolType.Function, createLocation('/test/file.ts', createRange(createPosition(2, 1), createPosition(2, 10)))),
        createSymbol('MyClass', SymbolType.Class, createLocation('/test/file.ts', createRange(createPosition(5, 1), createPosition(10, 1))))
      ];

      await symbolIndex.addSymbols(symbols, fileInfo);

      expect(symbolIndex.getTotalSymbols()).toBe(3);
      expect(symbolIndex.hasSymbol('function1')).toBe(true);
      expect(symbolIndex.hasSymbol('function2')).toBe(true);
      expect(symbolIndex.hasSymbol('MyClass')).toBe(true);
    });

    it('應該能移除檔案的所有符號', async () => {
      const fileInfo = createFileInfo(
        '/test/file.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const symbols = [
        createSymbol('function1', SymbolType.Function, createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))),
        createSymbol('function2', SymbolType.Function, createLocation('/test/file.ts', createRange(createPosition(2, 1), createPosition(2, 10))))
      ];

      await symbolIndex.addSymbols(symbols, fileInfo);
      expect(symbolIndex.getTotalSymbols()).toBe(2);

      await symbolIndex.removeFileSymbols('/test/file.ts');
      expect(symbolIndex.getTotalSymbols()).toBe(0);
    });
  });

  describe('符號查詢功能', () => {
    beforeEach(async () => {
      const fileInfo1 = createFileInfo('/test/file1.ts', new Date(), 1024, '.ts', 'typescript', 'checksum1');
      const fileInfo2 = createFileInfo('/test/file2.ts', new Date(), 1024, '.ts', 'typescript', 'checksum2');

      const symbols = [
        createSymbol('testFunction', SymbolType.Function, createLocation('/test/file1.ts', createRange(createPosition(1, 1), createPosition(1, 10)))),
        createSymbol('TestClass', SymbolType.Class, createLocation('/test/file1.ts', createRange(createPosition(5, 1), createPosition(10, 1)))),
        createSymbol('myVariable', SymbolType.Variable, createLocation('/test/file2.ts', createRange(createPosition(1, 1), createPosition(1, 10)))),
        createSymbol('TestInterface', SymbolType.Interface, createLocation('/test/file2.ts', createRange(createPosition(3, 1), createPosition(5, 1))))
      ];

      await symbolIndex.addSymbol(symbols[0], fileInfo1);
      await symbolIndex.addSymbol(symbols[1], fileInfo1);
      await symbolIndex.addSymbol(symbols[2], fileInfo2);
      await symbolIndex.addSymbol(symbols[3], fileInfo2);
    });

    it('應該能根據確切名稱查找符號', async () => {
      const results = await symbolIndex.findSymbol('testFunction');
      
      expect(results).toHaveLength(1);
      expect(results[0].symbol.name).toBe('testFunction');
      expect(results[0].symbol.type).toBe(SymbolType.Function);
    });

    it('應該能根據符號類型查找', async () => {
      const results = await symbolIndex.findSymbolsByType(SymbolType.Function);
      
      expect(results).toHaveLength(1);
      expect(results[0].symbol.name).toBe('testFunction');
    });

    it('應該能模糊搜尋符號', async () => {
      const options = createSearchOptions({ fuzzy: true });
      const results = await symbolIndex.searchSymbols('test', options);
      
      expect(results.length).toBeGreaterThan(0);
      const names = results.map(r => r.symbol.name);
      expect(names).toContain('testFunction');
    });

    it('應該能根據檔案查找符號', async () => {
      const results = await symbolIndex.getFileSymbols('/test/file1.ts');
      
      expect(results).toHaveLength(2);
      const names = results.map(s => s.name);
      expect(names).toContain('testFunction');
      expect(names).toContain('TestClass');
    });

    it('應該能區分大小寫搜尋', async () => {
      const caseSensitiveOptions = createSearchOptions({ caseSensitive: true, fuzzy: false });
      const caseInsensitiveOptions = createSearchOptions({ caseSensitive: false, fuzzy: false });

      const sensitiveResults = await symbolIndex.searchSymbols('testfunction', caseSensitiveOptions);
      const insensitiveResults = await symbolIndex.searchSymbols('testfunction', caseInsensitiveOptions);

      expect(sensitiveResults).toHaveLength(0);
      expect(insensitiveResults.length).toBeGreaterThan(0);
    });

    it('應該能限制搜尋結果數量', async () => {
      const options = createSearchOptions({ maxResults: 1 });
      const results = await symbolIndex.searchSymbols('', options);
      
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('符號範圍 (Scope) 功能', () => {
    it('應該能根據作用域查找符號', async () => {
      const fileInfo = createFileInfo(
        '/test/file.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const classScope = createScope('class', 'MyClass');
      const functionScope = createScope('function', 'myMethod', classScope);

      const classSymbol = createSymbol(
        'MyClass',
        SymbolType.Class,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(10, 1))),
        classScope
      );

      const methodSymbol = createSymbol(
        'myMethod',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(3, 1), createPosition(5, 1))),
        functionScope
      );

      await symbolIndex.addSymbol(classSymbol, fileInfo);
      await symbolIndex.addSymbol(methodSymbol, fileInfo);

      const classSymbols = await symbolIndex.findSymbolsInScope(classScope);
      expect(classSymbols).toHaveLength(1);
      expect(classSymbols[0].name).toBe('MyClass');

      const functionSymbols = await symbolIndex.findSymbolsInScope(functionScope);
      expect(functionSymbols).toHaveLength(1);
      expect(functionSymbols[0].name).toBe('myMethod');
    });
  });

  describe('統計和效能', () => {
    it('應該能取得索引統計資訊', async () => {
      const fileInfo = createFileInfo(
        '/test/file.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const symbols = [
        createSymbol('function1', SymbolType.Function, createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))),
        createSymbol('class1', SymbolType.Class, createLocation('/test/file.ts', createRange(createPosition(5, 1), createPosition(10, 1))))
      ];

      await symbolIndex.addSymbols(symbols, fileInfo);

      const stats = symbolIndex.getStats();
      expect(stats.totalSymbols).toBe(2);
      expect(stats.symbolsByType.get(SymbolType.Function)).toBe(1);
      expect(stats.symbolsByType.get(SymbolType.Class)).toBe(1);
    });

    it('應該能處理大量符號的查詢效能', async () => {
      const fileInfo = createFileInfo(
        '/test/file.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      // 新增大量符號來測試效能
      const symbols = [];
      for (let i = 0; i < 1000; i++) {
        symbols.push(
          createSymbol(
            `function${i}`,
            SymbolType.Function,
            createLocation('/test/file.ts', createRange(createPosition(i, 1), createPosition(i, 10)))
          )
        );
      }

      await symbolIndex.addSymbols(symbols, fileInfo);

      const startTime = Date.now();
      const results = await symbolIndex.searchSymbols('function500');
      const endTime = Date.now();

      expect(results.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(100); // 應該在 100ms 內完成
    });
  });

  describe('清理和維護', () => {
    it('應該能清空所有符號', async () => {
      const fileInfo = createFileInfo(
        '/test/file.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const symbol = createSymbol(
        'testFunction',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      await symbolIndex.addSymbol(symbol, fileInfo);
      expect(symbolIndex.getTotalSymbols()).toBe(1);

      await symbolIndex.clear();
      expect(symbolIndex.getTotalSymbols()).toBe(0);
    });

    it('應該能更新符號資訊', async () => {
      const fileInfo = createFileInfo(
        '/test/file.ts',
        new Date(),
        1024,
        '.ts',
        'typescript',
        'checksum123'
      );

      const originalSymbol = createSymbol(
        'testFunction',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
      );

      const updatedSymbol = createSymbol(
        'testFunction',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(2, 1), createPosition(2, 15))),
        undefined,
        ['async']
      );

      await symbolIndex.addSymbol(originalSymbol, fileInfo);
      
      let results = await symbolIndex.findSymbol('testFunction');
      expect(results[0].symbol.location.range.start.line).toBe(1);

      await symbolIndex.updateSymbol(updatedSymbol, fileInfo);
      
      results = await symbolIndex.findSymbol('testFunction');
      expect(results[0].symbol.location.range.start.line).toBe(2);
      expect(results[0].symbol.modifiers).toContain('async');
    });
  });

  describe('錯誤處理', () => {
    it('移除不存在的符號應該不會出錯', async () => {
      await expect(
        symbolIndex.removeSymbol('nonexistent', '/test/file.ts')
      ).resolves.not.toThrow();
    });

    it('查找不存在的符號應該回傳空陣列', async () => {
      const results = await symbolIndex.findSymbol('nonexistent');
      expect(results).toEqual([]);
    });

    it('從不存在的檔案取得符號應該回傳空陣列', async () => {
      const results = await symbolIndex.getFileSymbols('/nonexistent/file.ts');
      expect(results).toEqual([]);
    });
  });
});