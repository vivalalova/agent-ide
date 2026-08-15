/**
 * 作用域遮蔽分析
 * 收集某作用域節點「自身」宣告的名稱，供識別字引用走訪（rename／remove 參數引用掃描，
 * 以及呼叫點區域繫結遮蔽排除）共用同一套遮蔽規則（Single Source of Truth）。
 */

import * as ts from 'typescript';

/**
 * 收集某作用域節點「自身」宣告的名稱（用於遮蔽判定），按節點種類分流：
 * 函式層與區塊層分開計，讓區塊內宣告只遮蔽該區塊子樹。
 */
export function collectScopeShadowedNames(node: ts.Node): Set<string> {
  if (isFunctionLikeDeclaration(node)) {
    return collectFunctionLevelShadowedNames(node as ts.FunctionLikeDeclaration);
  }
  if (ts.isClassExpression(node) && node.name) {
    // 具名 class expression 的自身名稱只在其內部（含自身識別字節點與所有成員）
    // 可見，屬於獨立於外層的自我遞迴繫結，視同該節點整個子樹遮蔽此名稱。
    return new Set([node.name.text]);
  }
  return collectBlockLevelDeclaredNames(node);
}

/**
 * 函式層遮蔽：參數名 + body 內 var 宣告（var 提升到函式層，整個函式子樹被遮蔽）。
 * let/const/class/function 屬區塊層，由 collectBlockLevelDeclaredNames 於所屬
 * 區塊節點處理；不跨入更深層的巢狀函式作用域。
 */
export function collectFunctionLevelShadowedNames(func: ts.FunctionLikeDeclaration): Set<string> {
  const declared = new Set<string>();

  // 具名 function expression 的自身名稱（`const fn = function value() {}` 的
  // `value`）只在其內部可見，是與外層完全獨立的自我遞迴繫結，即使與外層參數
  // 同名也只是遮蔽、非同一個繫結的引用，故視同函式層遮蔽整個子樹。
  if (ts.isFunctionExpression(func) && func.name) {
    declared.add(func.name.text);
  }

  for (const parameter of func.parameters) {
    collectBindingNames(parameter.name, declared);
  }

  const body = 'body' in func ? func.body : undefined;
  if (!body) {
    return declared;
  }

  const scan = (node: ts.Node): void => {
    // 更深巢狀函式的宣告屬其自身作用域，不再往下掃
    if (isFunctionLikeDeclaration(node)) {
      return;
    }
    if (
      ts.isVariableDeclaration(node)
      && ts.isVariableDeclarationList(node.parent)
      && (node.parent.flags & ts.NodeFlags.BlockScoped) === 0
    ) {
      collectBindingNames(node.name, declared);
    }
    ts.forEachChild(node, scan);
  };

  ts.forEachChild(body, scan);
  return declared;
}

/**
 * 區塊層遮蔽：該作用域節點「直接」宣告的 let/const/class/function 名稱
 * （Block 的頂層語句、迴圈頭的 block-scoped 宣告、catch 變數），
 * 不遞迴更深區塊——更深區塊由各自節點在遍歷時處理。
 */
export function collectBlockLevelDeclaredNames(node: ts.Node): Set<string> {
  const declared = new Set<string>();

  if (ts.isBlock(node)) {
    for (const statement of node.statements) {
      if (
        ts.isVariableStatement(statement)
        && (statement.declarationList.flags & ts.NodeFlags.BlockScoped) !== 0
      ) {
        for (const declaration of statement.declarationList.declarations) {
          collectBindingNames(declaration.name, declared);
        }
      }
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
        declared.add(statement.name.text);
      }
    }
    return declared;
  }

  if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
    const initializer = node.initializer;
    if (
      initializer
      && ts.isVariableDeclarationList(initializer)
      && (initializer.flags & ts.NodeFlags.BlockScoped) !== 0
    ) {
      for (const declaration of initializer.declarations) {
        collectBindingNames(declaration.name, declared);
      }
    }
    return declared;
  }

  if (ts.isCatchClause(node) && node.variableDeclaration) {
    collectBindingNames(node.variableDeclaration.name, declared);
  }

  return declared;
}

/**
 * 從 binding name（識別字或解構樣式）收集所有繫結的識別字名稱
 */
export function collectBindingNames(name: ts.BindingName, target: Set<string>): void {
  if (ts.isIdentifier(name)) {
    target.add(name.text);
    return;
  }

  for (const element of name.elements) {
    if (ts.isBindingElement(element)) {
      collectBindingNames(element.name, target);
    }
  }
}

export function isFunctionLikeDeclaration(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isConstructorDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node);
}
