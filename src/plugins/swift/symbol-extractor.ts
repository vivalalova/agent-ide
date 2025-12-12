/**
 * Swift Symbol Extractor
 * 使用 Tree-sitter 從 Swift AST 中提取符號資訊
 */

import type { Tree, QueryCapture, Node } from 'web-tree-sitter';
import type { Symbol, Scope } from '@shared/types/index.js';
import {
  SymbolType,
  createSymbol,
  createScope
} from '@shared/types/index.js';
import { createPosition, createRange, createLocation } from '@shared/types/core.js';
import type { TreeSitterAdapter } from './parser.js';

/** SyntaxNode 型別別名 */
type SyntaxNode = Node;

/**
 * Swift Symbol 擴展介面
 */
export interface SwiftSymbol extends Symbol {
  /** 型別資訊 */
  readonly typeInfo?: string;
  /** 函式簽名 */
  readonly signature?: string;
}

/**
 * Swift 存取控制修飾符
 */
enum SwiftAccessModifier {
  Public = 'public',
  Internal = 'internal',
  Fileprivate = 'fileprivate',
  Private = 'private',
  Open = 'open'
}

/**
 * 符號類型與 Tree-sitter 節點類型的映射
 */
const SWIFT_SYMBOL_TYPE_MAP: Record<string, SymbolType> = {
  class_declaration: SymbolType.Class,
  struct_declaration: SymbolType.Struct,
  enum_declaration: SymbolType.Enum,
  protocol_declaration: SymbolType.Protocol,
  function_declaration: SymbolType.Function,
  typealias_declaration: SymbolType.Type,
  extension_declaration: SymbolType.Class
};

/**
 * Swift 符號提取器類別
 * 使用 Tree-sitter Query 從 Swift AST 提取符號
 */
export class SwiftSymbolExtractor {
  /**
   * Tree-sitter Query 定義
   * 用於匹配各種 Swift 符號宣告
   */
  private static readonly SYMBOL_QUERIES: Record<string, string> = {
    classes: '(class_declaration name: (type_identifier) @name) @class',
    structs: '(struct_declaration name: (type_identifier) @name) @struct',
    protocols: '(protocol_declaration name: (type_identifier) @name) @protocol',
    enums: '(enum_declaration name: (type_identifier) @name) @enum',
    functions: '(function_declaration name: (simple_identifier) @name) @function',
    properties: `(property_declaration
      (pattern (simple_identifier) @name)) @property`,
    constants: `(property_declaration
      (value_binding_pattern "let")
      (pattern (simple_identifier) @name)) @constant`,
    variables: `(property_declaration
      (value_binding_pattern "var")
      (pattern (simple_identifier) @name)) @variable`,
    typealiases: '(typealias_declaration name: (type_identifier) @name) @typealias',
    extensions: '(extension_declaration (user_type (type_identifier) @name)) @extension'
  };

  private symbols: Symbol[] = [];
  private scopeStack: Scope[] = [];
  private filePath = '';
  private adapter: TreeSitterAdapter;

  /**
   * 建構子
   * @param adapter Tree-sitter 適配器
   */
  constructor(adapter: TreeSitterAdapter) {
    this.adapter = adapter;
  }

  /**
   * 從 Tree-sitter AST 中提取所有符號
   * @param tree Tree-sitter 解析後的語法樹
   * @param filePath 檔案路徑
   * @returns 提取的符號陣列
   */
  async extractSymbols(tree: Tree, filePath: string): Promise<Symbol[]> {
    this.symbols = [];
    this.scopeStack = [];
    this.filePath = filePath;

    // 建立全域作用域
    const globalScope = createScope('global');
    this.scopeStack.push(globalScope);

    // 使用 Query 提取各種符號
    await this.extractSymbolsWithQueries(tree);

    // 遍歷 AST 處理作用域和補充資訊
    this.visitNode(tree.rootNode);

    return [...this.symbols];
  }

  /**
   * 使用 Tree-sitter Query 提取符號
   * @param tree 語法樹
   */
  private async extractSymbolsWithQueries(tree: Tree): Promise<void> {
    for (const [symbolCategory, queryString] of Object.entries(SwiftSymbolExtractor.SYMBOL_QUERIES)) {
      try {
        const query = await this.adapter.createQuery(queryString);
        const captures = query.captures(tree.rootNode);

        this.processQueryCaptures(captures, symbolCategory);
      } catch {
        // Query 可能因語法樹結構不匹配而失敗，繼續處理其他查詢
        continue;
      }
    }
  }

  /**
   * 處理 Query 捕獲的結果
   * @param captures Query 捕獲的節點
   * @param symbolCategory 符號類別
   */
  private processQueryCaptures(captures: QueryCapture[], symbolCategory: string): void {
    const processedNodes = new Set<number>();

    for (const capture of captures) {
      const { node, name: captureName } = capture;

      // 只處理名稱節點，避免重複
      if (captureName !== 'name') {
        continue;
      }

      // 避免重複處理同一節點
      const nodeId = node.startIndex;
      if (processedNodes.has(nodeId)) {
        continue;
      }
      processedNodes.add(nodeId);

      const symbol = this.createSymbolFromCapture(node, symbolCategory);
      if (symbol) {
        this.symbols.push(symbol);
      }
    }
  }

  /**
   * 從 Query 捕獲建立符號
   * @param nameNode 名稱節點
   * @param symbolCategory 符號類別
   * @returns 符號物件或 null
   */
  private createSymbolFromCapture(nameNode: SyntaxNode, symbolCategory: string): Symbol | null {
    const name = nameNode.text;
    if (!name) {
      return null;
    }

    // 找到父節點（宣告節點）
    const declarationNode = nameNode.parent;
    if (!declarationNode) {
      return null;
    }

    const symbolType = this.getSymbolTypeFromCategory(symbolCategory, declarationNode);
    if (!symbolType) {
      return null;
    }

    const location = this.createLocationFromNode(declarationNode);
    const modifiers = this.extractModifiers(declarationNode);
    const attributes = this.extractAttributes(declarationNode);
    const scope = this.getCurrentScope();

    // 提取繼承資訊
    const { superclass, implementsProtocols } = this.extractInheritance(declarationNode);

    return createSymbol(
      name,
      symbolType,
      location,
      scope,
      modifiers,
      attributes.length > 0 ? attributes : undefined,
      superclass,
      implementsProtocols.length > 0 ? implementsProtocols : undefined
    );
  }

  /**
   * 從符號類別取得 SymbolType
   * @param category 符號類別
   * @param node 宣告節點
   * @returns SymbolType 或 null
   */
  private getSymbolTypeFromCategory(category: string, node: SyntaxNode): SymbolType | null {
    // 根據類別映射
    const categoryMap: Record<string, SymbolType> = {
      classes: SymbolType.Class,
      structs: SymbolType.Struct,
      protocols: SymbolType.Protocol,
      enums: SymbolType.Enum,
      functions: SymbolType.Function,
      properties: SymbolType.Property,
      constants: SymbolType.Constant,
      variables: SymbolType.Variable,
      typealiases: SymbolType.Type,
      extensions: SymbolType.Class
    };

    // 優先使用類別映射
    if (categoryMap[category]) {
      return categoryMap[category];
    }

    // 備用：從節點類型映射
    return SWIFT_SYMBOL_TYPE_MAP[node.type] || null;
  }

  /**
   * 從節點建立 Location
   * @param node 語法節點
   * @returns Location 物件
   */
  private createLocationFromNode(node: SyntaxNode): ReturnType<typeof createLocation> {
    const startPosition = createPosition(
      node.startPosition.row + 1,
      node.startPosition.column + 1,
      node.startIndex
    );
    const endPosition = createPosition(
      node.endPosition.row + 1,
      node.endPosition.column + 1,
      node.endIndex
    );
    const range = createRange(startPosition, endPosition);

    return createLocation(this.filePath, range);
  }

  /**
   * 提取存取控制修飾符
   * @param node 宣告節點
   * @returns 修飾符陣列
   */
  private extractModifiers(node: SyntaxNode): string[] {
    const modifiers: string[] = [];

    // 搜尋 modifiers 節點
    const modifiersNode = node.childForFieldName('modifiers');
    if (modifiersNode) {
      for (let i = 0; i < modifiersNode.childCount; i++) {
        const child = modifiersNode.child(i);
        if (!child) {continue;}
        const modifierText = child.text.toLowerCase();
        if (this.isAccessModifier(modifierText)) {
          modifiers.push(modifierText);
        } else if (this.isOtherModifier(modifierText)) {
          modifiers.push(modifierText);
        }
      }
    }

    // 直接搜尋子節點中的修飾符
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child || child.type !== 'modifiers') {continue;}
      for (let j = 0; j < child.childCount; j++) {
        const modifierChild = child.child(j);
        if (!modifierChild) {continue;}
        const modifierText = modifierChild.text.toLowerCase();
        if (!modifiers.includes(modifierText)) {
          if (this.isAccessModifier(modifierText) || this.isOtherModifier(modifierText)) {
            modifiers.push(modifierText);
          }
        }
      }
    }

    return modifiers;
  }

  /**
   * 檢查是否為存取控制修飾符
   * @param modifier 修飾符文字
   * @returns 是否為存取控制修飾符
   */
  private isAccessModifier(modifier: string): boolean {
    return Object.values(SwiftAccessModifier).includes(modifier as SwiftAccessModifier);
  }

  /**
   * 檢查是否為其他修飾符
   * @param modifier 修飾符文字
   * @returns 是否為其他修飾符
   */
  private isOtherModifier(modifier: string): boolean {
    const otherModifiers = [
      'static', 'class', 'final', 'lazy', 'weak', 'unowned',
      'override', 'mutating', 'nonmutating', 'convenience',
      'required', 'optional', 'dynamic', 'indirect', 'async',
      'throws', 'rethrows', 'nonisolated'
    ];
    return otherModifiers.includes(modifier);
  }

  /**
   * 提取屬性（Attributes）
   * @param node 宣告節點
   * @returns 屬性陣列
   */
  private extractAttributes(node: SyntaxNode): string[] {
    const attributes: string[] = [];

    // 搜尋 attribute 節點
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child || child.type !== 'attribute') {continue;}
      const attributeName = this.getAttributeName(child);
      if (attributeName) {
        attributes.push(attributeName);
      }
    }

    return attributes;
  }

  /**
   * 取得屬性名稱
   * @param attributeNode 屬性節點
   * @returns 屬性名稱
   */
  private getAttributeName(attributeNode: SyntaxNode): string | null {
    // 屬性格式: @AttributeName 或 @AttributeName(...)
    const text = attributeNode.text;
    const match = text.match(/@(\w+)/);
    return match ? match[1] : null;
  }

  /**
   * 提取繼承資訊
   * @param node 宣告節點
   * @returns 父類別和實作的協定
   */
  private extractInheritance(node: SyntaxNode): { superclass?: string; implementsProtocols: string[] } {
    const implementsProtocols: string[] = [];
    let superclass: string | undefined;

    // 搜尋 inheritance_clause
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child || child.type !== 'type_inheritance_clause') {continue;}
      for (let j = 0; j < child.childCount; j++) {
        const inheritedType = child.child(j);
        if (!inheritedType) {continue;}
        if (inheritedType.type === 'type_identifier' || inheritedType.type === 'user_type') {
          const typeName = this.getTypeName(inheritedType);
          if (typeName) {
            // 第一個類型可能是父類別（對於 class）或協定
            if (!superclass && node.type === 'class_declaration') {
              superclass = typeName;
            } else {
              implementsProtocols.push(typeName);
            }
          }
        }
      }
    }

    return { superclass, implementsProtocols };
  }

  /**
   * 取得類型名稱
   * @param typeNode 類型節點
   * @returns 類型名稱
   */
  private getTypeName(typeNode: SyntaxNode): string | null {
    if (typeNode.type === 'type_identifier') {
      return typeNode.text;
    }
    if (typeNode.type === 'user_type') {
      const identifier = typeNode.childForFieldName('name');
      return identifier?.text || typeNode.text;
    }
    return null;
  }

  /**
   * 遞歸訪問 AST 節點處理作用域
   * @param node 語法節點
   */
  private visitNode(node: SyntaxNode): void {
    const scopeChange = this.handleScopeChange(node);

    // 遞歸處理子節點
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.visitNode(child);
      }
    }

    // 恢復作用域
    if (scopeChange) {
      this.scopeStack.pop();
    }
  }

  /**
   * 處理作用域變化
   * @param node 語法節點
   * @returns 是否需要在處理完子節點後恢復作用域
   */
  private handleScopeChange(node: SyntaxNode): boolean {
    const scopeTypes: Record<string, 'class' | 'function' | 'namespace'> = {
      class_declaration: 'class',
      struct_declaration: 'class',
      enum_declaration: 'class',
      protocol_declaration: 'class',
      extension_declaration: 'class',
      function_declaration: 'function',
      closure_expression: 'function'
    };

    const scopeType = scopeTypes[node.type];
    if (scopeType) {
      const name = this.getNodeName(node);
      const scope = createScope(scopeType, name || undefined, this.getCurrentScope());
      this.scopeStack.push(scope);
      return true;
    }

    return false;
  }

  /**
   * 取得節點名稱
   * @param node 語法節點
   * @returns 節點名稱
   */
  private getNodeName(node: SyntaxNode): string | null {
    // 嘗試從 name 欄位取得
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      return nameNode.text;
    }

    // 對於某些節點類型，直接搜尋子節點
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && (child.type === 'type_identifier' || child.type === 'simple_identifier')) {
        return child.text;
      }
    }

    return null;
  }

  /**
   * 獲取當前作用域
   * @returns 當前作用域
   */
  private getCurrentScope(): Scope | undefined {
    return this.scopeStack.length > 0
      ? this.scopeStack[this.scopeStack.length - 1]
      : undefined;
  }
}

/**
 * 創建符號提取器實例
 * @param adapter Tree-sitter 適配器
 * @returns SwiftSymbolExtractor 實例
 */
export function createSwiftSymbolExtractor(adapter: TreeSitterAdapter): SwiftSymbolExtractor {
  return new SwiftSymbolExtractor(adapter);
}
