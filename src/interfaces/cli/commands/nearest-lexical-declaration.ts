/**
 * Nearest-visible lexical declaration lookup, shared by the `--at` filter family:
 * the same-file path (does a reference bind the selected declaration), the cross-file
 * shadow check (is an imported binding shadowed by a nearer local declaration), and
 * the receiver-owner judgement (which declaration does a receiver identifier bind to).
 *
 * 獨立成模組的原因：receiver-owner-heritage 與 same-file-lexical-scope 互有依賴需求，
 * 共用的最近綁定解析抽到此處避免模組循環。
 */

import * as ts from 'typescript';
import { findAncestor } from './ast-node-location.js';

export function findNearestLexicalDeclarationName(
  sourceFile: ts.SourceFile,
  referenceNode: ts.Identifier,
  symbolName: string
): ts.Identifier | undefined {
  const referenceStart = referenceNode.getStart(sourceFile);
  let best: { name: ts.Identifier; scopeSpan: number; nameStart: number } | undefined;

  const visit = (node: ts.Node): void => {
    const name = getLexicalDeclarationName(node);
    if (name?.text === symbolName) {
      const nameStart = name.getStart(sourceFile);
      const scope = getLexicalDeclarationScope(node);
      const scopeStart = scope.getStart(sourceFile);
      const scopeEnd = scope.getEnd();
      // 靜態詞法綁定與宣告順序無關：let/const 綁定整個所屬 block（先用後宣告屬
      // TDZ runtime 概念、不改變綁定對象）、var/function 本就提升，因此可見性
      // 只看引用位置是否落在宣告的 scope 範圍內
      const isVisible = nameStart === referenceStart
        || (scopeStart <= referenceStart && referenceStart <= scopeEnd);

      if (isVisible) {
        const scopeSpan = scopeEnd - scopeStart;
        if (!best || scopeSpan < best.scopeSpan || (scopeSpan === best.scopeSpan && nameStart > best.nameStart)) {
          best = { name, scopeSpan, nameStart };
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return best?.name;
}

function getLexicalDeclarationName(node: ts.Node): ts.Identifier | undefined {
  if (
    (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node))
    && node.name
    && ts.isIdentifier(node.name)
  ) {
    return node.name;
  }

  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name;
  }

  if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
    return node.name;
  }

  // 解構綁定（`const { a: b } = obj`、`const [x] = arr`、`function f({ a })`）：
  // node.name 是實際綁定進 scope 的本地名稱（`{ a: b }` 綁的是 b，propertyName 才是 a）
  if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) {
    return node.name;
  }

  if (ts.isImportSpecifier(node) && ts.isIdentifier(node.name)) {
    return node.name;
  }

  return undefined;
}

function getLexicalDeclarationScope(node: ts.Node): ts.Node {
  if (ts.isParameter(node)) {
    return findAncestor(node, ts.isFunctionLike) ?? node.getSourceFile();
  }

  // 解構綁定：沿祖先鏈找到所屬的 VariableDeclaration 或 Parameter（跨巢狀解構亦適用，
  // 中間可能經過多層 BindingElement/BindingPattern），再套用該宣告種類的 scope 規則
  if (ts.isBindingElement(node)) {
    const bindingRoot = findAncestor(
      node,
      ancestor => ts.isVariableDeclaration(ancestor) || ts.isParameter(ancestor)
    );
    return bindingRoot ? getLexicalDeclarationScope(bindingRoot) : node.getSourceFile();
  }

  if (ts.isVariableDeclaration(node)) {
    if (isVarDeclaration(node)) {
      return findAncestor(node, ts.isFunctionLike) ?? node.getSourceFile();
    }

    // `catch (e) { ... }`：block-scoped 宣告本體是 CatchClause，非 VariableDeclarationList
    if (ts.isCatchClause(node.parent)) {
      return node.parent;
    }

    // `for (const x of …)` / `for (const x in …)` / `for (let x; …)`：宣告位於迴圈頭，
    // 迴圈本體是宣告的兄弟節點而非子節點，scope 須取整個迴圈語句（頭+本體）才涵蓋本體引用，
    // 且讓迴圈外的同名引用正確落在 scope 之外、不被誤判為遮蔽
    if (ts.isVariableDeclarationList(node.parent)) {
      const loopStatement = node.parent.parent;
      if (
        ts.isForStatement(loopStatement)
        || ts.isForOfStatement(loopStatement)
        || ts.isForInStatement(loopStatement)
      ) {
        return loopStatement;
      }
    }
  }

  return findAncestor(node, parent => ts.isBlock(parent) || ts.isSourceFile(parent)) ?? node.getSourceFile();
}

function isVarDeclaration(node: ts.VariableDeclaration): boolean {
  return ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.BlockScoped) === 0;
}
