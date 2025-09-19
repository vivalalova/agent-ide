import { describe, it, expect } from 'vitest';
import { 
  SymbolType,
  Scope,
  Symbol,
  ReferenceType,
  Reference,
  DependencyType,
  Dependency,
  isSymbol,
  isReference,
  isDependency,
  createSymbol,
  createReference,
  createDependency,
  createScope,
  isScope,
  getScopeDepth,
  isSameScope,
  getScopePath
} from '../../../src/shared/types/symbol';
import { createPosition, createRange, createLocation } from '../../../src/shared/types/core';

describe('Symbol 型別系統', () => {
  describe('SymbolType 列舉', () => {
    it('應該包含所有必要的 Symbol 類型', () => {
      expect(SymbolType.Class).toBe('class');
      expect(SymbolType.Interface).toBe('interface');
      expect(SymbolType.Function).toBe('function');
      expect(SymbolType.Variable).toBe('variable');
      expect(SymbolType.Constant).toBe('constant');
      expect(SymbolType.Type).toBe('type');
      expect(SymbolType.Enum).toBe('enum');
      expect(SymbolType.Module).toBe('module');
      expect(SymbolType.Namespace).toBe('namespace');
    });
  });

  describe('Scope 型別', () => {
    it('應該能建立 global scope', () => {
      const scope = createScope('global');
      expect(scope.type).toBe('global');
      expect(scope.name).toBeUndefined();
      expect(scope.parent).toBeUndefined();
    });

    it('應該能建立具名 scope', () => {
      const parentScope = createScope('global');
      const scope = createScope('function', 'myFunction', parentScope);
      
      expect(scope.type).toBe('function');
      expect(scope.name).toBe('myFunction');
      expect(scope.parent).toEqual(parentScope);
    });

    it('應該拒絕無效的 scope 類型', () => {
      expect(() => createScope('invalid' as any)).toThrow('無效的 scope 類型');
    });

    it('isScope 型別守衛應該正確驗證', () => {
      const validScope = { type: 'global' };
      const invalidScope = { type: 'invalid' };
      
      expect(isScope(validScope)).toBe(true);
      expect(isScope(invalidScope)).toBe(false);
      expect(isScope(null)).toBe(false);
    });
  });

  describe('Symbol 型別', () => {
    const mockLocation = createLocation(
      '/test/file.ts',
      createRange(createPosition(1, 1), createPosition(1, 10))
    );

    it('應該能建立基本的 Symbol', () => {
      const symbol = createSymbol('myFunction', SymbolType.Function, mockLocation);
      
      expect(symbol.name).toBe('myFunction');
      expect(symbol.type).toBe(SymbolType.Function);
      expect(symbol.location).toEqual(mockLocation);
      expect(symbol.scope).toBeUndefined();
      expect(symbol.modifiers).toEqual([]);
    });

    it('應該能建立包含 scope 和 modifiers 的 Symbol', () => {
      const scope = createScope('class', 'MyClass');
      const symbol = createSymbol(
        'method',
        SymbolType.Function,
        mockLocation,
        scope,
        ['public', 'static']
      );
      
      expect(symbol.name).toBe('method');
      expect(symbol.type).toBe(SymbolType.Function);
      expect(symbol.scope).toEqual(scope);
      expect(symbol.modifiers).toEqual(['public', 'static']);
    });

    it('應該拒絕空的 Symbol 名稱', () => {
      expect(() => createSymbol('', SymbolType.Function, mockLocation))
        .toThrow('Symbol 名稱不能為空');
    });

    it('應該拒絕重複的 modifiers', () => {
      expect(() => createSymbol(
        'test', 
        SymbolType.Function, 
        mockLocation, 
        undefined, 
        ['public', 'public']
      )).toThrow('Modifiers 不能重複');
    });

    it('isSymbol 型別守衛應該正確驗證', () => {
      const validSymbol = {
        name: 'test',
        type: SymbolType.Function,
        location: mockLocation,
        modifiers: []
      };
      
      const invalidSymbol = {
        name: '',
        type: SymbolType.Function,
        location: mockLocation
      };

      expect(isSymbol(validSymbol)).toBe(true);
      expect(isSymbol(invalidSymbol)).toBe(false);
      expect(isSymbol(null)).toBe(false);
    });
  });

  describe('ReferenceType 列舉', () => {
    it('應該包含所有必要的 Reference 類型', () => {
      expect(ReferenceType.Definition).toBe('definition');
      expect(ReferenceType.Usage).toBe('usage');
      expect(ReferenceType.Declaration).toBe('declaration');
    });
  });

  describe('Reference 型別', () => {
    const mockSymbol = createSymbol(
      'testSymbol',
      SymbolType.Function,
      createLocation('/test.ts', createRange(createPosition(1, 1), createPosition(1, 10)))
    );
    
    const mockLocation = createLocation(
      '/test.ts',
      createRange(createPosition(5, 1), createPosition(5, 10))
    );

    it('應該能建立 Reference', () => {
      const reference = createReference(mockSymbol, mockLocation, ReferenceType.Usage);
      
      expect(reference.symbol).toEqual(mockSymbol);
      expect(reference.location).toEqual(mockLocation);
      expect(reference.type).toBe(ReferenceType.Usage);
    });

    it('isReference 型別守衛應該正確驗證', () => {
      const validReference = {
        symbol: mockSymbol,
        location: mockLocation,
        type: ReferenceType.Usage
      };

      expect(isReference(validReference)).toBe(true);
      expect(isReference(null)).toBe(false);
      expect(isReference({})).toBe(false);
    });
  });

  describe('DependencyType 列舉', () => {
    it('應該包含所有必要的 Dependency 類型', () => {
      expect(DependencyType.Import).toBe('import');
      expect(DependencyType.Require).toBe('require');
      expect(DependencyType.Include).toBe('include');
    });
  });

  describe('Dependency 型別', () => {
    it('應該能建立基本的 Dependency', () => {
      const dependency = createDependency(
        './utils',
        DependencyType.Import,
        true,
        ['helper', 'formatter']
      );
      
      expect(dependency.path).toBe('./utils');
      expect(dependency.type).toBe(DependencyType.Import);
      expect(dependency.isRelative).toBe(true);
      expect(dependency.importedSymbols).toEqual(['helper', 'formatter']);
    });

    it('應該能建立不包含 importedSymbols 的 Dependency', () => {
      const dependency = createDependency(
        'lodash',
        DependencyType.Import,
        false
      );
      
      expect(dependency.path).toBe('lodash');
      expect(dependency.isRelative).toBe(false);
      expect(dependency.importedSymbols).toEqual([]);
    });

    it('應該拒絕空的路徑', () => {
      expect(() => createDependency('', DependencyType.Import, false))
        .toThrow('Dependency 路徑不能為空');
    });

    it('應該拒絕重複的 importedSymbols', () => {
      expect(() => createDependency(
        './test',
        DependencyType.Import,
        true,
        ['helper', 'helper']
      )).toThrow('ImportedSymbols 不能重複');
    });

    it('isDependency 型別守衛應該正確驗證', () => {
      const validDependency = {
        path: './utils',
        type: DependencyType.Import,
        isRelative: true,
        importedSymbols: ['helper']
      };

      expect(isDependency(validDependency)).toBe(true);
      expect(isDependency(null)).toBe(false);
      expect(isDependency({ path: '' })).toBe(false);
    });
  });

  describe('Symbol 查詢功能', () => {
    const scope1 = createScope('global');
    const scope2 = createScope('class', 'TestClass', scope1);
    const scope3 = createScope('function', 'testMethod', scope2);

    it('應該能計算 Scope 的深度', () => {
      expect(getScopeDepth(scope1)).toBe(0);
      expect(getScopeDepth(scope2)).toBe(1);
      expect(getScopeDepth(scope3)).toBe(2);
    });

    it('應該能檢查兩個 Symbol 是否在同一 Scope', () => {
      const symbol1 = createSymbol('test1', SymbolType.Variable, 
        createLocation('/test.ts', createRange(createPosition(1, 1), createPosition(1, 5))),
        scope2
      );
      const symbol2 = createSymbol('test2', SymbolType.Variable,
        createLocation('/test.ts', createRange(createPosition(2, 1), createPosition(2, 5))),
        scope2
      );
      const symbol3 = createSymbol('test3', SymbolType.Variable,
        createLocation('/test.ts', createRange(createPosition(3, 1), createPosition(3, 5))),
        scope3
      );

      expect(isSameScope(symbol1, symbol2)).toBe(true);
      expect(isSameScope(symbol1, symbol3)).toBe(false);
      expect(isSameScope(symbol2, symbol3)).toBe(false);
    });

    it('應該能取得 Scope 的完整路徑', () => {
      expect(getScopePath(scope1)).toEqual(['global']);
      expect(getScopePath(scope2)).toEqual(['global', 'TestClass']);
      expect(getScopePath(scope3)).toEqual(['global', 'TestClass', 'testMethod']);
    });
  });
});

