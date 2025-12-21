/**
 * TypeScript AST 節點工具函式
 * 提供節點查找、識別和分類功能
 */

import * as ts from 'typescript';

/**
 * 在 SourceFile 中查找指定位置的節點
 */
export function findNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  function findNode(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      // 先檢查子節點
      for (const child of node.getChildren(sourceFile)) {
        const result = findNode(child);
        if (result) {
          return result;
        }
      }
      // 如果子節點中沒找到，返回當前節點
      return node;
    }
    return undefined;
  }

  return findNode(sourceFile);
}

/**
 * 檢查節點是否可重新命名
 */
export function isRenameableNode(node: ts.Node): boolean {
  return (
    ts.isIdentifier(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node) ||
    ts.isParameter(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node) ||
    ts.isTypeParameterDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isMethodSignature(node)
  );
}

/**
 * 檢查節點是否為定義節點
 */
export function isDefinitionNode(node: ts.Node): boolean {
  return (
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  );
}

/**
 * 檢查節點是否為宣告節點
 */
export function isDeclarationNode(node: ts.Node): boolean {
  return (
    ts.isParameter(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isBindingElement(node)
  );
}

/**
 * 檢查節點是否為作用域節點
 */
export function isScopeNode(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) ||
         ts.isMethodDeclaration(node) ||
         ts.isArrowFunction(node) ||
         ts.isFunctionExpression(node) ||
         ts.isBlock(node) ||
         ts.isSourceFile(node);
}

/**
 * 從符號節點中獲取標識符
 */
export function getIdentifierFromSymbolNode(node: ts.Node): ts.Identifier | null {
  // 如果本身就是 Identifier，直接返回
  if (ts.isIdentifier(node)) {
    return node;
  }

  // 對於變數宣告，標識符在 name 屬性中
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
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
 * 獲取定義類型
 */
export function getDefinitionKind(node: ts.Node): string {
  if (ts.isClassDeclaration(node)) {return 'class';}
  if (ts.isInterfaceDeclaration(node)) {return 'interface';}
  if (ts.isFunctionDeclaration(node)) {return 'function';}
  if (ts.isMethodDeclaration(node)) {return 'method';}
  if (ts.isVariableDeclaration(node)) {return 'variable';}
  if (ts.isPropertyDeclaration(node)) {return 'variable';}
  if (ts.isTypeAliasDeclaration(node)) {return 'type';}
  if (ts.isEnumDeclaration(node)) {return 'enum';}
  if (ts.isModuleDeclaration(node)) {return 'module';}
  return 'variable';
}
