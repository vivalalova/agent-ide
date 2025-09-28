/**
 * TypeScript Symbol Extractor
 * 從 TypeScript AST 中提取符號資訊
 */

import * as ts from 'typescript';
import type {
  Symbol,
  Scope,
  ScopeType
} from '../../shared/types';
import {
  SymbolType,
  createSymbol,
  createScope
} from '../../shared/types';
import {
  TypeScriptAST,
  TypeScriptASTNode,
  TypeScriptSymbol,
  SYMBOL_TYPE_MAP,
  getNodeName,
  getNodeModifiers,
  tsNodeToRange,
  isSymbolDeclaration
} from './types';

/**
 * TypeScript 符號提取器類別
 */
export class TypeScriptSymbolExtractor {
  private symbols: TypeScriptSymbol[] = [];
  private scopeStack: Scope[] = [];
  private sourceFile!: ts.SourceFile;

  /**
   * 從 AST 中提取所有符號
   */
  async extractSymbols(ast: TypeScriptAST): Promise<Symbol[]> {
    this.symbols = [];
    this.scopeStack = [];
    this.sourceFile = ast.tsSourceFile;

    // 建立全域作用域
    const globalScope = createScope('global');
    this.scopeStack.push(globalScope);

    // 遍歷 AST 提取符號
    this.visitNode(ast.root);

    return [...this.symbols];
  }

  /**
   * 遞歸訪問 AST 節點
   */
  private visitNode(node: TypeScriptASTNode): void {
    const tsNode = node.tsNode;

    // 處理作用域變化
    const scopeChange = this.handleScopeChange(tsNode);

    // 提取符號
    if (isSymbolDeclaration(tsNode)) {
      const symbol = this.extractSymbolFromNode(tsNode);
      if (symbol) {
        this.symbols.push(symbol);
      }
    }

    // 遞歸處理子節點
    for (const child of node.children) {
      this.visitNode(child as TypeScriptASTNode);
    }

    // 恢復作用域
    if (scopeChange) {
      this.scopeStack.pop();
    }
  }

  /**
   * 處理作用域變化
   * 返回是否需要在處理完子節點後恢復作用域
   */
  private handleScopeChange(node: ts.Node): boolean {
    let needsRestore = false;

    if (ts.isSourceFile(node)) {
      // 已經有全域作用域，不需要額外處理
      return false;
    } else if (ts.isModuleDeclaration(node)) {
      const name = getNodeName(node);
      const scope = createScope('namespace', name, this.getCurrentScope());
      this.scopeStack.push(scope);
      needsRestore = true;
    } else if (ts.isClassDeclaration(node)) {
      const name = getNodeName(node);
      const scope = createScope('class', name, this.getCurrentScope());
      this.scopeStack.push(scope);
      needsRestore = true;
    } else if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
      const name = getNodeName(node) || 'constructor';
      const scope = createScope('function', name, this.getCurrentScope());
      this.scopeStack.push(scope);
      needsRestore = true;
    } else if (ts.isBlock(node) && !this.isInsideFunctionOrMethod(node)) {
      const scope = createScope('block', undefined, this.getCurrentScope());
      this.scopeStack.push(scope);
      needsRestore = true;
    }

    return needsRestore;
  }

  /**
   * 獲取當前作用域
   */
  private getCurrentScope(): Scope | undefined {
    return this.scopeStack.length > 0 ? this.scopeStack[this.scopeStack.length - 1] : undefined;
  }

  /**
   * 從節點提取符號
   */
  private extractSymbolFromNode(node: ts.Node): TypeScriptSymbol | null {
    const name = getNodeName(node);
    if (!name) {
      return null;
    }

    const symbolType = this.getSymbolType(node);
    if (!symbolType) {
      return null;
    }

    const range = tsNodeToRange(node, this.sourceFile);
    const location = {
      filePath: this.sourceFile.fileName,
      range
    };

    const modifiers = getNodeModifiers(node);
    const scope = this.getCurrentScope();

    // 處理特殊情況
    this.adjustSymbolForSpecialCases(node, modifiers);

    const symbol: TypeScriptSymbol = {
      name,
      type: symbolType,
      location,
      scope,
      modifiers,
      tsNode: node,
      typeInfo: this.extractTypeInfo(node),
      signature: this.extractSignature(node)
    };

    return symbol;
  }

  /**
   * 獲取符號類型
   */
  private getSymbolType(node: ts.Node): SymbolType | null {
    // 特殊處理優先（在映射表之前）
    if (ts.isVariableDeclaration(node)) {
      // 根據宣告方式決定是變數還是常數
      const parent = node.parent;
      if (ts.isVariableDeclarationList(parent)) {
        // 檢查 VariableDeclarationList 的 flags
        if (parent.flags & ts.NodeFlags.Const) {
          return SymbolType.Constant;
        } else if (parent.flags & ts.NodeFlags.Let) {
          return SymbolType.Variable;
        } else {
          // var 宣告
          return SymbolType.Variable;
        }
      }
      return SymbolType.Variable;
    }

    // 特別處理 namespace（在 TypeScript 中是 ModuleDeclaration）
    if (ts.isModuleDeclaration(node)) {
      // 檢查是否為 namespace 而非 module
      if (node.flags & ts.NodeFlags.Namespace) {
        return SymbolType.Namespace;
      }
      return SymbolType.Module;
    }

    // 使用映射表處理其他類型
    const mappedType = SYMBOL_TYPE_MAP[node.kind];
    if (mappedType) {
      return mappedType;
    }

    if (ts.isParameter(node)) {
      return SymbolType.Variable;
    }

    if (ts.isConstructorDeclaration(node)) {
      return SymbolType.Function;
    }

    // 介面成員
    if (ts.isPropertySignature(node)) {
      return SymbolType.Variable;
    }

    if (ts.isMethodSignature(node)) {
      return SymbolType.Function;
    }

    return null;
  }

  /**
   * 調整特殊情況的符號
   */
  private adjustSymbolForSpecialCases(node: ts.Node, modifiers: string[]): void {
    // 處理可選屬性
    if ('questionToken' in node && (node as any).questionToken) {
      if (!modifiers.includes('optional')) {
        modifiers.push('optional');
      }
    }

    // 處理生成器函式
    if (ts.isFunctionDeclaration(node) && node.asteriskToken) {
      if (!modifiers.includes('generator')) {
        modifiers.push('generator');
      }
    }

    // 處理箭頭函式（儲存在變數中）
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isArrowFunction(node.initializer)) {
        modifiers.push('arrow-function');
      }
    }

    // 處理 export 修飾符
    if (ts.canHaveModifiers(node)) {
      const nodeModifiers = ts.getModifiers(node);
      if (nodeModifiers) {
        const hasExport = nodeModifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        if (hasExport && !modifiers.includes('export')) {
          modifiers.push('export');
        }
      }
    }
  }

  /**
   * 提取型別資訊
   */
  private extractTypeInfo(node: ts.Node): string | undefined {
    if ('type' in node && (node as any).type) {
      const typeNode = (node as any).type as ts.TypeNode;
      return this.typeNodeToString(typeNode);
    }

    // 對於變數宣告，嘗試從初始值推斷
    if (ts.isVariableDeclaration(node) && node.initializer && !node.type) {
      return this.inferTypeFromInitializer(node.initializer);
    }

    return undefined;
  }

  /**
   * 提取函式簽名
   */
  private extractSignature(node: ts.Node): string | undefined {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
      return this.functionNodeToSignature(node);
    }

    if (ts.isConstructorDeclaration(node)) {
      return this.constructorNodeToSignature(node);
    }

    return undefined;
  }

  /**
   * 將型別節點轉換為字串
   */
  private typeNodeToString(typeNode: ts.TypeNode): string {
    switch (typeNode.kind) {
    case ts.SyntaxKind.StringKeyword:
      return 'string';
    case ts.SyntaxKind.NumberKeyword:
      return 'number';
    case ts.SyntaxKind.BooleanKeyword:
      return 'boolean';
    case ts.SyntaxKind.VoidKeyword:
      return 'void';
    case ts.SyntaxKind.AnyKeyword:
      return 'any';
    case ts.SyntaxKind.UnknownKeyword:
      return 'unknown';
    case ts.SyntaxKind.NeverKeyword:
      return 'never';
    default:
      // 對於複雜型別，使用 TypeScript 的 getText()
      return typeNode.getText(this.sourceFile);
    }
  }

  /**
   * 從初始值推斷型別
   */
  private inferTypeFromInitializer(initializer: ts.Expression): string {
    if (ts.isStringLiteral(initializer)) {
      return 'string';
    }
    if (ts.isNumericLiteral(initializer)) {
      return 'number';
    }
    if (initializer.kind === ts.SyntaxKind.TrueKeyword ||
        initializer.kind === ts.SyntaxKind.FalseKeyword) {
      return 'boolean';
    }
    if (ts.isArrayLiteralExpression(initializer)) {
      return 'array';
    }
    if (ts.isObjectLiteralExpression(initializer)) {
      return 'object';
    }
    if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
      return 'function';
    }

    return 'unknown';
  }

  /**
   * 函式節點轉換為簽名字串
   */
  private functionNodeToSignature(node: ts.FunctionDeclaration | ts.MethodDeclaration): string {
    const name = getNodeName(node) || 'anonymous';
    const typeParameters = node.typeParameters ?
      `<${node.typeParameters.map(tp => tp.name.text).join(', ')}>` : '';

    const parameters = node.parameters.map(param => {
      const paramName = param.name.getText(this.sourceFile);
      const paramType = param.type ? `: ${param.type.getText(this.sourceFile)}` : '';
      const optional = param.questionToken ? '?' : '';
      return `${paramName}${optional}${paramType}`;
    }).join(', ');

    const returnType = node.type ? `: ${node.type.getText(this.sourceFile)}` : '';

    return `${name}${typeParameters}(${parameters})${returnType}`;
  }

  /**
   * 檢查節點是否在函式或方法內部
   */
  private isInsideFunctionOrMethod(node: ts.Node): boolean {
    let parent = node.parent;
    while (parent) {
      if (ts.isFunctionDeclaration(parent) ||
          ts.isMethodDeclaration(parent) ||
          ts.isConstructorDeclaration(parent) ||
          ts.isArrowFunction(parent) ||
          ts.isFunctionExpression(parent)) {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  }

  /**
   * 建構子節點轉換為簽名字串
   */
  private constructorNodeToSignature(node: ts.ConstructorDeclaration): string {
    const parameters = node.parameters.map(param => {
      const paramName = param.name.getText(this.sourceFile);
      const paramType = param.type ? `: ${param.type.getText(this.sourceFile)}` : '';
      const optional = param.questionToken ? '?' : '';
      const modifiers = getNodeModifiers(param).join(' ');
      const modifierPrefix = modifiers ? `${modifiers} ` : '';
      return `${modifierPrefix}${paramName}${optional}${paramType}`;
    }).join(', ');

    return `constructor(${parameters})`;
  }
}

/**
 * 創建符號提取器實例
 */
export function createSymbolExtractor(): TypeScriptSymbolExtractor {
  return new TypeScriptSymbolExtractor();
}