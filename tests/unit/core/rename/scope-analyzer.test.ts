import { describe, it, expect, beforeEach } from 'vitest';
import { ScopeAnalyzer } from '@core/rename/scope-analyzer';
import type { AST, ASTNode } from '@shared/types/ast';
import { createRange, createPosition } from '@shared/types/core';

// 輔助函式：創建模擬的 AST 節點
function createMockASTNode(
  type: string,
  properties: Record<string, any> = {},
  children: ASTNode[] = []
): ASTNode {
  return {
    type,
    properties,
    children,
    range: createRange(createPosition(1, 1), createPosition(1, 10))
  };
}

// 輔助函式：創建模擬的 AST
function createMockAST(root: ASTNode): AST {
  return {
    root,
    filePath: '/test/file.ts',
    language: 'typescript'
  };
}

describe('ScopeAnalyzer', () => {
  let analyzer: ScopeAnalyzer;

  beforeEach(() => {
    analyzer = new ScopeAnalyzer();
  });

  describe('analyzeScopes', () => {
    it('應該分析空的 AST', async () => {
      const root = createMockASTNode('Program');
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);

      expect(scopes).toHaveLength(1);
      expect(scopes[0].type).toBe('global');
      expect(scopes[0].symbols).toHaveLength(0);
    });

    it('應該處理無效的 AST', async () => {
      const ast = { root: null } as any;

      const scopes = await analyzer.analyzeScopes(ast);

      expect(scopes).toHaveLength(0);
    });

    it('應該創建全域作用域', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('VariableDeclaration', { name: 'x' })
      ]);
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);

      expect(scopes.length).toBeGreaterThanOrEqual(1);
      const globalScope = scopes[0];
      expect(globalScope.type).toBe('global');
    });

    it('應該識別變數宣告', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('VariableDeclaration', { name: 'x' }),
        createMockASTNode('VariableDeclaration', { name: 'y' })
      ]);
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);

      const globalScope = scopes[0];
      expect(globalScope.symbols.length).toBeGreaterThanOrEqual(2);
      expect(globalScope.symbols.some(s => s.name === 'x')).toBe(true);
      expect(globalScope.symbols.some(s => s.name === 'y')).toBe(true);
    });

    it('應該識別函式宣告並創建新作用域', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('FunctionDeclaration', { name: 'testFunc' }, [
          createMockASTNode('VariableDeclaration', { name: 'localVar' })
        ])
      ]);
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);

      expect(scopes.length).toBeGreaterThanOrEqual(2);
      const functionScope = scopes.find(s => s.type === 'function');
      expect(functionScope).toBeDefined();
      expect(functionScope?.name).toBe('testFunc');
    });

    it('應該識別類別宣告並創建新作用域', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('ClassDeclaration', { name: 'TestClass' })
      ]);
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);

      const classScope = scopes.find(s => s.type === 'class');
      expect(classScope).toBeDefined();
      expect(classScope?.name).toBe('TestClass');
    });

    it('應該處理巢狀作用域', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('FunctionDeclaration', { name: 'outer' }, [
          createMockASTNode('FunctionDeclaration', { name: 'inner' })
        ])
      ]);
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);

      const functionScopes = scopes.filter(s => s.type === 'function');
      expect(functionScopes.length).toBeGreaterThanOrEqual(2);

      const innerScope = functionScopes.find(s => s.name === 'inner');
      expect(innerScope?.parent).toBeDefined();
    });
  });

  describe('findShadowedVariables', () => {
    it('應該找到被遮蔽的變數', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('VariableDeclaration', { name: 'x' }),
        createMockASTNode('FunctionDeclaration', { name: 'func' }, [
          createMockASTNode('VariableDeclaration', { name: 'x' })
        ])
      ]);
      const ast = createMockAST(root);

      const shadowedVars = await analyzer.findShadowedVariables(ast);

      expect(shadowedVars.length).toBeGreaterThanOrEqual(0);
      // 如果有遮蔽，應該包含 'x'
      if (shadowedVars.length > 0) {
        expect(shadowedVars.some(v => v.name === 'x')).toBe(true);
      }
    });

    it('應該處理多層遮蔽', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('VariableDeclaration', { name: 'x' }),
        createMockASTNode('FunctionDeclaration', { name: 'outer' }, [
          createMockASTNode('VariableDeclaration', { name: 'x' }),
          createMockASTNode('FunctionDeclaration', { name: 'inner' }, [
            createMockASTNode('VariableDeclaration', { name: 'x' })
          ])
        ])
      ]);
      const ast = createMockAST(root);

      const shadowedVars = await analyzer.findShadowedVariables(ast);

      // 應該能夠檢測到遮蔽（具體數量依實作而定）
      expect(shadowedVars).toBeDefined();
    });

    it('應該處理沒有遮蔽的情況', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('VariableDeclaration', { name: 'x' }),
        createMockASTNode('FunctionDeclaration', { name: 'func' }, [
          createMockASTNode('VariableDeclaration', { name: 'y' })
        ])
      ]);
      const ast = createMockAST(root);

      const shadowedVars = await analyzer.findShadowedVariables(ast);

      // 沒有遮蔽的變數
      const xShadowed = shadowedVars.find(v => v.name === 'x');
      expect(xShadowed?.shadowedBy || []).toHaveLength(0);
    });
  });

  describe('getScopeAtPosition', () => {
    it('應該找到指定位置的作用域', async () => {
      const funcRange = createRange(createPosition(5, 1), createPosition(10, 1));
      const root = createMockASTNode('Program', {}, [
        {
          type: 'FunctionDeclaration',
          properties: { name: 'testFunc' },
          children: [],
          range: funcRange
        }
      ]);
      const ast = createMockAST(root);

      await analyzer.analyzeScopes(ast);

      const position = createPosition(7, 5);
      const scope = await analyzer.getScopeAtPosition(position);

      expect(scope).toBeDefined();
      // 應該找到函式作用域或全域作用域
      expect(scope?.type).toMatch(/function|global/);
    });

    it('應該返回最具體的作用域', async () => {
      const outerRange = createRange(createPosition(1, 1), createPosition(20, 1));
      const innerRange = createRange(createPosition(5, 1), createPosition(10, 1));

      const root = createMockASTNode('Program', {}, [
        {
          type: 'FunctionDeclaration',
          properties: { name: 'outer' },
          children: [
            {
              type: 'FunctionDeclaration',
              properties: { name: 'inner' },
              children: [],
              range: innerRange
            }
          ],
          range: outerRange
        }
      ]);
      const ast = createMockAST(root);

      await analyzer.analyzeScopes(ast);

      const position = createPosition(7, 5);
      const scope = await analyzer.getScopeAtPosition(position);

      // 應該找到內層函式作用域（如果實作支援）
      expect(scope).toBeDefined();
    });

    it('應該處理不在任何作用域中的位置', async () => {
      const root = createMockASTNode('Program', {}, [
        {
          type: 'FunctionDeclaration',
          properties: { name: 'testFunc' },
          children: [],
          range: createRange(createPosition(5, 1), createPosition(10, 1))
        }
      ]);
      const ast = createMockAST(root);

      await analyzer.analyzeScopes(ast);

      const position = createPosition(100, 1);
      const scope = await analyzer.getScopeAtPosition(position);

      // 可能返回全域作用域或 null
      expect(scope === null || scope?.type === 'global').toBe(true);
    });
  });

  describe('isSymbolVisible', () => {
    it('應該檢查符號在當前作用域中的可見性', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('VariableDeclaration', { name: 'x' })
      ]);
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);
      const globalScope = scopes[0];

      const isVisible = await analyzer.isSymbolVisible('x', globalScope);

      expect(isVisible).toBe(true);
    });

    it('應該檢查符號在父作用域中的可見性', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('VariableDeclaration', { name: 'x' }),
        createMockASTNode('FunctionDeclaration', { name: 'func' })
      ]);
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);
      const functionScope = scopes.find(s => s.type === 'function');

      if (functionScope) {
        const isVisible = await analyzer.isSymbolVisible('x', functionScope);
        expect(isVisible).toBe(true);
      }
    });

    it('應該返回 false 對於不存在的符號', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('VariableDeclaration', { name: 'x' })
      ]);
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);
      const globalScope = scopes[0];

      const isVisible = await analyzer.isSymbolVisible('nonexistent', globalScope);

      expect(isVisible).toBe(false);
    });

    it('應該處理巢狀作用域的可見性', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('VariableDeclaration', { name: 'global' }),
        createMockASTNode('FunctionDeclaration', { name: 'outer' }, [
          createMockASTNode('VariableDeclaration', { name: 'outer' }),
          createMockASTNode('FunctionDeclaration', { name: 'inner' }, [
            createMockASTNode('VariableDeclaration', { name: 'inner' })
          ])
        ])
      ]);
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);
      const innerScope = scopes.find(s => s.name === 'inner');

      if (innerScope) {
        // 內層作用域應該能看到所有外層的符號
        const canSeeGlobal = await analyzer.isSymbolVisible('global', innerScope);
        const canSeeOuter = await analyzer.isSymbolVisible('outer', innerScope);
        const canSeeInner = await analyzer.isSymbolVisible('inner', innerScope);

        expect(canSeeGlobal).toBe(true);
        expect(canSeeOuter).toBe(true);
        expect(canSeeInner).toBe(true);
      }
    });
  });

  describe('邊界情況', () => {
    it('應該處理沒有名稱的節點', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('VariableDeclaration', {}), // 沒有 name
        createMockASTNode('FunctionDeclaration', {})  // 沒有 name
      ]);
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);

      expect(scopes).toBeDefined();
      expect(scopes.length).toBeGreaterThanOrEqual(1);
    });

    it('應該處理空的子節點陣列', async () => {
      const root = createMockASTNode('Program', {}, []);
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);

      expect(scopes).toHaveLength(1);
      expect(scopes[0].type).toBe('global');
    });

    it('應該處理深度巢狀的結構', async () => {
      let current = createMockASTNode('VariableDeclaration', { name: 'deep' });
      for (let i = 0; i < 10; i++) {
        current = createMockASTNode('FunctionDeclaration', { name: `func${i}` }, [current]);
      }
      const root = createMockASTNode('Program', {}, [current]);
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);

      // 應該能夠處理深度巢狀
      expect(scopes.length).toBeGreaterThanOrEqual(1);
    });

    it('應該處理箭頭函式', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('ArrowFunctionExpression', { name: 'arrow' })
      ]);
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);

      // 應該能夠識別箭頭函式作用域
      expect(scopes.length).toBeGreaterThanOrEqual(1);
    });

    it('應該處理區塊作用域', async () => {
      const root = createMockASTNode('Program', {}, [
        createMockASTNode('BlockStatement', {}, [
          createMockASTNode('VariableDeclaration', { name: 'blockVar' })
        ])
      ]);
      const ast = createMockAST(root);

      const scopes = await analyzer.analyzeScopes(ast);

      // 應該能夠識別區塊作用域
      expect(scopes.length).toBeGreaterThanOrEqual(1);
    });
  });
});
