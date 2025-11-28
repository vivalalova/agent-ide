/**
 * Python 符號提取器
 * 從 AST 中提取 class、function、variable 等符號
 */

import type { Symbol, Scope, Location } from '@shared/types/index.js';
import { SymbolType, createSymbol, createScope } from '@shared/types/index.js';
import {
  type PythonASTNode,
  type PythonAST,
  PythonNodeKind,
  PYTHON_SYMBOL_TYPE_MAP
} from './types.js';
import { traverseAST, getNodeText, getFieldNode } from './tree-sitter-bridge.js';

/**
 * Python 符號提取器類別
 */
export class PythonSymbolExtractor {
  /**
   * 從 AST 提取所有符號
   */
  async extractSymbols(ast: PythonAST): Promise<Symbol[]> {
    const symbols: Symbol[] = [];
    const globalScope = createScope('module', ast.sourceFile);

    this.visitNode(ast.root, symbols, globalScope, ast.sourceFile);

    return symbols;
  }

  /**
   * 遞歸訪問節點並提取符號
   */
  private visitNode(
    node: PythonASTNode,
    symbols: Symbol[],
    scope: Scope,
    filePath: string
  ): void {
    switch (node.pythonKind) {
      case PythonNodeKind.ClassDefinition:
        this.extractClassSymbol(node, symbols, scope, filePath);
        break;

      case PythonNodeKind.FunctionDefinition:
      case PythonNodeKind.AsyncFunctionDefinition:
        this.extractFunctionSymbol(node, symbols, scope, filePath);
        break;

      case PythonNodeKind.DecoratedDefinition:
        this.handleDecoratedDefinition(node, symbols, scope, filePath);
        break;

      case PythonNodeKind.Assignment:
      case PythonNodeKind.AnnotatedAssignment:
        this.extractVariableSymbols(node, symbols, scope, filePath);
        break;

      case PythonNodeKind.GlobalStatement:
      case PythonNodeKind.NonlocalStatement:
        // 這些語句不創建新符號，只是引用現有符號
        break;

      default:
        // 遞歸處理子節點
        this.visitChildren(node, symbols, scope, filePath);
    }
  }

  /**
   * 訪問子節點
   */
  private visitChildren(
    node: PythonASTNode,
    symbols: Symbol[],
    scope: Scope,
    filePath: string
  ): void {
    for (const child of node.children) {
      this.visitNode(child as PythonASTNode, symbols, scope, filePath);
    }
  }

  /**
   * 提取類別符號
   */
  private extractClassSymbol(
    node: PythonASTNode,
    symbols: Symbol[],
    scope: Scope,
    filePath: string
  ): void {
    const name = this.getNodeName(node);
    if (!name) {return;}

    const modifiers = this.extractClassModifiers(node);
    const superclass = this.extractSuperclass(node);
    const implementsProtocols = this.extractImplementedProtocols(node);
    const decorators = node.decorators as string[] | undefined;

    const location = this.createLocation(node, filePath);
    const symbol = createSymbol(
      name,
      SymbolType.Class,
      location,
      scope,
      modifiers,
      decorators,
      superclass,
      implementsProtocols
    );
    symbols.push(symbol);

    // 創建類別作用域，遞歸處理類別內部
    const classScope = createScope('class', name, scope);
    this.visitClassBody(node, symbols, classScope, filePath);
  }

  /**
   * 提取函式符號
   */
  private extractFunctionSymbol(
    node: PythonASTNode,
    symbols: Symbol[],
    scope: Scope,
    filePath: string
  ): void {
    const name = this.getNodeName(node);
    if (!name) {return;}

    const modifiers = this.extractFunctionModifiers(node);
    const decorators = node.decorators as string[] | undefined;

    const location = this.createLocation(node, filePath);
    const symbol = createSymbol(
      name,
      SymbolType.Function,
      location,
      scope,
      modifiers,
      decorators
    );
    symbols.push(symbol);

    // 提取函式參數
    this.extractParameters(node, symbols, scope, filePath);

    // 創建函式作用域，遞歸處理函式內部
    const funcScope = createScope('function', name, scope);
    this.visitFunctionBody(node, symbols, funcScope, filePath);
  }

  /**
   * 處理帶裝飾器的定義
   */
  private handleDecoratedDefinition(
    node: PythonASTNode,
    symbols: Symbol[],
    scope: Scope,
    filePath: string
  ): void {
    // 收集裝飾器
    const decorators = node.decorators || [];

    // 找到被裝飾的定義（class 或 function）
    for (const child of node.children) {
      const childNode = child as PythonASTNode;
      if (
        childNode.pythonKind === PythonNodeKind.ClassDefinition
        || childNode.pythonKind === PythonNodeKind.FunctionDefinition
        || childNode.pythonKind === PythonNodeKind.AsyncFunctionDefinition
      ) {
        // 將裝飾器傳遞給子節點
        const decoratedNode: PythonASTNode = {
          ...childNode,
          decorators: decorators as readonly string[]
        };

        if (childNode.pythonKind === PythonNodeKind.ClassDefinition) {
          this.extractClassSymbol(decoratedNode, symbols, scope, filePath);
        } else {
          this.extractFunctionSymbol(decoratedNode, symbols, scope, filePath);
        }
        return;
      }
    }
  }

  /**
   * 提取變數符號
   */
  private extractVariableSymbols(
    node: PythonASTNode,
    symbols: Symbol[],
    scope: Scope,
    filePath: string
  ): void {
    // 獲取賦值左側的目標
    const targets = this.getAssignmentTargets(node);

    for (const target of targets) {
      const name = target.name;
      if (!name || this.isPrivateOrDunder(name)) {continue;}

      const modifiers = this.extractVariableModifiers(node, name);
      const location = this.createLocation(target.node || node, filePath);

      // 判斷是常量還是變數
      const symbolType = this.isConstant(name) ? SymbolType.Constant : SymbolType.Variable;

      const symbol = createSymbol(
        name,
        symbolType,
        location,
        scope,
        modifiers
      );
      symbols.push(symbol);
    }
  }

  /**
   * 提取函式參數
   */
  private extractParameters(
    funcNode: PythonASTNode,
    symbols: Symbol[],
    scope: Scope,
    filePath: string
  ): void {
    const parametersNode = this.findChildByKind(funcNode, PythonNodeKind.Parameters);
    if (!parametersNode) {return;}

    for (const child of parametersNode.children) {
      const childNode = child as PythonASTNode;
      const paramName = this.extractParameterName(childNode);

      if (paramName && !this.isSpecialParameter(paramName)) {
        const location = this.createLocation(childNode, filePath);
        const symbol = createSymbol(
          paramName,
          SymbolType.Variable,
          location,
          scope,
          ['parameter']
        );
        symbols.push(symbol);
      }
    }
  }

  /**
   * 訪問類別主體
   */
  private visitClassBody(
    classNode: PythonASTNode,
    symbols: Symbol[],
    scope: Scope,
    filePath: string
  ): void {
    const bodyNode = this.findChildByKind(classNode, PythonNodeKind.Block);
    if (!bodyNode) {return;}

    for (const child of bodyNode.children) {
      this.visitNode(child as PythonASTNode, symbols, scope, filePath);
    }
  }

  /**
   * 訪問函式主體
   */
  private visitFunctionBody(
    funcNode: PythonASTNode,
    symbols: Symbol[],
    scope: Scope,
    filePath: string
  ): void {
    const bodyNode = this.findChildByKind(funcNode, PythonNodeKind.Block);
    if (!bodyNode) {return;}

    for (const child of bodyNode.children) {
      this.visitNode(child as PythonASTNode, symbols, scope, filePath);
    }
  }

  /**
   * 獲取節點名稱
   */
  private getNodeName(node: PythonASTNode): string | undefined {
    const nameNode = getFieldNode(node, 'name');
    if (nameNode) {
      return getNodeText(nameNode);
    }

    // 嘗試從 properties 獲取
    if (node.properties.name) {
      return node.properties.name as string;
    }

    return undefined;
  }

  /**
   * 提取類別修飾符
   */
  private extractClassModifiers(node: PythonASTNode): string[] {
    const modifiers: string[] = [];
    const decorators = node.decorators || [];

    // 檢查常見的類別裝飾器
    if (decorators.includes('abstractmethod') || decorators.includes('abc.abstractmethod')) {
      modifiers.push('abstract');
    }
    if (decorators.includes('dataclass') || decorators.includes('dataclasses.dataclass')) {
      modifiers.push('dataclass');
    }
    if (decorators.includes('final') || decorators.includes('typing.final')) {
      modifiers.push('final');
    }

    return modifiers;
  }

  /**
   * 提取函式修飾符
   */
  private extractFunctionModifiers(node: PythonASTNode): string[] {
    const modifiers: string[] = [];

    // async 函式
    if (node.pythonKind === PythonNodeKind.AsyncFunctionDefinition) {
      modifiers.push('async');
    }

    const decorators = node.decorators || [];

    // 檢查常見的函式裝飾器
    if (decorators.includes('staticmethod')) {
      modifiers.push('static');
    }
    if (decorators.includes('classmethod')) {
      modifiers.push('classmethod');
    }
    if (decorators.includes('property')) {
      modifiers.push('property');
    }
    if (decorators.includes('abstractmethod') || decorators.includes('abc.abstractmethod')) {
      modifiers.push('abstract');
    }

    return modifiers;
  }

  /**
   * 提取變數修飾符
   */
  private extractVariableModifiers(node: PythonASTNode, name: string): string[] {
    const modifiers: string[] = [];

    // 檢查是否為常量（全大寫）
    if (this.isConstant(name)) {
      modifiers.push('const');
    }

    // 檢查是否有型別註解
    if (node.pythonKind === PythonNodeKind.AnnotatedAssignment) {
      modifiers.push('typed');
    }

    return modifiers;
  }

  /**
   * 提取父類別
   */
  private extractSuperclass(node: PythonASTNode): string | undefined {
    const superclassesNode = node.treeSitterNode.childForFieldName('superclasses');
    if (!superclassesNode) {return undefined;}

    // 取第一個父類別
    const firstArg = superclassesNode.namedChild(0);
    if (firstArg) {
      return firstArg.text;
    }

    return undefined;
  }

  /**
   * 提取實現的協議/介面
   */
  private extractImplementedProtocols(node: PythonASTNode): string[] | undefined {
    const superclassesNode = node.treeSitterNode.childForFieldName('superclasses');
    if (!superclassesNode) {return undefined;}

    const protocols: string[] = [];
    for (let i = 1; i < superclassesNode.namedChildCount; i++) {
      const child = superclassesNode.namedChild(i);
      if (child) {
        protocols.push(child.text);
      }
    }

    return protocols.length > 0 ? protocols : undefined;
  }

  /**
   * 獲取賦值目標
   */
  private getAssignmentTargets(node: PythonASTNode): Array<{ name: string; node?: PythonASTNode }> {
    const targets: Array<{ name: string; node?: PythonASTNode }> = [];

    // 尋找賦值左側
    const leftNode = node.treeSitterNode.childForFieldName('left');
    if (leftNode) {
      // 簡單變數賦值
      if (leftNode.type === 'identifier') {
        targets.push({ name: leftNode.text });
      }
      // 元組解包
      else if (leftNode.type === 'pattern_list' || leftNode.type === 'tuple_pattern') {
        for (let i = 0; i < leftNode.namedChildCount; i++) {
          const child = leftNode.namedChild(i);
          if (child?.type === 'identifier') {
            targets.push({ name: child.text });
          }
        }
      }
    }

    // annotated_assignment 的情況
    const nameNode = node.treeSitterNode.childForFieldName('name');
    if (nameNode?.type === 'identifier') {
      targets.push({ name: nameNode.text });
    }

    return targets;
  }

  /**
   * 提取參數名稱
   */
  private extractParameterName(node: PythonASTNode): string | undefined {
    const nodeType = node.pythonKind;

    switch (nodeType) {
      case PythonNodeKind.Identifier:
        return getNodeText(node);

      case PythonNodeKind.Parameter:
      case PythonNodeKind.TypedParameter:
      case PythonNodeKind.DefaultParameter:
      case PythonNodeKind.TypedDefaultParameter: {
        const nameNode = node.treeSitterNode.childForFieldName('name');
        return nameNode?.text;
      }

      case PythonNodeKind.ListSplatPattern:
      case PythonNodeKind.DictionarySplatPattern: {
        // *args, **kwargs
        const child = node.treeSitterNode.namedChild(0);
        return child?.text;
      }

      default:
        return undefined;
    }
  }

  /**
   * 查找指定類型的子節點
   */
  private findChildByKind(node: PythonASTNode, kind: PythonNodeKind): PythonASTNode | undefined {
    for (const child of node.children) {
      const childNode = child as PythonASTNode;
      if (childNode.pythonKind === kind) {
        return childNode;
      }
    }
    return undefined;
  }

  /**
   * 創建位置資訊
   */
  private createLocation(node: PythonASTNode, filePath: string): Location {
    return {
      filePath,
      range: node.range
    };
  }

  /**
   * 檢查是否為常量（全大寫命名）
   */
  private isConstant(name: string): boolean {
    return /^[A-Z][A-Z0-9_]*$/.test(name);
  }

  /**
   * 檢查是否為私有或 dunder 名稱
   */
  private isPrivateOrDunder(name: string): boolean {
    // 跳過 _single_leading_underscore 和 __double_leading_underscore
    // 但保留 __dunder__ 方法
    return name.startsWith('_') && !name.endsWith('_');
  }

  /**
   * 檢查是否為特殊參數
   */
  private isSpecialParameter(name: string): boolean {
    return name === 'self' || name === 'cls';
  }
}

/**
 * 創建符號提取器實例
 */
export function createSymbolExtractor(): PythonSymbolExtractor {
  return new PythonSymbolExtractor();
}
