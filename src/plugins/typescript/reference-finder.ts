/**
 * TypeScript 引用查找工具
 * 處理符號引用判斷和引用類型分類
 */

import * as ts from 'typescript';
import { ReferenceType } from '../../shared/types/index.js';
import { TypeScriptSymbol } from './types.js';
import { getIdentifierFromSymbolNode, isDeclarationNode } from './node-utils.js';
import { getScopeContainer, isShadowed, isInScopeChain } from './scope-resolver.js';

/**
 * 檢查節點是否引用指定符號
 */
export function isReferenceToSymbol(node: ts.Node, symbol: TypeScriptSymbol): boolean {
  if (!ts.isIdentifier(node)) {
    return false;
  }

  const name = node.text;
  if (name !== symbol.name) {
    return false;
  }

  // 找到符號的標識符節點
  const symbolIdentifier = getIdentifierFromSymbolNode(symbol.tsNode);
  if (!symbolIdentifier) {
    return false;
  }

  // 檢查是否為相同符號的引用
  // 1. 如果是符號的定義位置本身
  if (node === symbolIdentifier) {
    return true;
  }

  // 2. 對於型別宣告（類別、介面、型別別名等），檢查是否在型別位置使用
  if (ts.isClassDeclaration(symbol.tsNode) ||
      ts.isInterfaceDeclaration(symbol.tsNode) ||
      ts.isTypeAliasDeclaration(symbol.tsNode) ||
      ts.isEnumDeclaration(symbol.tsNode)) {
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
  const symbolScope = getScopeContainer(symbolIdentifier);
  const nodeScope = getScopeContainer(node);

  // 檢查是否在相同作用域或符號的子作用域內
  if (nodeScope === symbolScope || isInScopeChain(node, symbolScope)) {
    // 檢查是否被遮蔽（同名變數在更內層作用域）
    if (!isShadowed(node, symbolIdentifier)) {
      return true;
    }
  }

  // 5. 對於頂層函式和變數，放寬檢查條件
  // 如果符號在頂層作用域（SourceFile），則同一檔案中所有同名標識符都可能是引用
  if (ts.isSourceFile(symbolScope) && !isShadowed(node, symbolIdentifier)) {
    return true;
  }

  return false;
}

/**
 * 獲取引用類型
 */
export function getReferenceType(node: ts.Node, symbol: TypeScriptSymbol): ReferenceType {
  // 找到符號的標識符節點
  const symbolIdentifier = getIdentifierFromSymbolNode(symbol.tsNode);

  // 如果是符號的原始定義位置
  if (node === symbolIdentifier) {
    return ReferenceType.Definition;
  }

  // 檢查是否為宣告（例如函式參數、變數宣告等）
  if (isDeclarationNode(node.parent)) {
    return ReferenceType.Declaration;
  }

  // 檢查是否在 import 語句內
  if (isInImportStatement(node)) {
    return ReferenceType.Import;
  }

  // 否則為使用
  return ReferenceType.Usage;
}

/**
 * 檢查節點是否位於 import 語句內
 */
export function isInImportStatement(node: ts.Node): boolean {
  let current = node.parent;
  while (current) {
    if (ts.isImportDeclaration(current) || ts.isImportEqualsDeclaration(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}
