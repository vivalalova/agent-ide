/**
 * TypeScript 作用域解析工具
 * 處理符號作用域判斷、遮蔽檢測和作用域鏈追蹤
 */

import * as ts from 'typescript';
import { isScopeNode } from './node-utils.js';

/**
 * 取得節點的作用域容器
 */
export function getScopeContainer(node: ts.Node): ts.Node {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isArrowFunction(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isConstructorDeclaration(current) ||
        ts.isBlock(current) ||
        ts.isSourceFile(current)) {
      return current;
    }
    current = current.parent;
  }
  return node.getSourceFile();
}

/**
 * 檢查符號是否被遮蔽
 */
export function isShadowed(node: ts.Node, originalIdentifier: ts.Identifier): boolean {
  const name = originalIdentifier.text;
  let current = node.parent;

  // 從 node 向上遍歷到 originalIdentifier 的作用域
  while (current && current !== originalIdentifier.parent) {
    // 檢查當前作用域是否有同名的宣告
    if (ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isArrowFunction(current) ||
        ts.isMethodDeclaration(current)) {
      // 檢查參數
      if (current.parameters) {
        for (const param of current.parameters) {
          if (ts.isIdentifier(param.name) && param.name.text === name) {
            return true; // 被參數遮蔽
          }
        }
      }
    }

    // 檢查區塊作用域中的宣告
    if (ts.isBlock(current)) {
      for (const statement of current.statements) {
        if (ts.isVariableStatement(statement)) {
          for (const decl of statement.declarationList.declarations) {
            if (ts.isIdentifier(decl.name) && decl.name.text === name) {
              // 確認這個宣告在 node 之前
              if (decl.pos < node.pos) {
                return true; // 被區域變數遮蔽
              }
            }
          }
        }
      }
    }

    current = current.parent;
  }

  return false;
}

/**
 * 檢查節點是否在指定作用域鏈內
 */
export function isInScopeChain(node: ts.Node, scopeContainer: ts.Node): boolean {
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
 * 獲取節點的作用域標識
 */
export function getNodeScope(node: ts.Node): string {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isArrowFunction(current) ||
        ts.isFunctionExpression(current)) {
      return `function_${current.pos}_${current.end}`;
    }
    if (ts.isBlock(current) && current.parent &&
        (ts.isIfStatement(current.parent) ||
         ts.isForStatement(current.parent) ||
         ts.isWhileStatement(current.parent))) {
      return `block_${current.pos}_${current.end}`;
    }
    current = current.parent;
  }
  return 'global';
}

/**
 * 檢查節點是否在相同作用域
 */
export function isInSameScope(node: ts.Node, symbolNode: ts.Node): boolean {
  // 找到符號定義所在的作用域
  let symbolScope = symbolNode.parent;
  while (symbolScope && !isScopeNode(symbolScope)) {
    symbolScope = symbolScope.parent;
  }

  // 檢查節點是否在該作用域內
  let currentScope = node.parent;
  while (currentScope) {
    if (currentScope === symbolScope) {
      return true;
    }
    currentScope = currentScope.parent;
  }

  return false;
}
