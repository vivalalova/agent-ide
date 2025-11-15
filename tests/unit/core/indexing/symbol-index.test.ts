import { describe, it, expect, beforeEach } from 'vitest';
import { SymbolIndex } from '@core/indexing/symbol-index';
import type { FileInfo, SearchOptions } from '@core/indexing/types';
import type { Symbol, SymbolType, Scope } from '@shared/types';

describe('SymbolIndex', () => {
  let symbolIndex: SymbolIndex;
  let mockFileInfo: FileInfo;
  let mockSymbol: Symbol;

  beforeEach(() => {
    symbolIndex = new SymbolIndex();

    mockFileInfo = {
      filePath: '/workspace/src/file.ts',
      lastModified: new Date('2024-01-01'),
      size: 1000,
      extension: '.ts',
      language: 'typescript',
      checksum: 'abc123'
    };

    mockSymbol = {
      name: 'testFunction',
      type: 'function' as SymbolType,
      location: {
        filePath: mockFileInfo.filePath,
        line: 1,
        column: 0,
        offset: 0
      },
      scope: undefined
    };
  });

  describe('addSymbol', () => {
    it('應該新增符號到索引', async () => {
      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      expect(symbolIndex.hasSymbol('testFunction')).toBe(true);
    });

    it('應該能夠新增多個符號', async () => {
      const symbol2 = { ...mockSymbol, name: 'testFunction2' };

      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      await symbolIndex.addSymbol(symbol2, mockFileInfo);

      expect(symbolIndex.hasSymbol('testFunction')).toBe(true);
      expect(symbolIndex.hasSymbol('testFunction2')).toBe(true);
    });

    it('應該允許相同名稱的符號在不同檔案中', async () => {
      const fileInfo2 = { ...mockFileInfo, filePath: '/workspace/src/file2.ts' };

      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      await symbolIndex.addSymbol(mockSymbol, fileInfo2);

      const results = await symbolIndex.findSymbol('testFunction');
      expect(results).toHaveLength(2);
    });

    it('應該更新統計資訊', async () => {
      const initialTotal = symbolIndex.getTotalSymbols();
      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);

      expect(symbolIndex.getTotalSymbols()).toBe(initialTotal + 1);
    });
  });

  describe('addSymbols', () => {
    it('應該批次新增符號', async () => {
      const symbols: Symbol[] = [
        mockSymbol,
        { ...mockSymbol, name: 'testFunction2' },
        { ...mockSymbol, name: 'testFunction3' }
      ];

      await symbolIndex.addSymbols(symbols, mockFileInfo);

      expect(symbolIndex.getTotalSymbols()).toBe(3);
      expect(symbolIndex.hasSymbol('testFunction')).toBe(true);
      expect(symbolIndex.hasSymbol('testFunction2')).toBe(true);
      expect(symbolIndex.hasSymbol('testFunction3')).toBe(true);
    });

    it('應該處理空陣列', async () => {
      await symbolIndex.addSymbols([], mockFileInfo);
      expect(symbolIndex.getTotalSymbols()).toBe(0);
    });
  });

  describe('removeSymbol', () => {
    it('應該移除符號從索引', async () => {
      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      await symbolIndex.removeSymbol('testFunction', mockFileInfo.filePath);

      expect(symbolIndex.hasSymbol('testFunction')).toBe(false);
    });

    it('應該只移除指定檔案中的符號', async () => {
      const fileInfo2 = { ...mockFileInfo, filePath: '/workspace/src/file2.ts' };

      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      await symbolIndex.addSymbol(mockSymbol, fileInfo2);

      await symbolIndex.removeSymbol('testFunction', mockFileInfo.filePath);

      const results = await symbolIndex.findSymbol('testFunction');
      expect(results).toHaveLength(1);
      expect(results[0].fileInfo.filePath).toBe(fileInfo2.filePath);
    });

    it('應該能夠移除不存在的符號而不拋錯', async () => {
      await expect(
        symbolIndex.removeSymbol('nonexistent', '/path/to/file.ts')
      ).resolves.toBeUndefined();
    });
  });

  describe('removeFileSymbols', () => {
    it('應該移除檔案的所有符號', async () => {
      const symbols: Symbol[] = [
        mockSymbol,
        { ...mockSymbol, name: 'testFunction2' },
        { ...mockSymbol, name: 'testFunction3' }
      ];

      await symbolIndex.addSymbols(symbols, mockFileInfo);
      await symbolIndex.removeFileSymbols(mockFileInfo.filePath);

      expect(symbolIndex.getTotalSymbols()).toBe(0);
    });

    it('應該不影響其他檔案的符號', async () => {
      const fileInfo2 = { ...mockFileInfo, filePath: '/workspace/src/file2.ts' };
      const symbol2 = { ...mockSymbol, name: 'anotherFunction' };

      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      await symbolIndex.addSymbol(symbol2, fileInfo2);

      await symbolIndex.removeFileSymbols(mockFileInfo.filePath);

      expect(symbolIndex.hasSymbol('testFunction')).toBe(false);
      expect(symbolIndex.hasSymbol('anotherFunction')).toBe(true);
    });

    it('應該能夠移除不存在檔案的符號而不拋錯', async () => {
      await expect(
        symbolIndex.removeFileSymbols('/nonexistent.ts')
      ).resolves.toBeUndefined();
    });
  });

  describe('updateSymbol', () => {
    it('應該更新符號資訊', async () => {
      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);

      const updatedSymbol = {
        ...mockSymbol,
        location: {
          ...mockSymbol.location,
          line: 10
        }
      };

      await symbolIndex.updateSymbol(updatedSymbol, mockFileInfo);

      const results = await symbolIndex.findSymbol('testFunction');
      expect(results).toHaveLength(1);
      expect(results[0].symbol.location.line).toBe(10);
    });

    it('應該維持符號總數不變', async () => {
      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      const initialTotal = symbolIndex.getTotalSymbols();

      const updatedSymbol = { ...mockSymbol, location: { ...mockSymbol.location, line: 10 } };
      await symbolIndex.updateSymbol(updatedSymbol, mockFileInfo);

      expect(symbolIndex.getTotalSymbols()).toBe(initialTotal);
    });
  });

  describe('hasSymbol', () => {
    it('應該回傳 true 當符號存在', async () => {
      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      expect(symbolIndex.hasSymbol('testFunction')).toBe(true);
    });

    it('應該回傳 false 當符號不存在', () => {
      expect(symbolIndex.hasSymbol('nonexistent')).toBe(false);
    });
  });

  describe('findSymbol', () => {
    it('應該找到指定名稱的符號', async () => {
      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);

      const results = await symbolIndex.findSymbol('testFunction');
      expect(results).toHaveLength(1);
      expect(results[0].symbol.name).toBe('testFunction');
      expect(results[0].fileInfo).toEqual(mockFileInfo);
      expect(results[0].score).toBe(1.0);
    });

    it('應該回傳空陣列當符號不存在', async () => {
      const results = await symbolIndex.findSymbol('nonexistent');
      expect(results).toEqual([]);
    });

    it('應該找到所有相同名稱的符號', async () => {
      const fileInfo2 = { ...mockFileInfo, filePath: '/workspace/src/file2.ts' };

      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      await symbolIndex.addSymbol(mockSymbol, fileInfo2);

      const results = await symbolIndex.findSymbol('testFunction');
      expect(results).toHaveLength(2);
    });

    it('應該限制結果數量', async () => {
      const fileInfo2 = { ...mockFileInfo, filePath: '/workspace/src/file2.ts' };
      const fileInfo3 = { ...mockFileInfo, filePath: '/workspace/src/file3.ts' };

      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      await symbolIndex.addSymbol(mockSymbol, fileInfo2);
      await symbolIndex.addSymbol(mockSymbol, fileInfo3);

      const options: SearchOptions = {
        caseSensitive: false,
        fuzzy: false,
        maxResults: 2,
        includeFileInfo: true
      };

      const results = await symbolIndex.findSymbol('testFunction', options);
      expect(results).toHaveLength(2);
    });
  });

  describe('findSymbolsByType', () => {
    it('應該找到指定類型的符號', async () => {
      const classSymbol: Symbol = {
        name: 'TestClass',
        type: 'class',
        location: mockSymbol.location,
        scope: undefined
      };

      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      await symbolIndex.addSymbol(classSymbol, mockFileInfo);

      const functions = await symbolIndex.findSymbolsByType('function');
      expect(functions).toHaveLength(1);
      expect(functions[0].symbol.name).toBe('testFunction');

      const classes = await symbolIndex.findSymbolsByType('class');
      expect(classes).toHaveLength(1);
      expect(classes[0].symbol.name).toBe('TestClass');
    });

    it('應該回傳空陣列當沒有該類型的符號', async () => {
      const results = await symbolIndex.findSymbolsByType('interface');
      expect(results).toEqual([]);
    });

    it('應該限制結果數量', async () => {
      const symbols: Symbol[] = [
        { ...mockSymbol, name: 'func1' },
        { ...mockSymbol, name: 'func2' },
        { ...mockSymbol, name: 'func3' }
      ];

      await symbolIndex.addSymbols(symbols, mockFileInfo);

      const options: SearchOptions = {
        caseSensitive: false,
        fuzzy: false,
        maxResults: 2,
        includeFileInfo: true
      };

      const results = await symbolIndex.findSymbolsByType('function', options);
      expect(results).toHaveLength(2);
    });
  });

  describe('searchSymbols', () => {
    beforeEach(async () => {
      const symbols: Symbol[] = [
        { ...mockSymbol, name: 'testFunction' },
        { ...mockSymbol, name: 'TestClass' },
        { ...mockSymbol, name: 'testVariable' },
        { ...mockSymbol, name: 'myTestHelper' },
        { ...mockSymbol, name: 'calculateTotal' }
      ];

      await symbolIndex.addSymbols(symbols, mockFileInfo);
    });

    it('應該進行模糊搜尋', async () => {
      const results = await symbolIndex.searchSymbols('test');
      expect(results.length).toBeGreaterThan(0);

      const names = results.map(r => r.symbol.name);
      expect(names).toContain('testFunction');
      expect(names).toContain('testVariable');
      expect(names).toContain('myTestHelper');
    });

    it('應該區分大小寫（當 caseSensitive 為 true）', async () => {
      const options: SearchOptions = {
        caseSensitive: true,
        fuzzy: false,
        maxResults: 100,
        includeFileInfo: true
      };

      const results = await symbolIndex.searchSymbols('test', options);
      const names = results.map(r => r.symbol.name);

      // fuzzy: false 只匹配包含 "test" 的符號
      expect(names).toContain('testFunction');
      expect(names).toContain('testVariable');
      // myTestHelper 包含 "test" 但不是以 test 開頭，模糊匹配可能不包含它
      expect(names).not.toContain('TestClass'); // 大寫 T
    });

    it('應該不區分大小寫（當 caseSensitive 為 false）', async () => {
      const options: SearchOptions = {
        caseSensitive: false,
        fuzzy: false,
        maxResults: 100,
        includeFileInfo: true
      };

      const results = await symbolIndex.searchSymbols('test', options);
      const names = results.map(r => r.symbol.name);

      expect(names).toContain('testFunction');
      expect(names).toContain('TestClass');
      expect(names).toContain('testVariable');
    });

    it('應該限制結果數量', async () => {
      const options: SearchOptions = {
        caseSensitive: false,
        fuzzy: true,
        maxResults: 2,
        includeFileInfo: true
      };

      const results = await symbolIndex.searchSymbols('test', options);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('應該根據分數排序結果', async () => {
      const results = await symbolIndex.searchSymbols('test');

      // 確認結果按分數降序排列
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });

    it('應該回傳空陣列當沒有匹配的符號', async () => {
      const results = await symbolIndex.searchSymbols('nonexistent');
      expect(results).toEqual([]);
    });

    it('應該使用精確搜尋（當 fuzzy 為 false）', async () => {
      const options: SearchOptions = {
        caseSensitive: false,
        fuzzy: false,
        maxResults: 100,
        includeFileInfo: true
      };

      const results = await symbolIndex.searchSymbols('test', options);

      // 精確搜尋只匹配包含 "test" 的符號
      const names = results.map(r => r.symbol.name);
      expect(names).toContain('testFunction');
      expect(names).toContain('testVariable');
      expect(names).toContain('myTestHelper');
    });
  });

  describe('getAllSymbols', () => {
    it('應該回傳所有符號', async () => {
      const symbols: Symbol[] = [
        { ...mockSymbol, name: 'func1' },
        { ...mockSymbol, name: 'func2' },
        { ...mockSymbol, name: 'func3' }
      ];

      await symbolIndex.addSymbols(symbols, mockFileInfo);

      const results = await symbolIndex.getAllSymbols();
      expect(results).toHaveLength(3);
    });

    it('應該回傳空陣列當沒有符號', async () => {
      const results = await symbolIndex.getAllSymbols();
      expect(results).toEqual([]);
    });

    it('應該為所有符號設定分數為 1.0', async () => {
      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);

      const results = await symbolIndex.getAllSymbols();
      expect(results[0].score).toBe(1.0);
    });
  });

  describe('getFileSymbols', () => {
    it('應該回傳檔案的所有符號', async () => {
      const symbols: Symbol[] = [
        { ...mockSymbol, name: 'func1' },
        { ...mockSymbol, name: 'func2' }
      ];

      await symbolIndex.addSymbols(symbols, mockFileInfo);

      const fileSymbols = await symbolIndex.getFileSymbols(mockFileInfo.filePath);
      expect(fileSymbols).toHaveLength(2);
    });

    it('應該回傳空陣列當檔案沒有符號', async () => {
      const fileSymbols = await symbolIndex.getFileSymbols('/nonexistent.ts');
      expect(fileSymbols).toEqual([]);
    });

    it('應該只回傳指定檔案的符號', async () => {
      const fileInfo2 = { ...mockFileInfo, filePath: '/workspace/src/file2.ts' };
      const symbol2 = { ...mockSymbol, name: 'anotherFunction' };

      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      await symbolIndex.addSymbol(symbol2, fileInfo2);

      const fileSymbols = await symbolIndex.getFileSymbols(mockFileInfo.filePath);
      expect(fileSymbols).toHaveLength(1);
      expect(fileSymbols[0].name).toBe('testFunction');
    });
  });

  describe('findSymbolsInScope', () => {
    it('應該找到指定作用域中的符號', async () => {
      const scope: Scope = {
        type: 'class',
        name: 'TestClass',
        parent: undefined
      };

      const symbolWithScope: Symbol = {
        ...mockSymbol,
        name: 'methodInClass',
        scope
      };

      await symbolIndex.addSymbol(symbolWithScope, mockFileInfo);

      const scopeSymbols = await symbolIndex.findSymbolsInScope(scope);
      expect(scopeSymbols).toHaveLength(1);
      expect(scopeSymbols[0].name).toBe('methodInClass');
    });

    it('應該回傳空陣列當作用域中沒有符號', async () => {
      const scope: Scope = {
        type: 'class',
        name: 'NonexistentClass',
        parent: undefined
      };

      const scopeSymbols = await symbolIndex.findSymbolsInScope(scope);
      expect(scopeSymbols).toEqual([]);
    });

    it('應該處理巢狀作用域', async () => {
      const parentScope: Scope = {
        type: 'class',
        name: 'TestClass',
        parent: undefined
      };

      const childScope: Scope = {
        type: 'function',
        name: 'testMethod',
        parent: parentScope
      };

      const symbolWithScope: Symbol = {
        ...mockSymbol,
        name: 'variableInMethod',
        scope: childScope
      };

      await symbolIndex.addSymbol(symbolWithScope, mockFileInfo);

      const scopeSymbols = await symbolIndex.findSymbolsInScope(childScope);
      expect(scopeSymbols).toHaveLength(1);
      expect(scopeSymbols[0].name).toBe('variableInMethod');
    });
  });

  describe('getTotalSymbols', () => {
    it('應該回傳正確的符號總數', async () => {
      expect(symbolIndex.getTotalSymbols()).toBe(0);

      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      expect(symbolIndex.getTotalSymbols()).toBe(1);

      await symbolIndex.addSymbol({ ...mockSymbol, name: 'func2' }, mockFileInfo);
      expect(symbolIndex.getTotalSymbols()).toBe(2);
    });

    it('應該計算所有檔案的符號總數', async () => {
      const fileInfo2 = { ...mockFileInfo, filePath: '/workspace/src/file2.ts' };

      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      await symbolIndex.addSymbol({ ...mockSymbol, name: 'func2' }, fileInfo2);

      expect(symbolIndex.getTotalSymbols()).toBe(2);
    });
  });

  describe('getStats', () => {
    it('應該回傳正確的統計資訊', async () => {
      const classSymbol: Symbol = {
        ...mockSymbol,
        name: 'TestClass',
        type: 'class'
      };

      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      await symbolIndex.addSymbol(classSymbol, mockFileInfo);

      const stats = symbolIndex.getStats();

      expect(stats.totalSymbols).toBe(2);
      expect(stats.symbolsByType.get('function')).toBe(1);
      expect(stats.symbolsByType.get('class')).toBe(1);
      expect(stats.symbolsByFile.get(mockFileInfo.filePath)).toBe(2);
      expect(stats.lastUpdated).toBeInstanceOf(Date);
    });

    it('應該回傳空統計資訊當沒有符號', () => {
      const stats = symbolIndex.getStats();

      expect(stats.totalSymbols).toBe(0);
      expect(stats.symbolsByType.size).toBe(0);
      expect(stats.symbolsByFile.size).toBe(0);
    });

    it('應該正確統計多種類型的符號', async () => {
      const symbols: Symbol[] = [
        { ...mockSymbol, name: 'func1', type: 'function' },
        { ...mockSymbol, name: 'func2', type: 'function' },
        { ...mockSymbol, name: 'class1', type: 'class' },
        { ...mockSymbol, name: 'var1', type: 'variable' }
      ];

      await symbolIndex.addSymbols(symbols, mockFileInfo);

      const stats = symbolIndex.getStats();
      expect(stats.symbolsByType.get('function')).toBe(2);
      expect(stats.symbolsByType.get('class')).toBe(1);
      expect(stats.symbolsByType.get('variable')).toBe(1);
    });
  });

  describe('clear', () => {
    it('應該清空所有符號', async () => {
      const symbols: Symbol[] = [
        { ...mockSymbol, name: 'func1' },
        { ...mockSymbol, name: 'func2' },
        { ...mockSymbol, name: 'func3' }
      ];

      await symbolIndex.addSymbols(symbols, mockFileInfo);
      await symbolIndex.clear();

      expect(symbolIndex.getTotalSymbols()).toBe(0);
      expect(symbolIndex.hasSymbol('func1')).toBe(false);
    });

    it('應該清空所有類型索引', async () => {
      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      await symbolIndex.clear();

      const results = await symbolIndex.findSymbolsByType('function');
      expect(results).toEqual([]);
    });

    it('應該清空所有檔案索引', async () => {
      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);
      await symbolIndex.clear();

      const fileSymbols = await symbolIndex.getFileSymbols(mockFileInfo.filePath);
      expect(fileSymbols).toEqual([]);
    });
  });

  describe('邊界情況', () => {
    it('應該處理相同符號名稱但不同類型', async () => {
      const functionSymbol: Symbol = {
        ...mockSymbol,
        name: 'test',
        type: 'function'
      };

      const classSymbol: Symbol = {
        ...mockSymbol,
        name: 'test',
        type: 'class'
      };

      await symbolIndex.addSymbol(functionSymbol, mockFileInfo);
      await symbolIndex.addSymbol(classSymbol, mockFileInfo);

      const allResults = await symbolIndex.findSymbol('test');
      expect(allResults).toHaveLength(2);

      const functionResults = await symbolIndex.findSymbolsByType('function');
      expect(functionResults).toHaveLength(1);

      const classResults = await symbolIndex.findSymbolsByType('class');
      expect(classResults).toHaveLength(1);
    });

    it('應該處理空字串搜尋', async () => {
      await symbolIndex.addSymbol(mockSymbol, mockFileInfo);

      const results = await symbolIndex.searchSymbols('');
      // 空字串應該匹配所有符號（根據 fuzzyMatch 的實作）
      expect(results.length).toBeGreaterThan(0);
    });

    it('應該處理特殊字元的符號名稱', async () => {
      const specialSymbol: Symbol = {
        ...mockSymbol,
        name: '$special_function-name'
      };

      await symbolIndex.addSymbol(specialSymbol, mockFileInfo);

      const results = await symbolIndex.findSymbol('$special_function-name');
      expect(results).toHaveLength(1);
    });

    it('應該處理 Unicode 字元的符號名稱', async () => {
      const unicodeSymbol: Symbol = {
        ...mockSymbol,
        name: '測試函數'
      };

      await symbolIndex.addSymbol(unicodeSymbol, mockFileInfo);

      const results = await symbolIndex.findSymbol('測試函數');
      expect(results).toHaveLength(1);
    });
  });
});
