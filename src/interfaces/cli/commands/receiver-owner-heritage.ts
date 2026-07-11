/**
 * Receiver / `this` / heritage-chain judgement for owner-scoped member references.
 *
 * Shared by both the same-file lexical path and the cross-file binding path: a
 * `owner.method()` / `this.method()` / `new Owner().method()` reference is only a
 * reference to the selected member when the receiver resolves to the selected symbol's
 * owner class (or a subclass thereof). Callers supply an `ownerMatches` predicate that
 * decides which class names count as the owner (a literal owner name for the same-file
 * path, or the set of imported owner bindings for the cross-file path).
 */

import * as ts from 'typescript';
import type { SelectedSymbolBindings } from './symbol-reference-filter-types.js';
import { findAncestor } from './ast-node-location.js';
import { findNearestLexicalDeclarationName } from './nearest-lexical-declaration.js';

export function receiverTargetsSelectedOwner(
  receiver: ts.Expression,
  bindings: SelectedSymbolBindings,
  sourceFile: ts.SourceFile
): boolean {
  if (bindings.ownerNames.size === 0) {
    return false;
  }

  if (receiver.kind === ts.SyntaxKind.ThisKeyword) {
    // 子類 this.method() 呼叫繼承自 owner 的成員：沿 enclosing class 的 heritage 鏈判斷
    const enclosingClass = findAncestor(receiver, ts.isClassDeclaration);
    return !!enclosingClass
      && ts.isClassDeclaration(enclosingClass)
      && classChainTargetsOwner(enclosingClass, candidate => bindings.ownerNames.has(candidate), sourceFile);
  }

  if (ts.isParenthesizedExpression(receiver)) {
    return receiverTargetsSelectedOwner(receiver.expression, bindings, sourceFile);
  }

  if (ts.isNewExpression(receiver)) {
    return constructorTargetsSelectedOwner(receiver.expression, bindings);
  }

  if (ts.isIdentifier(receiver)) {
    return identifierReceiverEstablishesOwner(receiver, sourceFile, candidate => bindings.ownerNames.has(candidate));
  }

  return false;
}

function constructorTargetsSelectedOwner(
  expression: ts.Expression,
  bindings: SelectedSymbolBindings
): boolean {
  return ts.isIdentifier(expression) && bindings.ownerNames.has(expression.text);
}

export function receiverTargetsOwnerName(
  receiver: ts.Expression,
  ownerName: string,
  sourceFile: ts.SourceFile
): boolean {
  if (ts.isParenthesizedExpression(receiver)) {
    return receiverTargetsOwnerName(receiver.expression, ownerName, sourceFile);
  }

  if (ts.isNewExpression(receiver)) {
    return constructorTargetsOwnerName(receiver.expression, ownerName);
  }

  if (ts.isIdentifier(receiver)) {
    return identifierReceiverEstablishesOwner(receiver, sourceFile, candidate => candidate === ownerName);
  }

  return false;
}

function constructorTargetsOwnerName(expression: ts.Expression, ownerName: string): boolean {
  return ts.isIdentifier(expression) && expression.text === ownerName;
}

/**
 * identifier receiver 是否綁定到 owner：以檔內「最近可見詞法宣告」為準，
 * 不做全檔任意同名宣告掃描（後者會讓被區域宣告遮蔽的 receiver 誤綁外層宣告）。
 *
 * - 綁定到 import 或檔內 class 宣告 → receiver 名稱即 owner 名稱的直接引用，名稱比對。
 * - 綁定到變數宣告 → 唯該宣告本身可確立 owner 型別（new Owner() 或型別註記）才算。
 * - 綁定到其餘形式（參數、解構等無 owner 型別資訊）→ 非 owner。
 * - 檔內無宣告（default import 綁定、全域）→ 名稱比對。
 */
function identifierReceiverEstablishesOwner(
  receiver: ts.Identifier,
  sourceFile: ts.SourceFile,
  ownerMatches: (ownerName: string) => boolean
): boolean {
  const nearest = findNearestLexicalDeclarationName(sourceFile, receiver, receiver.text);
  if (!nearest) {
    return ownerMatches(receiver.text);
  }

  const declaration = nearest.parent;
  if (ts.isImportSpecifier(declaration) || ts.isClassDeclaration(declaration)) {
    return ownerMatches(receiver.text);
  }

  return ts.isVariableDeclaration(declaration)
    && variableDeclarationEstablishesOwner(declaration, ownerMatches);
}

/**
 * 變數宣告是否可確立 owner 型別：`new Owner()` 初始化，或型別註記
 * `const svc: Owner = makeOwner()`（工廠／DI 常見形狀，初始化式非 new 亦可）。
 */
function variableDeclarationEstablishesOwner(
  node: ts.VariableDeclaration,
  ownerMatches: (ownerName: string) => boolean
): boolean {
  if (
    node.initializer
    && ts.isNewExpression(node.initializer)
    && ts.isIdentifier(node.initializer.expression)
    && ownerMatches(node.initializer.expression.text)
  ) {
    return true;
  }

  return !!node.type
    && ts.isTypeReferenceNode(node.type)
    && ts.isIdentifier(node.type.typeName)
    && ownerMatches(node.type.typeName.text);
}

/**
 * 沿 class 的 heritage（extends）鏈判斷 this.method() 是否指向 owner 的成員。
 *
 * 供同檔（owner 名比對）與跨檔（consumer 檔內 import 的 ownerNames 比對）兩路共用，
 * 呼叫端以 ownerMatches 決定「哪些名稱算 owner」。方法名相符已由呼叫端先確認。
 *
 * 規則：
 *   - enclosing class 自身或鏈上任一祖類名稱命中 owner → 指向 owner 成員。
 *   - 遇到沒有 extends 的類且非 owner → this 指向本類成員，非 owner。
 *   - heritage 表達式非單純識別符、或父類定義不在同檔（跨檔 heritage 無法在此解析）→
 *     採保守放行（extends 存在且方法名已相符），與 reference-finder 既有寬鬆策略一致，
 *     寧可保留可能的繼承呼叫也不漏報。
 */
export function classChainTargetsOwner(
  classNode: ts.ClassDeclaration,
  ownerMatches: (candidateClassName: string) => boolean,
  sourceFile: ts.SourceFile
): boolean {
  let current: ts.ClassDeclaration | undefined = classNode;
  const visited = new Set<ts.ClassDeclaration>();

  while (current) {
    if (current.name && ownerMatches(current.name.text)) {
      return true;
    }
    if (visited.has(current)) {
      return false;
    }
    visited.add(current);

    const extendsClause = current.heritageClauses?.find(
      clause => clause.token === ts.SyntaxKind.ExtendsKeyword
    );
    if (!extendsClause || extendsClause.types.length === 0) {
      return false;
    }

    const baseExpression = extendsClause.types[0].expression;
    if (!ts.isIdentifier(baseExpression)) {
      return true;
    }
    if (ownerMatches(baseExpression.text)) {
      return true;
    }

    const baseClass = findClassDeclarationByName(sourceFile, baseExpression.text);
    if (!baseClass) {
      return true;
    }
    current = baseClass;
  }

  return false;
}

function findClassDeclarationByName(
  sourceFile: ts.SourceFile,
  className: string
): ts.ClassDeclaration | undefined {
  let found: ts.ClassDeclaration | undefined;

  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}
