/**
 * 作用域分析器測試
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScopeAnalyzer } from '../../../src/core/rename/scope-analyzer';
import { createAST, createASTNode, createASTMetadata } from '../../../src/shared/types/ast';
import { createRange, createPosition } from '../../../src/shared/types/core';
import { createSymbol, SymbolType } from '../../../src/shared/types/symbol';

describe('ScopeAnalyzer', () => {
  let scopeAnalyzer: ScopeAnalyzer;

  beforeEach(() => {
    scopeAnalyzer = new ScopeAnalyzer();
  });

  describe('基本作用域分析', () => {
    it('應該能分析簡單的全域作用域', async () => {
      // Arrange - 建立簡單的 AST
      const root = createASTNode(
        'Program',
        createRange(createPosition(1, 1), createPosition(5, 1)),
        {}
      );

      const ast = createAST(
        '/test/simple.ts',
        root,
        createASTMetadata('typescript', '5.0')
      );

      // Act
      const scopes = await scopeAnalyzer.analyzeScopes(ast);

      // Assert
      expect(scopes).toBeDefined();
      expect(scopes.length).toBeGreaterThan(0);
      expect(scopes[0].type).toBe('global');
    });

    it('應該能分析函式作用域', async () => {
      // Arrange - 建立含函式的 AST
      const funcNode = createASTNode(
        'FunctionDeclaration',
        createRange(createPosition(2, 1), createPosition(4, 1)),
        { name: 'testFunction' }
      );

      const root = createASTNode(
        'Program',
        createRange(createPosition(1, 1), createPosition(5, 1)),
        {},
        [funcNode]
      );

      const ast = createAST(
        '/test/function.ts',
        root,
        createASTMetadata('typescript', '5.0')
      );

      // Act
      const scopes = await scopeAnalyzer.analyzeScopes(ast);

      // Assert
      expect(scopes.length).toBeGreaterThan(1);
      const functionScope = scopes.find(s => s.type === 'function');
      expect(functionScope).toBeDefined();
      expect(functionScope?.name).toBe('testFunction');
    });

    it('應該能分析區塊作用域', async () => {
      // Arrange
      const blockNode = createASTNode(
        'BlockStatement',
        createRange(createPosition(2, 1), createPosition(4, 1)),
        {}
      );

      const root = createASTNode(
        'Program',
        createRange(createPosition(1, 1), createPosition(5, 1)),
        {},
        [blockNode]
      );

      const ast = createAST(
        '/test/block.ts',
        root,
        createASTMetadata('typescript', '5.0')
      );

      // Act
      const scopes = await scopeAnalyzer.analyzeScopes(ast);

      // Assert
      const blockScope = scopes.find(s => s.type === 'block');
      expect(blockScope).toBeDefined();
    });

    it('應該能分析類別作用域', async () => {
      // Arrange
      const classNode = createASTNode(
        'ClassDeclaration',
        createRange(createPosition(2, 1), createPosition(5, 1)),
        { name: 'TestClass' }
      );

      const root = createASTNode(
        'Program',
        createRange(createPosition(1, 1), createPosition(6, 1)),
        {},
        [classNode]
      );

      const ast = createAST(
        '/test/class.ts',
        root,
        createASTMetadata('typescript', '5.0')
      );

      // Act
      const scopes = await scopeAnalyzer.analyzeScopes(ast);

      // Assert
      const classScope = scopes.find(s => s.type === 'class');
      expect(classScope).toBeDefined();
      expect(classScope?.name).toBe('TestClass');
    });
  });

  describe('作用域層次結構', () => {
    it('應該正確建立父子作用域關係', async () => {
      // Arrange - 巢狀函式
      const innerFunc = createASTNode(
        'FunctionDeclaration',
        createRange(createPosition(3, 2), createPosition(5, 2)),
        { name: 'innerFunc' }
      );

      const outerFunc = createASTNode(
        'FunctionDeclaration',
        createRange(createPosition(2, 1), createPosition(6, 1)),
        { name: 'outerFunc' },
        [innerFunc]
      );

      const root = createASTNode(
        'Program',
        createRange(createPosition(1, 1), createPosition(7, 1)),
        {},
        [outerFunc]
      );

      const ast = createAST(
        '/test/nested.ts',
        root,
        createASTMetadata('typescript', '5.0')
      );

      // Act
      const scopes = await scopeAnalyzer.analyzeScopes(ast);

      // Assert
      const outerScope = scopes.find(s => s.name === 'outerFunc');
      const innerScope = scopes.find(s => s.name === 'innerFunc');

      expect(outerScope).toBeDefined();
      expect(innerScope).toBeDefined();
      expect(innerScope?.parent).toBe(outerScope);
    });
  });

  describe('符號可見性檢查', () => {
    it('應該能檢查符號在作用域中的可見性', async () => {
      // Arrange
      const varNode = createASTNode(
        'VariableDeclaration',
        createRange(createPosition(2, 1), createPosition(2, 15)),
        { name: 'testVar' }
      );

      const root = createASTNode(
        'Program',
        createRange(createPosition(1, 1), createPosition(3, 1)),
        {},
        [varNode]
      );

      const ast = createAST(
        '/test/visibility.ts',
        root,
        createASTMetadata('typescript', '5.0')
      );

      // Act
      const scopes = await scopeAnalyzer.analyzeScopes(ast);
      const globalScope = scopes[0];
      const isVisible = await scopeAnalyzer.isSymbolVisible('testVar', globalScope);

      // Assert
      expect(isVisible).toBe(true);
    });

    it('應該能檢測不可見的符號', async () => {
      // Arrange
      const root = createASTNode(
        'Program',
        createRange(createPosition(1, 1), createPosition(3, 1)),
        {}
      );

      const ast = createAST(
        '/test/invisible.ts',
        root,
        createASTMetadata('typescript', '5.0')
      );

      // Act
      const scopes = await scopeAnalyzer.analyzeScopes(ast);
      const globalScope = scopes[0];
      const isVisible = await scopeAnalyzer.isSymbolVisible('nonExistentVar', globalScope);

      // Assert
      expect(isVisible).toBe(false);
    });
  });

  describe('變數遮蔽檢測', () => {
    it('應該能找到被遮蔽的變數', async () => {
      // Arrange - 建立遮蔽變數的 AST
      const outerVar = createASTNode(
        'VariableDeclaration',
        createRange(createPosition(2, 1), createPosition(2, 15)),
        { name: 'shadowed' }
      );

      const innerVar = createASTNode(
        'VariableDeclaration',
        createRange(createPosition(4, 2), createPosition(4, 16)),
        { name: 'shadowed' }
      );

      const blockNode = createASTNode(
        'BlockStatement',
        createRange(createPosition(3, 1), createPosition(5, 1)),
        {},
        [innerVar]
      );

      const root = createASTNode(
        'Program',
        createRange(createPosition(1, 1), createPosition(6, 1)),
        {},
        [outerVar, blockNode]
      );

      const ast = createAST(
        '/test/shadowing.ts',
        root,
        createASTMetadata('typescript', '5.0')
      );

      // Act
      const shadowedVars = await scopeAnalyzer.findShadowedVariables(ast);

      // Assert
      expect(shadowedVars).toBeDefined();
      expect(Array.isArray(shadowedVars)).toBe(true);
    });
  });

  describe('位置查詢', () => {
    it('應該能根據位置找到對應的作用域', async () => {
      // Arrange
      const funcNode = createASTNode(
        'FunctionDeclaration',
        createRange(createPosition(2, 1), createPosition(4, 1)),
        { name: 'testFunc' }
      );

      const root = createASTNode(
        'Program',
        createRange(createPosition(1, 1), createPosition(5, 1)),
        {},
        [funcNode]
      );

      const ast = createAST(
        '/test/position.ts',
        root,
        createASTMetadata('typescript', '5.0')
      );

      // Act
      await scopeAnalyzer.analyzeScopes(ast);
      const scope = await scopeAnalyzer.getScopeAtPosition(createPosition(3, 1));

      // Assert
      expect(scope).toBeDefined();
    });

    it('應該回傳 null 當位置不在任何作用域內', async () => {
      // Arrange
      const root = createASTNode(
        'Program',
        createRange(createPosition(1, 1), createPosition(3, 1)),
        {}
      );

      const ast = createAST(
        '/test/out-of-scope.ts',
        root,
        createASTMetadata('typescript', '5.0')
      );

      // Act
      await scopeAnalyzer.analyzeScopes(ast);
      const scope = await scopeAnalyzer.getScopeAtPosition(createPosition(10, 1));

      // Assert
      expect(scope).toBe(null);
    });
  });

  describe('錯誤處理', () => {
    it('應該能處理空的 AST', async () => {
      // Arrange
      const root = createASTNode(
        'Program',
        createRange(createPosition(1, 1), createPosition(1, 1)),
        {}
      );

      const ast = createAST(
        '/test/empty.ts',
        root,
        createASTMetadata('typescript', '5.0')
      );

      // Act & Assert - 不應該拋出例外
      await expect(scopeAnalyzer.analyzeScopes(ast)).resolves.toBeDefined();
    });
  });

  describe('特殊節點處理', () => {
    it('應該正確處理函式表達式', async () => {
      // Arrange
      const funcExpr = createASTNode(
        'FunctionExpression',
        createRange(createPosition(2, 10), createPosition(4, 1)),
        { name: 'anonymousFunc' }
      );

      const root = createASTNode(
        'Program',
        createRange(createPosition(1, 1), createPosition(5, 1)),
        {},
        [funcExpr]
      );

      const ast = createAST(
        '/test/function-expr.ts',
        root,
        createASTMetadata('typescript', '5.0')
      );

      // Act
      const scopes = await scopeAnalyzer.analyzeScopes(ast);

      // Assert
      const functionScope = scopes.find(s => s.type === 'function');
      expect(functionScope).toBeDefined();
    });

    it('應該正確處理箭頭函式', async () => {
      // Arrange
      const arrowFunc = createASTNode(
        'ArrowFunctionExpression',
        createRange(createPosition(2, 10), createPosition(2, 25)),
        {}
      );

      const root = createASTNode(
        'Program',
        createRange(createPosition(1, 1), createPosition(3, 1)),
        {},
        [arrowFunc]
      );

      const ast = createAST(
        '/test/arrow-func.ts',
        root,
        createASTMetadata('typescript', '5.0')
      );

      // Act
      const scopes = await scopeAnalyzer.analyzeScopes(ast);

      // Assert
      const functionScope = scopes.find(s => s.type === 'function');
      expect(functionScope).toBeDefined();
    });
  });
});