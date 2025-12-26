/**
 * shared/types 測試
 * 測試 core.ts, symbol.ts, ast.ts 的所有工廠函式和型別守衛
 */

import { describe, it, expect } from 'vitest';

// Core types
import {
  createPosition,
  createRange,
  createLocation,
  isPosition,
  isRange,
  isLocation,
  isPositionBefore,
  isPositionInRange,
} from '@shared/types/core.js';

// Symbol types
import {
  SymbolType,
  ReferenceType,
  DependencyType,
  createScope,
  createSymbol,
  createReference,
  createDependency,
  isScope,
  isSymbol,
  isReference,
  isDependency,
  getScopeDepth,
  isSameScope,
  getScopePath,
} from '@shared/types/symbol.js';

// AST types
import {
  createASTNode,
  createASTMetadata,
  createAST,
  isASTNode,
  isASTMetadata,
  isAST,
  findNodeByPosition,
  findNodesByType,
  getNodePath,
  getNodeDepth,
  isNodeAncestorOf,
} from '@shared/types/ast.js';

// ============================================================================
// Core Types Tests
// ============================================================================

describe('Core Types', () => {
  describe('createPosition', () => {
    it('should create a valid position', () => {
      const pos = createPosition(1, 1);
      expect(pos.line).toBe(1);
      expect(pos.column).toBe(1);
      expect(pos.offset).toBeUndefined();
    });

    it('should create position with offset', () => {
      const pos = createPosition(10, 5, 100);
      expect(pos.line).toBe(10);
      expect(pos.column).toBe(5);
      expect(pos.offset).toBe(100);
    });

    it('should allow offset of 0', () => {
      const pos = createPosition(1, 1, 0);
      expect(pos.offset).toBe(0);
    });

    it('should throw error for line < 1', () => {
      expect(() => createPosition(0, 1)).toThrow('Line 必須大於等於 1');
      expect(() => createPosition(-1, 1)).toThrow('Line 必須大於等於 1');
    });

    it('should throw error for column < 1', () => {
      expect(() => createPosition(1, 0)).toThrow('Column 必須大於等於 1');
      expect(() => createPosition(1, -1)).toThrow('Column 必須大於等於 1');
    });

    it('should throw error for negative offset', () => {
      expect(() => createPosition(1, 1, -1)).toThrow('Offset 必須大於等於 0');
    });
  });

  describe('createRange', () => {
    it('should create a valid range', () => {
      const start = createPosition(1, 1);
      const end = createPosition(1, 10);
      const range = createRange(start, end);
      expect(range.start).toBe(start);
      expect(range.end).toBe(end);
    });

    it('should allow same start and end position', () => {
      const pos = createPosition(5, 5);
      const range = createRange(pos, pos);
      expect(range.start).toBe(pos);
      expect(range.end).toBe(pos);
    });

    it('should create range spanning multiple lines', () => {
      const start = createPosition(1, 1);
      const end = createPosition(10, 20);
      const range = createRange(start, end);
      expect(range.start.line).toBe(1);
      expect(range.end.line).toBe(10);
    });

    it('should throw error when start is after end', () => {
      const start = createPosition(10, 1);
      const end = createPosition(1, 1);
      expect(() => createRange(start, end)).toThrow('Range 的 start 不能在 end 之後');
    });

    it('should throw error when start column is after end column on same line', () => {
      const start = createPosition(5, 20);
      const end = createPosition(5, 10);
      expect(() => createRange(start, end)).toThrow('Range 的 start 不能在 end 之後');
    });
  });

  describe('createLocation', () => {
    it('should create a valid location', () => {
      const range = createRange(createPosition(1, 1), createPosition(1, 10));
      const location = createLocation('/path/to/file.ts', range);
      expect(location.filePath).toBe('/path/to/file.ts');
      expect(location.range).toBe(range);
    });

    it('should throw error for empty file path', () => {
      const range = createRange(createPosition(1, 1), createPosition(1, 10));
      expect(() => createLocation('', range)).toThrow('檔案路徑不能為空');
      expect(() => createLocation('   ', range)).toThrow('檔案路徑不能為空');
    });
  });

  describe('isPosition', () => {
    it('should return true for valid position', () => {
      expect(isPosition({ line: 1, column: 1, offset: undefined })).toBe(true);
      expect(isPosition({ line: 10, column: 5, offset: 100 })).toBe(true);
      expect(isPosition({ line: 1, column: 1, offset: 0 })).toBe(true);
    });

    it('should return false for invalid positions', () => {
      expect(isPosition(null)).toBe(false);
      expect(isPosition(undefined)).toBe(false);
      expect(isPosition({})).toBe(false);
      expect(isPosition({ line: 0, column: 1 })).toBe(false);
      expect(isPosition({ line: 1, column: 0 })).toBe(false);
      expect(isPosition({ line: 'a', column: 1 })).toBe(false);
      expect(isPosition({ line: 1, column: 1, offset: -1 })).toBe(false);
      expect(isPosition({ line: 1, column: 1, offset: 'a' })).toBe(false);
    });
  });

  describe('isRange', () => {
    it('should return true for valid range', () => {
      const start = { line: 1, column: 1, offset: undefined };
      const end = { line: 1, column: 10, offset: undefined };
      expect(isRange({ start, end })).toBe(true);
    });

    it('should return false for invalid ranges', () => {
      expect(isRange(null)).toBe(false);
      expect(isRange(undefined)).toBe(false);
      expect(isRange({})).toBe(false);
      expect(isRange({ start: { line: 1, column: 1 } })).toBe(false);
      // Start after end
      const invalidRange = {
        start: { line: 10, column: 1, offset: undefined },
        end: { line: 1, column: 1, offset: undefined },
      };
      expect(isRange(invalidRange)).toBe(false);
    });
  });

  describe('isLocation', () => {
    it('should return true for valid location', () => {
      const location = {
        filePath: '/path/to/file.ts',
        range: {
          start: { line: 1, column: 1, offset: undefined },
          end: { line: 1, column: 10, offset: undefined },
        },
      };
      expect(isLocation(location)).toBe(true);
    });

    it('should return false for invalid locations', () => {
      expect(isLocation(null)).toBe(false);
      expect(isLocation(undefined)).toBe(false);
      expect(isLocation({})).toBe(false);
      expect(isLocation({ filePath: '' })).toBe(false);
      expect(isLocation({ filePath: '  ', range: {} })).toBe(false);
    });
  });

  describe('isPositionBefore', () => {
    it('should return true when pos1 is before pos2 by line', () => {
      const pos1 = createPosition(1, 10);
      const pos2 = createPosition(2, 1);
      expect(isPositionBefore(pos1, pos2)).toBe(true);
    });

    it('should return true when pos1 is before pos2 by column on same line', () => {
      const pos1 = createPosition(5, 1);
      const pos2 = createPosition(5, 10);
      expect(isPositionBefore(pos1, pos2)).toBe(true);
    });

    it('should return false when pos1 is same as pos2', () => {
      const pos1 = createPosition(5, 10);
      const pos2 = createPosition(5, 10);
      expect(isPositionBefore(pos1, pos2)).toBe(false);
    });

    it('should return false when pos1 is after pos2', () => {
      const pos1 = createPosition(10, 1);
      const pos2 = createPosition(5, 10);
      expect(isPositionBefore(pos1, pos2)).toBe(false);
    });
  });

  describe('isPositionInRange', () => {
    it('should return true when position is within range', () => {
      const range = createRange(createPosition(1, 1), createPosition(10, 20));
      expect(isPositionInRange(createPosition(5, 10), range)).toBe(true);
    });

    it('should return true when position is at range start', () => {
      const range = createRange(createPosition(1, 1), createPosition(10, 20));
      expect(isPositionInRange(createPosition(1, 1), range)).toBe(true);
    });

    it('should return true when position is at range end', () => {
      const range = createRange(createPosition(1, 1), createPosition(10, 20));
      expect(isPositionInRange(createPosition(10, 20), range)).toBe(true);
    });

    it('should return false when position is before range', () => {
      const range = createRange(createPosition(5, 1), createPosition(10, 20));
      expect(isPositionInRange(createPosition(1, 1), range)).toBe(false);
    });

    it('should return false when position is after range', () => {
      const range = createRange(createPosition(1, 1), createPosition(10, 20));
      expect(isPositionInRange(createPosition(11, 1), range)).toBe(false);
    });
  });
});

// ============================================================================
// Symbol Types Tests
// ============================================================================

describe('Symbol Types', () => {
  describe('SymbolType enum', () => {
    it('should have all expected values', () => {
      expect(SymbolType.Class).toBe('class');
      expect(SymbolType.Interface).toBe('interface');
      expect(SymbolType.Protocol).toBe('protocol');
      expect(SymbolType.Struct).toBe('struct');
      expect(SymbolType.Function).toBe('function');
      expect(SymbolType.Variable).toBe('variable');
      expect(SymbolType.Constant).toBe('constant');
      expect(SymbolType.Property).toBe('property');
      expect(SymbolType.Type).toBe('type');
      expect(SymbolType.Enum).toBe('enum');
      expect(SymbolType.Module).toBe('module');
      expect(SymbolType.Namespace).toBe('namespace');
    });
  });

  describe('ReferenceType enum', () => {
    it('should have all expected values', () => {
      expect(ReferenceType.Definition).toBe('definition');
      expect(ReferenceType.Usage).toBe('usage');
      expect(ReferenceType.Declaration).toBe('declaration');
      expect(ReferenceType.Import).toBe('import');
    });
  });

  describe('DependencyType enum', () => {
    it('should have all expected values', () => {
      expect(DependencyType.Import).toBe('import');
      expect(DependencyType.Require).toBe('require');
      expect(DependencyType.Include).toBe('include');
    });
  });

  describe('createScope', () => {
    it('should create a valid scope', () => {
      const scope = createScope('global');
      expect(scope.type).toBe('global');
      expect(scope.name).toBeUndefined();
      expect(scope.parent).toBeUndefined();
    });

    it('should create scope with name', () => {
      const scope = createScope('class', 'MyClass');
      expect(scope.type).toBe('class');
      expect(scope.name).toBe('MyClass');
    });

    it('should create scope with parent', () => {
      const parent = createScope('module', 'myModule');
      const child = createScope('class', 'MyClass', parent);
      expect(child.parent).toBe(parent);
    });

    it('should create nested scopes', () => {
      const global = createScope('global');
      const module = createScope('module', 'myModule', global);
      const classScope = createScope('class', 'MyClass', module);
      const func = createScope('function', 'myMethod', classScope);

      expect(func.parent).toBe(classScope);
      expect(classScope.parent).toBe(module);
      expect(module.parent).toBe(global);
    });

    it('should support all valid scope types', () => {
      const types = ['global', 'module', 'namespace', 'class', 'function', 'block'] as const;
      types.forEach(type => {
        const scope = createScope(type);
        expect(scope.type).toBe(type);
      });
    });

    it('should throw error for invalid scope type', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => createScope('invalid' as any)).toThrow('無效的 scope 類型');
    });

    it('should handle empty string name as undefined', () => {
      const scope = createScope('global', '');
      expect(scope.name).toBeUndefined();
    });
  });

  describe('createSymbol', () => {
    const location = createLocation(
      '/test.ts',
      createRange(createPosition(1, 1), createPosition(1, 10))
    );

    it('should create a valid symbol', () => {
      const symbol = createSymbol('myFunction', SymbolType.Function, location);
      expect(symbol.name).toBe('myFunction');
      expect(symbol.type).toBe(SymbolType.Function);
      expect(symbol.location).toBe(location);
      expect(symbol.scope).toBeUndefined();
      expect(symbol.modifiers).toEqual([]);
    });

    it('should create symbol with scope', () => {
      const scope = createScope('class', 'MyClass');
      const symbol = createSymbol('method', SymbolType.Function, location, scope);
      expect(symbol.scope).toBe(scope);
    });

    it('should create symbol with modifiers', () => {
      const symbol = createSymbol('method', SymbolType.Function, location, undefined, ['public', 'static']);
      expect(symbol.modifiers).toEqual(['public', 'static']);
    });

    it('should create symbol with attributes', () => {
      const symbol = createSymbol('method', SymbolType.Function, location, undefined, [], ['@deprecated', '@internal']);
      expect(symbol.attributes).toEqual(['@deprecated', '@internal']);
    });

    it('should create symbol with superclass', () => {
      const symbol = createSymbol('MyClass', SymbolType.Class, location, undefined, [], undefined, 'BaseClass');
      expect(symbol.superclass).toBe('BaseClass');
    });

    it('should create symbol with implements', () => {
      const symbol = createSymbol('MyClass', SymbolType.Class, location, undefined, [], undefined, undefined, ['ISerializable', 'IComparable']);
      expect(symbol.implements).toEqual(['ISerializable', 'IComparable']);
    });

    it('should create symbol with all optional properties', () => {
      const scope = createScope('module', 'myModule');
      const symbol = createSymbol(
        'MyClass',
        SymbolType.Class,
        location,
        scope,
        ['export', 'abstract'],
        ['@injectable'],
        'BaseClass',
        ['IDisposable']
      );

      expect(symbol.name).toBe('MyClass');
      expect(symbol.type).toBe(SymbolType.Class);
      expect(symbol.scope).toBe(scope);
      expect(symbol.modifiers).toEqual(['export', 'abstract']);
      expect(symbol.attributes).toEqual(['@injectable']);
      expect(symbol.superclass).toBe('BaseClass');
      expect(symbol.implements).toEqual(['IDisposable']);
    });

    it('should throw error for empty name', () => {
      expect(() => createSymbol('', SymbolType.Function, location)).toThrow('Symbol 名稱不能為空');
      expect(() => createSymbol('   ', SymbolType.Function, location)).toThrow('Symbol 名稱不能為空');
    });

    it('should throw error for duplicate modifiers', () => {
      expect(() => createSymbol('test', SymbolType.Function, location, undefined, ['public', 'public']))
        .toThrow('Modifiers 不能重複');
    });

    it('should not include empty attributes array', () => {
      const symbol = createSymbol('test', SymbolType.Function, location, undefined, [], []);
      expect(symbol.attributes).toBeUndefined();
    });

    it('should not include empty implements array', () => {
      const symbol = createSymbol('test', SymbolType.Class, location, undefined, [], undefined, undefined, []);
      expect(symbol.implements).toBeUndefined();
    });
  });

  describe('createReference', () => {
    const location = createLocation(
      '/test.ts',
      createRange(createPosition(1, 1), createPosition(1, 10))
    );
    const symbol = createSymbol('myFunction', SymbolType.Function, location);

    it('should create a valid reference', () => {
      const ref = createReference(symbol, location, ReferenceType.Usage);
      expect(ref.symbol).toBe(symbol);
      expect(ref.location).toBe(location);
      expect(ref.type).toBe(ReferenceType.Usage);
    });

    it('should create references with all types', () => {
      const types = [ReferenceType.Definition, ReferenceType.Usage, ReferenceType.Declaration, ReferenceType.Import];
      types.forEach(type => {
        const ref = createReference(symbol, location, type);
        expect(ref.type).toBe(type);
      });
    });
  });

  describe('createDependency', () => {
    it('should create a valid dependency', () => {
      const dep = createDependency('./utils', DependencyType.Import, true);
      expect(dep.path).toBe('./utils');
      expect(dep.type).toBe(DependencyType.Import);
      expect(dep.isRelative).toBe(true);
      expect(dep.importedSymbols).toEqual([]);
    });

    it('should create dependency with imported symbols', () => {
      const dep = createDependency('lodash', DependencyType.Import, false, ['map', 'filter']);
      expect(dep.importedSymbols).toEqual(['map', 'filter']);
    });

    it('should throw error for empty path', () => {
      expect(() => createDependency('', DependencyType.Import, true)).toThrow('Dependency 路徑不能為空');
      expect(() => createDependency('   ', DependencyType.Import, true)).toThrow('Dependency 路徑不能為空');
    });

    it('should throw error for duplicate imported symbols', () => {
      expect(() => createDependency('./utils', DependencyType.Import, true, ['foo', 'foo']))
        .toThrow('ImportedSymbols 不能重複');
    });

    it('should create dependencies with all types', () => {
      const types = [DependencyType.Import, DependencyType.Require, DependencyType.Include];
      types.forEach(type => {
        const dep = createDependency('./module', type, true);
        expect(dep.type).toBe(type);
      });
    });
  });

  describe('isScope', () => {
    it('should return true for valid scope', () => {
      expect(isScope({ type: 'global', name: undefined, parent: undefined })).toBe(true);
      expect(isScope({ type: 'class', name: 'MyClass', parent: undefined })).toBe(true);
    });

    it('should return true for nested scopes', () => {
      const parent = { type: 'module', name: 'myModule', parent: undefined };
      const child = { type: 'class', name: 'MyClass', parent };
      expect(isScope(child)).toBe(true);
    });

    it('should return false for invalid scopes', () => {
      expect(isScope(null)).toBe(false);
      expect(isScope(undefined)).toBe(false);
      expect(isScope({})).toBe(false);
      expect(isScope({ type: 'invalid' })).toBe(false);
      expect(isScope({ type: 'global', name: 123 })).toBe(false);
    });
  });

  describe('isSymbol', () => {
    it('should return true for valid symbol', () => {
      const symbol = {
        name: 'test',
        type: SymbolType.Function,
        location: {
          filePath: '/test.ts',
          range: {
            start: { line: 1, column: 1, offset: undefined },
            end: { line: 1, column: 10, offset: undefined },
          },
        },
        scope: undefined,
        modifiers: [],
      };
      expect(isSymbol(symbol)).toBe(true);
    });

    it('should return false for invalid symbols', () => {
      expect(isSymbol(null)).toBe(false);
      expect(isSymbol(undefined)).toBe(false);
      expect(isSymbol({})).toBe(false);
      expect(isSymbol({ name: '', type: 'function' })).toBe(false);
      expect(isSymbol({ name: 'test', type: 'invalid' })).toBe(false);
    });
  });

  describe('isReference', () => {
    it('should return true for valid reference', () => {
      const ref = {
        symbol: {
          name: 'test',
          type: SymbolType.Function,
          location: {
            filePath: '/test.ts',
            range: {
              start: { line: 1, column: 1, offset: undefined },
              end: { line: 1, column: 10, offset: undefined },
            },
          },
          modifiers: [],
        },
        location: {
          filePath: '/other.ts',
          range: {
            start: { line: 5, column: 1, offset: undefined },
            end: { line: 5, column: 10, offset: undefined },
          },
        },
        type: ReferenceType.Usage,
      };
      expect(isReference(ref)).toBe(true);
    });

    it('should return false for invalid references', () => {
      expect(isReference(null)).toBe(false);
      expect(isReference(undefined)).toBe(false);
      expect(isReference({})).toBe(false);
    });
  });

  describe('isDependency', () => {
    it('should return true for valid dependency', () => {
      expect(isDependency({
        path: './utils',
        type: DependencyType.Import,
        isRelative: true,
        importedSymbols: ['foo'],
      })).toBe(true);
    });

    it('should return false for invalid dependencies', () => {
      expect(isDependency(null)).toBe(false);
      expect(isDependency(undefined)).toBe(false);
      expect(isDependency({})).toBe(false);
      expect(isDependency({ path: '', type: 'import' })).toBe(false);
      expect(isDependency({ path: 'test', type: 'invalid' })).toBe(false);
      expect(isDependency({ path: 'test', type: 'import', isRelative: 'yes' })).toBe(false);
    });
  });

  describe('getScopeDepth', () => {
    it('should return 0 for scope without parent', () => {
      const scope = createScope('global');
      expect(getScopeDepth(scope)).toBe(0);
    });

    it('should return correct depth for nested scopes', () => {
      const global = createScope('global');
      const module = createScope('module', 'myModule', global);
      const classScope = createScope('class', 'MyClass', module);
      const func = createScope('function', 'myMethod', classScope);

      expect(getScopeDepth(global)).toBe(0);
      expect(getScopeDepth(module)).toBe(1);
      expect(getScopeDepth(classScope)).toBe(2);
      expect(getScopeDepth(func)).toBe(3);
    });
  });

  describe('isSameScope', () => {
    const location = createLocation(
      '/test.ts',
      createRange(createPosition(1, 1), createPosition(1, 10))
    );

    it('should return true for symbols without scope', () => {
      const symbol1 = createSymbol('foo', SymbolType.Function, location);
      const symbol2 = createSymbol('bar', SymbolType.Function, location);
      expect(isSameScope(symbol1, symbol2)).toBe(true);
    });

    it('should return true for symbols with same scope reference', () => {
      const scope = createScope('class', 'MyClass');
      const symbol1 = createSymbol('foo', SymbolType.Function, location, scope);
      const symbol2 = createSymbol('bar', SymbolType.Function, location, scope);
      expect(isSameScope(symbol1, symbol2)).toBe(true);
    });

    it('should return false when one symbol has scope and other does not', () => {
      const scope = createScope('class', 'MyClass');
      const symbol1 = createSymbol('foo', SymbolType.Function, location, scope);
      const symbol2 = createSymbol('bar', SymbolType.Function, location);
      expect(isSameScope(symbol1, symbol2)).toBe(false);
    });

    it('should return false for different scope references', () => {
      const scope1 = createScope('class', 'MyClass1');
      const scope2 = createScope('class', 'MyClass2');
      const symbol1 = createSymbol('foo', SymbolType.Function, location, scope1);
      const symbol2 = createSymbol('bar', SymbolType.Function, location, scope2);
      expect(isSameScope(symbol1, symbol2)).toBe(false);
    });
  });

  describe('getScopePath', () => {
    it('should return path for single scope', () => {
      const scope = createScope('global');
      expect(getScopePath(scope)).toEqual(['global']);
    });

    it('should return path with names when available', () => {
      const global = createScope('global');
      const module = createScope('module', 'myModule', global);
      const classScope = createScope('class', 'MyClass', module);

      expect(getScopePath(classScope)).toEqual(['global', 'myModule', 'MyClass']);
    });

    it('should use type when name is not available', () => {
      const global = createScope('global');
      const block = createScope('block', undefined, global);

      expect(getScopePath(block)).toEqual(['global', 'block']);
    });
  });
});

// ============================================================================
// AST Types Tests
// ============================================================================

describe('AST Types', () => {
  // Helper to create valid range and position
  const createValidRange = (startLine: number, startCol: number, endLine: number, endCol: number) =>
    createRange(createPosition(startLine, startCol), createPosition(endLine, endCol));

  describe('createASTNode', () => {
    it('should create a valid AST node', () => {
      const range = createValidRange(1, 1, 10, 20);
      const node = createASTNode('FunctionDeclaration', range);

      expect(node.type).toBe('FunctionDeclaration');
      expect(node.range).toBe(range);
      expect(node.properties).toEqual({});
      expect(node.children).toEqual([]);
      expect(node.parent).toBeUndefined();
    });

    it('should create node with properties', () => {
      const range = createValidRange(1, 1, 10, 20);
      const node = createASTNode('FunctionDeclaration', range, { name: 'foo', async: true });

      expect(node.properties.name).toBe('foo');
      expect(node.properties.async).toBe(true);
    });

    it('should create node with children', () => {
      const parentRange = createValidRange(1, 1, 10, 20);
      const childRange = createValidRange(2, 1, 5, 10);

      const child = createASTNode('Identifier', childRange, { name: 'x' });
      const parent = createASTNode('VariableDeclaration', parentRange, {}, [child]);

      expect(parent.children.length).toBe(1);
      expect(parent.children[0].type).toBe('Identifier');
    });

    it('should set parent relationships for children', () => {
      const parentRange = createValidRange(1, 1, 10, 20);
      const childRange = createValidRange(2, 1, 5, 10);

      const child = createASTNode('Identifier', childRange);
      const parent = createASTNode('VariableDeclaration', parentRange, {}, [child]);

      expect(parent.children[0].parent).toBe(parent);
    });

    it('should throw error for empty type', () => {
      const range = createValidRange(1, 1, 10, 20);
      expect(() => createASTNode('', range)).toThrow('ASTNode 類型不能為空');
      expect(() => createASTNode('   ', range)).toThrow('ASTNode 類型不能為空');
    });

    it('should throw error when child range is outside parent range', () => {
      const parentRange = createValidRange(5, 1, 10, 20);
      const childRange = createValidRange(1, 1, 3, 10); // Before parent

      const child = createASTNode('Identifier', childRange);
      expect(() => createASTNode('VariableDeclaration', parentRange, {}, [child]))
        .toThrow('子節點範圍必須在父節點範圍內');
    });
  });

  describe('createASTMetadata', () => {
    it('should create valid metadata', () => {
      const metadata = createASTMetadata('typescript', '4.9.5');

      expect(metadata.language).toBe('typescript');
      expect(metadata.version).toBe('4.9.5');
      expect(metadata.parserOptions).toEqual({});
      expect(metadata.nodeCount).toBe(0);
    });

    it('should create metadata with parser options', () => {
      const metadata = createASTMetadata('typescript', '4.9.5', { jsx: true, strict: true });

      expect(metadata.parserOptions.jsx).toBe(true);
      expect(metadata.parserOptions.strict).toBe(true);
    });

    it('should create metadata with parse time', () => {
      const metadata = createASTMetadata('typescript', '4.9.5', {}, 100);

      expect(metadata.parseTime).toBe(100);
    });

    it('should use Date.now() when parseTime is 0', () => {
      const before = Date.now();
      const metadata = createASTMetadata('typescript', '4.9.5', {}, 0);
      const after = Date.now();

      expect(metadata.parseTime).toBeGreaterThanOrEqual(before);
      expect(metadata.parseTime).toBeLessThanOrEqual(after);
    });

    it('should throw error for empty language', () => {
      expect(() => createASTMetadata('', '1.0')).toThrow('語言名稱不能為空');
      expect(() => createASTMetadata('   ', '1.0')).toThrow('語言名稱不能為空');
    });

    it('should throw error for empty version', () => {
      expect(() => createASTMetadata('typescript', '')).toThrow('版本號不能為空');
      expect(() => createASTMetadata('typescript', '   ')).toThrow('版本號不能為空');
    });
  });

  describe('createAST', () => {
    it('should create valid AST', () => {
      const range = createValidRange(1, 1, 10, 20);
      const root = createASTNode('Program', range);
      const metadata = createASTMetadata('typescript', '4.9.5');

      const ast = createAST('/path/to/file.ts', root, metadata);

      expect(ast.sourceFile).toBe('/path/to/file.ts');
      expect(ast.root).toBe(root);
      expect(ast.metadata.language).toBe('typescript');
    });

    it('should calculate node count', () => {
      const parentRange = createValidRange(1, 1, 10, 20);
      const child1Range = createValidRange(2, 1, 3, 10);
      const child2Range = createValidRange(4, 1, 5, 10);

      const child1 = createASTNode('Identifier', child1Range);
      const child2 = createASTNode('Identifier', child2Range);
      const root = createASTNode('Program', parentRange, {}, [child1, child2]);
      const metadata = createASTMetadata('typescript', '4.9.5');

      const ast = createAST('/file.ts', root, metadata);

      expect(ast.metadata.nodeCount).toBe(3); // root + 2 children
    });

    it('should throw error for empty source file', () => {
      const range = createValidRange(1, 1, 10, 20);
      const root = createASTNode('Program', range);
      const metadata = createASTMetadata('typescript', '4.9.5');

      expect(() => createAST('', root, metadata)).toThrow('原始檔案名稱不能為空');
      expect(() => createAST('   ', root, metadata)).toThrow('原始檔案名稱不能為空');
    });
  });

  describe('isASTNode', () => {
    it('should return true for valid AST node', () => {
      const node = {
        type: 'FunctionDeclaration',
        range: {
          start: { line: 1, column: 1, offset: undefined },
          end: { line: 10, column: 20, offset: undefined },
        },
        properties: {},
        children: [],
      };
      expect(isASTNode(node)).toBe(true);
    });

    it('should return false for invalid AST nodes', () => {
      expect(isASTNode(null)).toBe(false);
      expect(isASTNode(undefined)).toBe(false);
      expect(isASTNode({})).toBeFalsy();
      expect(isASTNode({ type: '' })).toBeFalsy();
      expect(isASTNode({ type: 'Node', range: {} })).toBeFalsy();
    });
  });

  describe('isASTMetadata', () => {
    it('should return true for valid metadata', () => {
      const metadata = {
        language: 'typescript',
        version: '4.9.5',
        parserOptions: {},
        parseTime: 100,
        nodeCount: 50,
      };
      expect(isASTMetadata(metadata)).toBe(true);
    });

    it('should return false for invalid metadata', () => {
      expect(isASTMetadata(null)).toBe(false);
      expect(isASTMetadata(undefined)).toBe(false);
      expect(isASTMetadata({})).toBe(false);
      expect(isASTMetadata({ language: '' })).toBe(false);
      expect(isASTMetadata({ language: 'ts', version: '' })).toBe(false);
    });
  });

  describe('isAST', () => {
    it('should return true for valid AST', () => {
      const ast = {
        sourceFile: '/path/to/file.ts',
        root: {
          type: 'Program',
          range: {
            start: { line: 1, column: 1, offset: undefined },
            end: { line: 10, column: 20, offset: undefined },
          },
          properties: {},
          children: [],
        },
        metadata: {
          language: 'typescript',
          version: '4.9.5',
          parserOptions: {},
          parseTime: 100,
          nodeCount: 1,
        },
      };
      expect(isAST(ast)).toBe(true);
    });

    it('should return false for invalid AST', () => {
      expect(isAST(null)).toBe(false);
      expect(isAST(undefined)).toBe(false);
      expect(isAST({})).toBe(false);
      expect(isAST({ sourceFile: '' })).toBe(false);
    });
  });

  describe('findNodeByPosition', () => {
    it('should find node at exact position', () => {
      const parentRange = createValidRange(1, 1, 10, 20);
      const childRange = createValidRange(2, 5, 2, 15);

      const child = createASTNode('Identifier', childRange, { name: 'x' });
      const root = createASTNode('Program', parentRange, {}, [child]);
      const metadata = createASTMetadata('typescript', '4.9.5');
      const ast = createAST('/file.ts', root, metadata);

      const found = findNodeByPosition(ast, createPosition(2, 10));

      expect(found).not.toBeNull();
      expect(found?.type).toBe('Identifier');
    });

    it('should find deepest node at position', () => {
      const rootRange = createValidRange(1, 1, 20, 20);
      const funcRange = createValidRange(2, 1, 10, 10);
      const identRange = createValidRange(2, 10, 2, 15);

      const ident = createASTNode('Identifier', identRange, { name: 'foo' });
      const func = createASTNode('FunctionDeclaration', funcRange, {}, [ident]);
      const root = createASTNode('Program', rootRange, {}, [func]);
      const metadata = createASTMetadata('typescript', '4.9.5');
      const ast = createAST('/file.ts', root, metadata);

      const found = findNodeByPosition(ast, createPosition(2, 12));

      expect(found?.type).toBe('Identifier');
    });

    it('should return null for position outside AST', () => {
      const range = createValidRange(1, 1, 10, 20);
      const root = createASTNode('Program', range);
      const metadata = createASTMetadata('typescript', '4.9.5');
      const ast = createAST('/file.ts', root, metadata);

      const found = findNodeByPosition(ast, createPosition(100, 1));

      expect(found).toBeNull();
    });

    it('should return root when position is not in any child', () => {
      const rootRange = createValidRange(1, 1, 20, 20);
      const childRange = createValidRange(5, 1, 10, 10);

      const child = createASTNode('FunctionDeclaration', childRange);
      const root = createASTNode('Program', rootRange, {}, [child]);
      const metadata = createASTMetadata('typescript', '4.9.5');
      const ast = createAST('/file.ts', root, metadata);

      // Position in root but not in child
      const found = findNodeByPosition(ast, createPosition(2, 1));

      expect(found?.type).toBe('Program');
    });
  });

  describe('findNodesByType', () => {
    it('should find all nodes of specified type', () => {
      const rootRange = createValidRange(1, 1, 20, 20);
      const id1Range = createValidRange(2, 1, 2, 5);
      const id2Range = createValidRange(3, 1, 3, 5);
      const funcRange = createValidRange(5, 1, 10, 10);

      const id1 = createASTNode('Identifier', id1Range, { name: 'x' });
      const id2 = createASTNode('Identifier', id2Range, { name: 'y' });
      const func = createASTNode('FunctionDeclaration', funcRange);
      const root = createASTNode('Program', rootRange, {}, [id1, id2, func]);
      const metadata = createASTMetadata('typescript', '4.9.5');
      const ast = createAST('/file.ts', root, metadata);

      const found = findNodesByType(ast, 'Identifier');

      expect(found.length).toBe(2);
      expect(found[0].properties.name).toBe('x');
      expect(found[1].properties.name).toBe('y');
    });

    it('should find nested nodes', () => {
      const rootRange = createValidRange(1, 1, 20, 20);
      const funcRange = createValidRange(2, 1, 10, 10);
      const idRange = createValidRange(2, 5, 2, 10);

      const id = createASTNode('Identifier', idRange);
      const func = createASTNode('FunctionDeclaration', funcRange, {}, [id]);
      const root = createASTNode('Program', rootRange, {}, [func]);
      const metadata = createASTMetadata('typescript', '4.9.5');
      const ast = createAST('/file.ts', root, metadata);

      const found = findNodesByType(ast, 'Identifier');

      expect(found.length).toBe(1);
    });

    it('should return empty array when no matching nodes', () => {
      const range = createValidRange(1, 1, 10, 20);
      const root = createASTNode('Program', range);
      const metadata = createASTMetadata('typescript', '4.9.5');
      const ast = createAST('/file.ts', root, metadata);

      const found = findNodesByType(ast, 'NonExistentType');

      expect(found).toEqual([]);
    });
  });

  describe('getNodePath', () => {
    it('should return path for root node', () => {
      const range = createValidRange(1, 1, 10, 20);
      const root = createASTNode('Program', range);

      expect(getNodePath(root)).toEqual(['Program']);
    });

    it('should return full path for nested node', () => {
      const rootRange = createValidRange(1, 1, 20, 20);
      const funcRange = createValidRange(2, 1, 10, 10);
      const idRange = createValidRange(2, 5, 2, 10);

      const id = createASTNode('Identifier', idRange);
      const func = createASTNode('FunctionDeclaration', funcRange, {}, [id]);
      createASTNode('Program', rootRange, {}, [func]);

      // Get the actual child node which has parent set
      const idParent = func.children[0].parent;
      if (!idParent) {throw new Error('Parent not set');}
      const funcParent = idParent.parent;
      if (!funcParent) {throw new Error('Parent not set');}
      const actualFunc = funcParent.children[0];
      const actualId = actualFunc.children[0];

      expect(getNodePath(actualId)).toEqual(['Program', 'FunctionDeclaration', 'Identifier']);
    });
  });

  describe('getNodeDepth', () => {
    it('should return 0 for root node', () => {
      const range = createValidRange(1, 1, 10, 20);
      const root = createASTNode('Program', range);

      expect(getNodeDepth(root)).toBe(0);
    });

    it('should return correct depth for nested nodes', () => {
      const rootRange = createValidRange(1, 1, 20, 20);
      const funcRange = createValidRange(2, 1, 10, 10);
      const idRange = createValidRange(2, 5, 2, 10);

      const id = createASTNode('Identifier', idRange);
      const func = createASTNode('FunctionDeclaration', funcRange, {}, [id]);
      const root = createASTNode('Program', rootRange, {}, [func]);

      // Get the actual nested nodes which have parent relationships
      const actualFunc = root.children[0];
      const actualId = actualFunc.children[0];

      expect(getNodeDepth(root)).toBe(0);
      expect(getNodeDepth(actualFunc)).toBe(1);
      expect(getNodeDepth(actualId)).toBe(2);
    });
  });

  describe('isNodeAncestorOf', () => {
    it('should return true when node is ancestor', () => {
      const rootRange = createValidRange(1, 1, 20, 20);
      const funcRange = createValidRange(2, 1, 10, 10);
      const idRange = createValidRange(2, 5, 2, 10);

      const id = createASTNode('Identifier', idRange);
      const func = createASTNode('FunctionDeclaration', funcRange, {}, [id]);
      const root = createASTNode('Program', rootRange, {}, [func]);

      const actualFunc = root.children[0];
      const actualId = actualFunc.children[0];

      expect(isNodeAncestorOf(root, actualId)).toBe(true);
      expect(isNodeAncestorOf(actualFunc, actualId)).toBe(true);
    });

    it('should return false when node is not ancestor', () => {
      const rootRange = createValidRange(1, 1, 20, 20);
      const funcRange = createValidRange(2, 1, 10, 10);
      const idRange = createValidRange(2, 5, 2, 10);

      const id = createASTNode('Identifier', idRange);
      const func = createASTNode('FunctionDeclaration', funcRange, {}, [id]);
      const root = createASTNode('Program', rootRange, {}, [func]);

      const actualFunc = root.children[0];
      const actualId = actualFunc.children[0];

      expect(isNodeAncestorOf(actualId, root)).toBe(false);
      expect(isNodeAncestorOf(actualId, actualFunc)).toBe(false);
    });

    it('should return false for unrelated nodes', () => {
      const range1 = createValidRange(1, 1, 5, 10);
      const range2 = createValidRange(1, 1, 10, 20);

      const node1 = createASTNode('Identifier', range1);
      const node2 = createASTNode('Program', range2);

      expect(isNodeAncestorOf(node1, node2)).toBe(false);
    });

    it('should return false for same node', () => {
      const range = createValidRange(1, 1, 10, 20);
      const node = createASTNode('Program', range);

      expect(isNodeAncestorOf(node, node)).toBe(false);
    });
  });
});
