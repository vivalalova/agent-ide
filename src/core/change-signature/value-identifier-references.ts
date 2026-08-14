/**
 * 值空間識別字引用走訪（change-signature 共用單一實作）
 *
 * 檢查節點自身是否為命中的識別字，並依作用域遮蔽規則遞迴子節點。
 * body 掃描、參數預設值掃描、rename 引用改寫與 call-site 值自足性檢查皆以此為
 * 單一實作，避免各自重複一套走訪＋遮蔽邏輯（Single Source of Truth）。
 */

import * as ts from 'typescript';
import { collectScopeShadowedNames } from './scope-shadow-analyzer.js';

/**
 * 走訪 node 子樹，對 liveNames 內名稱的每個「值空間引用」呼叫 onReference。
 * 屬性名（`a.b` 的 `b`、物件鍵）與型別位置的識別字不算引用。
 */
export function visitValueIdentifierReferences(
  node: ts.Node,
  liveNames: ReadonlySet<string>,
  onReference: (node: ts.Identifier) => void
): void {
  if (liveNames.size === 0) {
    return;
  }

  // 進入會建立作用域的節點時，移除被「該作用域自身宣告」遮蔽的名稱後再遞迴子樹。
  // 遮蔽按作用域粒度計：函式層＝參數 + body 內 var（提升）；區塊層（Block／迴圈頭／
  // catch）＝該層直接的 let/const/class/function 宣告，只遮該子樹——不得把區塊內
  // 宣告當整函式遮蔽，否則閉包對外層參數的引用會被漏算（rename 漏改、remove 誤放行）
  let childLiveNames = liveNames;
  const shadowed = collectScopeShadowedNames(node);
  if (shadowed.size > 0) {
    childLiveNames = new Set([...liveNames].filter(name => !shadowed.has(name)));
  }

  if (
    ts.isIdentifier(node)
    && liveNames.has(node.text)
    && !isNonReferenceIdentifierPosition(node)
  ) {
    onReference(node);
  }

  ts.forEachChild(node, (child) => visitChildForValueIdentifierReferences(child, childLiveNames, onReference));
}

/**
 * 型別位置的子樹整棵跳過遞迴：TS 值／型別是兩個獨立命名空間，型別節點
 * （TypeReference、TypeLiteral、AsExpression／SatisfiesExpression／TypeAssertion
 * 的 .type、參數與變數宣告的型別標註等）內的識別字查找的是型別空間繫結，
 * 與同名參數（值空間繫結）無關——即使兩者剛好同名也不構成引用（R2-2）。
 * 唯一例外是 TypeQueryNode（`typeof x`）：語法上掛在型別位置，但 exprName
 * 語意上查詢的是值空間繫結，仍須繼續視為值引用遞迴，否則「參數只在
 * typeof 中被引用」會被誤判為未使用而放行移除，留下懸空引用。
 */
function visitChildForValueIdentifierReferences(
  child: ts.Node,
  liveNames: ReadonlySet<string>,
  onReference: (node: ts.Identifier) => void
): void {
  if (ts.isTypeNode(child)) {
    if (ts.isTypeQueryNode(child)) {
      visitValueIdentifierReferences(child.exprName, liveNames, onReference);
    }
    return;
  }

  visitValueIdentifierReferences(child, liveNames, onReference);
}

/** 識別字位於「名稱」而非「引用」位置（屬性存取名、物件鍵、成員宣告名） */
function isNonReferenceIdentifierPosition(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) {
    return false;
  }

  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return true;
  }

  if (ts.isPropertyAssignment(parent) && parent.name === node) {
    return true;
  }

  if (ts.isPropertyDeclaration(parent) && parent.name === node) {
    return true;
  }

  if (ts.isPropertySignature(parent) && parent.name === node) {
    return true;
  }

  if (ts.isMethodDeclaration(parent) && parent.name === node) {
    return true;
  }

  return false;
}
