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
import {
  findAncestor,
  findNearestLexicalDeclarationName
} from '@plugins/typescript/lexical-scope-binding.js';

/**
 * receiver 型別對 owner 的三態歸屬：
 *  - `'owner'`：確定為 owner（或其子類）→ 屬 owner 成員引用，保留。
 *  - `'other'`：確定為其他型別（`new NotOwner()`、物件字面量、非 owner 型別註記等）→ 排除。
 *  - `'unknown'`：語法層無法確定型別（工廠呼叫回傳、無型別註記的變數等）→ 由呼叫端決定，
 *    預設寧可誤報不可漏報（保留）。工廠回傳實例（`const d = createDog(); d.bark()`）即此類：
 *    owner 型別未 import 進本檔、初始化式非 `new`／無型別註記，型別推不出但仍是真實成員呼叫。
 */
type ReceiverOwnerVerdict = 'owner' | 'other' | 'unknown';

export function receiverTargetsSelectedOwner(
  receiver: ts.Expression,
  bindings: SelectedSymbolBindings,
  sourceFile: ts.SourceFile,
  hasOwner: boolean
): boolean {
  // 選定符號並非類別成員（無 owner class 概念）→ receiver-owner 判定不適用，一律不算引用。
  // 注意：owner class 存在但未被 import 進本檔時 ownerNames 亦為空集合，故不能用
  // ownerNames.size === 0 當作「無 owner」的判準，否則工廠回傳實例的成員呼叫會被漏報。
  if (!hasOwner) {
    return false;
  }

  return classifyReceiverOwner(receiver, candidate => bindings.ownerNames.has(candidate), sourceFile) !== 'other';
}

export function receiverTargetsOwnerName(
  receiver: ts.Expression,
  ownerName: string,
  sourceFile: ts.SourceFile
): boolean {
  return classifyReceiverOwner(receiver, candidate => candidate === ownerName, sourceFile) !== 'other';
}

/**
 * 判定 receiver 表達式的型別對 owner 的三態歸屬。
 */
function classifyReceiverOwner(
  receiver: ts.Expression,
  ownerMatches: (ownerName: string) => boolean,
  sourceFile: ts.SourceFile
): ReceiverOwnerVerdict {
  if (ts.isParenthesizedExpression(receiver)) {
    return classifyReceiverOwner(receiver.expression, ownerMatches, sourceFile);
  }

  // this.method() / super.method()：沿 enclosing class 的 heritage 鏈判斷是否指向 owner 成員
  if (receiver.kind === ts.SyntaxKind.ThisKeyword || receiver.kind === ts.SyntaxKind.SuperKeyword) {
    const enclosingClass = findAncestor(receiver, ts.isClassDeclaration);
    if (enclosingClass && ts.isClassDeclaration(enclosingClass)) {
      return classChainTargetsOwner(enclosingClass, ownerMatches, sourceFile) ? 'owner' : 'other';
    }
    return 'other';
  }

  if (ts.isNewExpression(receiver)) {
    return ts.isIdentifier(receiver.expression) && ownerMatches(receiver.expression.text) ? 'owner' : 'other';
  }

  if (ts.isIdentifier(receiver)) {
    return classifyIdentifierReceiverOwner(receiver, sourceFile, ownerMatches);
  }

  // 其餘表達式（屬性存取鏈、索引存取等）：沿用既有保守策略，型別未確立即視為非 owner。
  return 'other';
}

/**
 * identifier receiver 對 owner 的三態歸屬：以檔內「最近可見詞法宣告」為準，
 * 不做全檔任意同名宣告掃描（後者會讓被區域宣告遮蔽的 receiver 誤綁外層宣告）。
 *
 * - 綁定到 import（具名／default／namespace）或檔內 class 宣告 → receiver 名稱即型別名稱，
 *   名稱比對定 owner/other。
 * - 綁定到變數／參數宣告 → 依型別註記與初始化式判三態。
 * - 綁定到解構 BindingElement → 回溯到含型別的 VariableDeclaration／Parameter 再判。
 * - 檔內無宣告（全域）→ 名稱比對。
 */
function classifyIdentifierReceiverOwner(
  receiver: ts.Identifier,
  sourceFile: ts.SourceFile,
  ownerMatches: (ownerName: string) => boolean
): ReceiverOwnerVerdict {
  const nearest = findNearestLexicalDeclarationName(sourceFile, receiver, receiver.text);
  if (!nearest) {
    return ownerMatches(receiver.text) ? 'owner' : 'other';
  }

  const declaration = nearest.parent;
  // 具名 import / default import（ImportClause.name）/ namespace import / class：本地名即型別名
  if (
    ts.isImportSpecifier(declaration)
    || ts.isImportClause(declaration)
    || ts.isNamespaceImport(declaration)
    || ts.isClassDeclaration(declaration)
  ) {
    return ownerMatches(receiver.text) ? 'owner' : 'other';
  }

  if (ts.isVariableDeclaration(declaration)) {
    return classifyTypedValueDeclarationReceiverOwner(declaration.type, declaration.initializer, ownerMatches);
  }

  if (ts.isParameter(declaration)) {
    return classifyTypedValueDeclarationReceiverOwner(declaration.type, declaration.initializer, ownerMatches);
  }

  if (ts.isBindingElement(declaration)) {
    return classifyBindingElementReceiverOwner(declaration, ownerMatches);
  }

  return 'other';
}

/**
 * 解構綁定 receiver：回溯到承載型別／初始化的 VariableDeclaration 或 Parameter，
 * 再以同一套型別／初始化規則判三態（無綁定根時無法推型別 → unknown）。
 */
function classifyBindingElementReceiverOwner(
  node: ts.BindingElement,
  ownerMatches: (ownerName: string) => boolean
): ReceiverOwnerVerdict {
  const bindingRoot = findAncestor(
    node,
    ancestor => ts.isVariableDeclaration(ancestor) || ts.isParameter(ancestor)
  );
  if (!bindingRoot) {
    return 'unknown';
  }

  if (ts.isVariableDeclaration(bindingRoot) || ts.isParameter(bindingRoot)) {
    return classifyTypedValueDeclarationReceiverOwner(
      bindingRoot.type,
      bindingRoot.initializer,
      ownerMatches
    );
  }

  return 'unknown';
}

/**
 * 帶可選型別註記與初始化式的值宣告（VariableDeclaration / Parameter）receiver 三態：
 * - `new Owner()` 或型別註記 `const svc: Owner = ...`／`(d: Owner)` → 確立為 owner。
 * - `new NotOwner()`、物件／陣列／字面量／函式初始化，或非 owner 型別註記 → 確定為 other。
 * - 其餘（工廠呼叫回傳、await、無型別註記的參數／變數等）→ unknown（保留，寧可誤報不漏報）。
 */
function classifyTypedValueDeclarationReceiverOwner(
  type: ts.TypeNode | undefined,
  initializer: ts.Expression | undefined,
  ownerMatches: (ownerName: string) => boolean
): ReceiverOwnerVerdict {
  // new Owner() 初始化，或型別註記 const svc: Owner = makeOwner()（工廠／DI 常見形狀）
  if (
    initializer
    && ts.isNewExpression(initializer)
    && ts.isIdentifier(initializer.expression)
    && ownerMatches(initializer.expression.text)
  ) {
    return 'owner';
  }
  if (
    type
    && ts.isTypeReferenceNode(type)
    && ts.isIdentifier(type.typeName)
    && ownerMatches(type.typeName.text)
  ) {
    return 'owner';
  }

  // 初始化式形狀可確定「非 owner 實例」（含 new 其他類別、物件字面量等）
  if (initializer && isDeterministicNonOwnerInitializer(initializer)) {
    return 'other';
  }

  // 有型別註記但非 owner（且非上述）→ 確定非 owner
  if (type && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    return 'other';
  }

  // 工廠呼叫回傳、await、無型別／無初始化等：型別無法在語法層確定
  return 'unknown';
}

/**
 * 初始化式是否為「型別可在語法層確定、且必非 owner 類別實例」的形狀：
 * new 其他類別、物件／陣列字面量、原始字面量、函式表達式。
 */
function isDeterministicNonOwnerInitializer(init: ts.Expression): boolean {
  return ts.isNewExpression(init)
    || ts.isObjectLiteralExpression(init)
    || ts.isArrayLiteralExpression(init)
    || ts.isStringLiteral(init)
    || ts.isNoSubstitutionTemplateLiteral(init)
    || ts.isTemplateExpression(init)
    || ts.isNumericLiteral(init)
    || init.kind === ts.SyntaxKind.TrueKeyword
    || init.kind === ts.SyntaxKind.FalseKeyword
    || ts.isArrowFunction(init)
    || ts.isFunctionExpression(init);
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
