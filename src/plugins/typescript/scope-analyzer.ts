/**
 * TypeScript 作用域分析器
 *
 * 提供 AST 節點作用域分析功能，包括：
 * - 符號引用檢查
 * - 作用域判斷
 * - 遮蔽檢測
 */

import * as ts from 'typescript';
import { ReferenceType } from '@shared/types/index.js';
import type { TypeScriptSymbol } from './types.js';
import { findNearestLexicalDeclarationName } from './lexical-scope-binding.js';

/**
 * 作用域分析器
 */
export class ScopeAnalyzer {
  /**
   * 節點作用域容器快取
   * 使用 WeakMap 避免記憶體洩漏，當節點被 GC 時自動清理
   */
  private readonly scopeContainerCache = new WeakMap<ts.Node, ts.Node>();

  /**
   * 從符號節點取得標識符
   */
  public getIdentifierFromSymbolNode(node: ts.Node): ts.Identifier | null {
    // 如果本身就是 Identifier，直接返回
    if (ts.isIdentifier(node)) {
      return node;
    }

    // 對於變數宣告，標識符在 name 屬性中
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 解構 BindingElement（`const { dead, live } = x`）：本地綁定名在 name
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於函式宣告，標識符在 name 屬性中
    if (ts.isFunctionDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於類別宣告
    if (ts.isClassDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於方法宣告
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於屬性宣告
    if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於參數
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於介面宣告
    if (ts.isInterfaceDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於型別別名宣告
    if (ts.isTypeAliasDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於列舉宣告
    if (ts.isEnumDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於命名空間宣告
    if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於 Get/Set 存取器
    if ((ts.isGetAccessor(node) || ts.isSetAccessor(node)) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於型別參數（泛型）
    if (ts.isTypeParameterDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於介面/型別的屬性簽名
    if (ts.isPropertySignature(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    // 對於方法簽名
    if (ts.isMethodSignature(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    return null;
  }

  /**
   * 取得節點的作用域識別字串
   */
  public getNodeScope(node: ts.Node): string {
    let current = node.parent;
    while (current) {
      if (
        ts.isFunctionDeclaration(current)
        || ts.isMethodDeclaration(current)
        || ts.isArrowFunction(current)
        || ts.isFunctionExpression(current)
      ) {
        return `function_${current.pos}_${current.end}`;
      }
      if (
        ts.isBlock(current)
        && current.parent
        && (ts.isIfStatement(current.parent)
          || ts.isForStatement(current.parent)
          || ts.isWhileStatement(current.parent))
      ) {
        return `block_${current.pos}_${current.end}`;
      }
      current = current.parent;
    }
    return 'global';
  }

  /**
   * 檢查節點是否與符號在相同作用域（使用快取）
   */
  public isInSameScope(node: ts.Node, symbolNode: ts.Node): boolean {
    // 使用快取的 getScopeContainer
    const symbolScope = this.getScopeContainer(symbolNode);
    const nodeScope = this.getScopeContainer(node);

    // 檢查是否為相同作用域或在作用域鏈中
    if (nodeScope === symbolScope) {
      return true;
    }

    return this.isInScopeChain(node, symbolScope);
  }

  /**
   * 檢查節點是否為作用域節點
   */
  public isScopeNode(node: ts.Node): boolean {
    return (
      ts.isFunctionDeclaration(node)
      || ts.isMethodDeclaration(node)
      || ts.isArrowFunction(node)
      || ts.isFunctionExpression(node)
      || ts.isBlock(node)
      || ts.isSourceFile(node)
    );
  }

  /**
   * 檢查節點是否為指定符號的引用
   */
  public isReferenceToSymbol(node: ts.Node, symbol: TypeScriptSymbol): boolean {
    if (!ts.isIdentifier(node)) {
      return false;
    }

    const name = node.text;
    if (name !== symbol.name) {
      return false;
    }

    // 找到符號的標識符節點
    const symbolIdentifier = this.getIdentifierFromSymbolNode(symbol.tsNode);
    if (!symbolIdentifier) {
      return false;
    }

    // 檢查是否為相同符號的引用
    // 1. 如果是符號的定義位置本身
    if (node === symbolIdentifier) {
      return true;
    }

    // 2. 對於型別宣告（類別、介面、型別別名等），檢查是否在型別位置使用
    if (
      ts.isClassDeclaration(symbol.tsNode)
      || ts.isInterfaceDeclaration(symbol.tsNode)
      || ts.isTypeAliasDeclaration(symbol.tsNode)
      || ts.isEnumDeclaration(symbol.tsNode)
    ) {
      // 對於型別，只要名稱相同就是引用（在同一個檔案中）
      if (node.getSourceFile() === symbolIdentifier.getSourceFile()) {
        return true;
      }
    }

    // 3. 檢查是否在同一個檔案中
    if (node.getSourceFile() !== symbolIdentifier.getSourceFile()) {
      return false;
    }

    // 4. 對於變數、函式和方法，使用作用域檢查
    const symbolScope = this.getScopeContainer(symbolIdentifier);
    const nodeScope = this.getScopeContainer(node);

    // 檢查是否在相同作用域或符號的子作用域內
    if (nodeScope === symbolScope || this.isInScopeChain(node, symbolScope)) {
      // 檢查是否被遮蔽（同名變數在更內層作用域）
      if (!this.isShadowed(node, symbolIdentifier)) {
        return true;
      }
    }

    // 5. 對於頂層函式和變數，放寬檢查條件
    // 如果符號在頂層作用域（SourceFile），則同一檔案中所有同名標識符都可能是引用
    if (ts.isSourceFile(symbolScope) && !this.isShadowed(node, symbolIdentifier)) {
      return true;
    }

    return false;
  }

  /**
   * 取得引用類型
   */
  public getReferenceType(
    node: ts.Node,
    symbol: TypeScriptSymbol,
    isDeclarationNode: (node: ts.Node) => boolean
  ): ReferenceType {
    // 找到符號的標識符節點
    const symbolIdentifier = this.getIdentifierFromSymbolNode(symbol.tsNode);

    // 如果是符號的原始定義位置
    if (node === symbolIdentifier) {
      return ReferenceType.Definition;
    }

    // 檢查是否為宣告（例如函式參數、變數宣告等）
    if (isDeclarationNode(node.parent)) {
      return ReferenceType.Declaration;
    }

    // 檢查是否在 import 語句內
    if (this.isInImportStatement(node)) {
      return ReferenceType.Import;
    }

    // 否則為使用
    return ReferenceType.Usage;
  }

  /**
   * 檢查節點是否位於 import 語句內
   */
  public isInImportStatement(node: ts.Node): boolean {
    let current = node.parent;
    while (current) {
      if (ts.isImportDeclaration(current) || ts.isImportEqualsDeclaration(current)) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * 取得節點的作用域容器（帶快取）
   */
  public getScopeContainer(node: ts.Node): ts.Node {
    // 檢查快取
    const cached = this.scopeContainerCache.get(node);
    if (cached) {
      return cached;
    }

    // 向上遍歷尋找作用域容器
    let current = node.parent;
    while (current) {
      if (
        ts.isFunctionDeclaration(current)
        || ts.isFunctionExpression(current)
        || ts.isArrowFunction(current)
        || ts.isMethodDeclaration(current)
        || ts.isConstructorDeclaration(current)
        || ts.isBlock(current)
        || ts.isSourceFile(current)
      ) {
        // 快取結果
        this.scopeContainerCache.set(node, current);
        return current;
      }
      current = current.parent;
    }

    // 回退到 SourceFile
    const sourceFile = node.getSourceFile();
    this.scopeContainerCache.set(node, sourceFile);
    return sourceFile;
  }

  /**
   * 檢查節點是否在指定作用域鏈內
   */
  public isInScopeChain(node: ts.Node, scopeContainer: ts.Node): boolean {
    let current = node.parent;
    while (current) {
      if (current === scopeContainer) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * 檢查符號是否被遮蔽
   *
   * 委派 lexical-scope-binding 的詞法綁定模型（涵蓋參數、for-of/for-in/for、
   * catch、解構 BindingElement、case block、TDZ 可見性等），避免此處手寫
   * 子集與引用過濾家族的遮蔽判定分叉。
   */
  public isShadowed(node: ts.Node, originalIdentifier: ts.Identifier): boolean {
    if (!ts.isIdentifier(node) || node.text !== originalIdentifier.text) {
      return false;
    }

    const sourceFile = node.getSourceFile();
    const nearest = findNearestLexicalDeclarationName(sourceFile, node, originalIdentifier.text);
    if (!nearest) {
      return false;
    }

    // 最近可見綁定就是原始定義本身 → 未被遮蔽
    if (nearest === originalIdentifier) {
      return false;
    }

    // 同一識別符位置（跨 AST 實例仍可比 offset）→ 同一綁定
    if (nearest.getStart(sourceFile) === originalIdentifier.getStart(sourceFile)) {
      return false;
    }

    // 最近綁定是更內層／更近的另一個同名宣告 → 遮蔽
    return true;
  }
}

/**
 * 建立作用域分析器實例
 */
export function createScopeAnalyzer(): ScopeAnalyzer {
  return new ScopeAnalyzer();
}
