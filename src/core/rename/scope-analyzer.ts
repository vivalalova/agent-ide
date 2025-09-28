/**
 * 作用域分析器實作
 * 負責分析程式碼的作用域結構和符號可見性
 */

import { AST, ASTNode } from '@shared/types/ast';
import { Position, Range } from '@shared/types/core';
import { Symbol, SymbolType, createSymbol } from '@shared/types/symbol';
import { ScopeAnalysisResult, ShadowedVariable, ShadowInfo } from './types';
import { createLocation, isPositionInRange } from '@shared/types/core';

/**
 * 作用域分析器類別
 */
export class ScopeAnalyzer {
  private currentScopes: ScopeAnalysisResult[] = [];
  private symbolTable = new Map<string, Symbol[]>();

  /**
   * 分析 AST 的作用域結構
   */
  async analyzeScopes(ast: AST): Promise<ScopeAnalysisResult[]> {
    this.currentScopes = [];
    this.symbolTable.clear();

    // 檢查 AST 是否有效
    if (!ast || !ast.root) {
      // 返回空的作用域列表
      return [];
    }

    // 建立全域作用域
    const globalScope: ScopeAnalysisResult = {
      type: 'global',
      symbols: [],
      range: ast.root.range || {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 0 }
      }
    };

    this.currentScopes.push(globalScope);

    // 遞歸分析 AST 節點
    await this.analyzeNode(ast.root, globalScope);

    return this.currentScopes;
  }

  /**
   * 尋找被遮蔽的變數
   */
  async findShadowedVariables(ast: AST): Promise<ShadowedVariable[]> {
    const scopes = await this.analyzeScopes(ast);
    const shadowedVars: ShadowedVariable[] = [];

    // 檢查每個作用域的符號
    for (const scope of scopes) {
      for (const symbol of scope.symbols) {
        const shadows = this.findShadowingSymbols(symbol, scopes, scope);
        if (shadows.length > 0) {
          const existing = shadowedVars.find(sv => sv.name === symbol.name);
          if (existing) {
            (existing.shadowedBy as ShadowInfo[]).push(...shadows);
          } else {
            shadowedVars.push({
              name: symbol.name,
              originalSymbol: symbol,
              shadowedBy: shadows
            });
          }
        }
      }
    }

    return shadowedVars;
  }

  /**
   * 根據位置取得對應的作用域
   */
  async getScopeAtPosition(position: Position): Promise<ScopeAnalysisResult | null> {
    // 找到包含該位置的最具體的作用域
    let targetScope: ScopeAnalysisResult | null = null;
    let bestDepth = -1;

    for (const scope of this.currentScopes) {
      if (isPositionInRange(position, scope.range)) {
        const depth = this.getScopeDepth(scope);
        if (depth > bestDepth) {
          bestDepth = depth;
          targetScope = scope;
        }
      }
    }

    return targetScope;
  }

  /**
   * 檢查符號在特定作用域中是否可見
   */
  async isSymbolVisible(symbolName: string, scope: ScopeAnalysisResult): Promise<boolean> {
    // 檢查當前作用域
    if (scope.symbols.some(s => s.name === symbolName)) {
      return true;
    }

    // 檢查父作用域（向上遍歷）
    let currentScope = scope.parent;
    while (currentScope) {
      if (currentScope.symbols.some(s => s.name === symbolName)) {
        return true;
      }
      currentScope = currentScope.parent;
    }

    return false;
  }

  /**
   * 遞歸分析 AST 節點
   */
  private async analyzeNode(node: ASTNode, parentScope: ScopeAnalysisResult): Promise<void> {
    let currentScope = parentScope;

    // 函式宣告需要特殊處理：函式名加到父作用域，但參數和內容在新作用域
    if (node.type === 'FunctionDeclaration') {
      // 把函式名加到父作用域
      const symbol = this.createSymbolFromNode(node);
      if (symbol) {
        (parentScope.symbols as Symbol[]).push(symbol);
        this.addToSymbolTable(symbol);
      }

      // 建立函式作用域
      currentScope = this.createScope(node, parentScope);
      this.currentScopes.push(currentScope);
    } else if (this.shouldCreateScope(node)) {
      // 其他類型的作用域
      currentScope = this.createScope(node, parentScope);
      this.currentScopes.push(currentScope);
    } else if (this.isSymbolDefinition(node)) {
      // 一般符號定義
      const symbol = this.createSymbolFromNode(node);
      if (symbol) {
        (currentScope.symbols as Symbol[]).push(symbol);
        this.addToSymbolTable(symbol);
      }
    }

    // 遞歸處理子節點
    for (const child of node.children) {
      await this.analyzeNode(child, currentScope);
    }
  }

  /**
   * 檢查是否應該為節點建立新的作用域
   */
  private shouldCreateScope(node: ASTNode): boolean {
    const scopeTypes = [
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
      'BlockStatement',
      'ClassDeclaration'
    ];
    return scopeTypes.includes(node.type);
  }

  /**
   * 為節點建立作用域
   */
  private createScope(node: ASTNode, parent: ScopeAnalysisResult): ScopeAnalysisResult {
    const scopeType = this.getScopeType(node.type);
    const name = node.properties.name as string | undefined;

    return {
      type: scopeType,
      name,
      parent,
      symbols: [],
      range: node.range
    };
  }

  /**
   * 取得作用域類型
   */
  private getScopeType(nodeType: string): string {
    const typeMap: Record<string, string> = {
      'FunctionDeclaration': 'function',
      'FunctionExpression': 'function',
      'ArrowFunctionExpression': 'function',
      'ClassDeclaration': 'class',
      'BlockStatement': 'block'
    };

    return typeMap[nodeType] || 'block';
  }

  /**
   * 檢查是否為符號定義
   */
  private isSymbolDefinition(node: ASTNode): boolean {
    const definitionTypes = [
      'VariableDeclaration',
      'FunctionDeclaration',
      'ClassDeclaration',
      'Parameter'
    ];
    return definitionTypes.includes(node.type);
  }

  /**
   * 從 AST 節點建立符號
   */
  private createSymbolFromNode(node: ASTNode): Symbol | null {
    const name = node.properties.name as string;
    if (!name) {return null;}

    const symbolType = this.getSymbolType(node.type);
    const location = createLocation('/test/file.ts', node.range); // 暫時使用測試檔案路徑

    return createSymbol(name, symbolType, location);
  }

  /**
   * 取得符號類型
   */
  private getSymbolType(nodeType: string): SymbolType {
    const typeMap: Record<string, SymbolType> = {
      'VariableDeclaration': SymbolType.Variable,
      'FunctionDeclaration': SymbolType.Function,
      'ClassDeclaration': SymbolType.Class,
      'Parameter': SymbolType.Variable
    };

    return typeMap[nodeType] || SymbolType.Variable;
  }

  /**
   * 添加符號到符號表
   */
  private addToSymbolTable(symbol: Symbol): void {
    const existing = this.symbolTable.get(symbol.name) || [];
    existing.push(symbol);
    this.symbolTable.set(symbol.name, existing);
  }

  /**
   * 找到遮蔽指定符號的其他符號
   */
  private findShadowingSymbols(
    symbol: Symbol,
    allScopes: ScopeAnalysisResult[],
    symbolScope: ScopeAnalysisResult
  ): ShadowInfo[] {
    const shadows: ShadowInfo[] = [];

    for (const scope of allScopes) {
      // 跳過符號所在的作用域
      if (scope === symbolScope) {continue;}

      // 檢查是否為子作用域（會遮蔽父作用域的符號）
      if (this.isChildScope(scope, symbolScope)) {
        const shadowingSymbol = scope.symbols.find(s => s.name === symbol.name);
        if (shadowingSymbol) {
          shadows.push({
            symbol: shadowingSymbol,
            scope
          });
        }
      }
    }

    return shadows;
  }

  /**
   * 檢查是否為子作用域
   */
  private isChildScope(child: ScopeAnalysisResult, parent: ScopeAnalysisResult): boolean {
    let currentParent = child.parent;
    while (currentParent) {
      if (currentParent === parent) {
        return true;
      }
      currentParent = currentParent.parent;
    }
    return false;
  }

  /**
   * 取得作用域深度
   */
  private getScopeDepth(scope: ScopeAnalysisResult): number {
    let depth = 0;
    let current = scope.parent;
    while (current) {
      depth++;
      current = current.parent;
    }
    return depth;
  }
}