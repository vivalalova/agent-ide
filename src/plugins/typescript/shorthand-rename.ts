/**
 * TypeScript rename 的 shorthand token 判定
 *
 * object literal shorthand（`{ foo }`）與 destructuring shorthand
 * （`const { foo } = opts`）：此 token 同時是 key 與 value/binding，
 * 天真替換成 newName 會把 key 一併改掉（缺陷：見
 * tests/e2e/commands/typescript/cli-rename-shorthand-bugs.e2e.test.ts）。
 * 標記後由 rename edit 產生端展開為 `key: newName`。
 */

import * as ts from 'typescript';
import { findNodeAtPosition } from './node-locator.js';

/**
 * 判定指定位置的識別符是否為 shorthand token（同時是 key 與 value/binding），
 * 是則回傳原始 key 文字（供 rename 展開為 `key: newName`）：
 * - object literal shorthand `{ foo }`：`ts.ShorthandPropertyAssignment.name`
 * - destructuring shorthand `const { foo } = opts`：`ts.BindingElement.name`
 *   （無 `propertyName`，即無別名）
 * 非 shorthand 時回傳 undefined，維持原本天真替換行為。
 *
 * 例外：CJS `const { foo } = require('./mod')` 解構與 `module.exports = { foo }`
 * 這類 shorthand，其 key 語意上就是被匯入/匯出的符號名本身（等同 ESM
 * `import { foo }` / `export { foo }` specifier），rename 時應隨新名稱整個
 * token 一起改（`{ bar }`），不可展開成 `{ foo: bar }`——否則會破壞既有
 * CJS 跨檔 rename 行為（見 cli-rename-cjs-require-f4、
 * cli-rename-dry-run-cjs-multi-edit-preview 等既有 E2E）。
 */
export function getShorthandKeyText(sourceFile: ts.SourceFile, position: number): string | undefined {
  const node = findNodeAtPosition(sourceFile, position);
  if (!node || !ts.isIdentifier(node)) {
    return undefined;
  }

  const parent = node.parent;
  const isShorthandObjectLiteral = ts.isShorthandPropertyAssignment(parent) && parent.name === node;
  const isShorthandBinding =
    ts.isBindingElement(parent) &&
    parent.name === node &&
    !parent.propertyName &&
    !parent.dotDotDotToken &&
    ts.isObjectBindingPattern(parent.parent);
  if (!isShorthandObjectLiteral && !isShorthandBinding) {
    return undefined;
  }

  if (isRequireOrModuleExportsShorthand(node)) {
    return undefined;
  }

  return node.text;
}

/**
 * 判定 shorthand 識別符是否位於 CJS require 解構（`const { foo } = require('./mod')`）
 * 或 module.exports 匯出（`module.exports = { foo }` / `exports = { foo }`）之中。
 */
function isRequireOrModuleExportsShorthand(node: ts.Identifier): boolean {
  const parent = node.parent;

  if (ts.isBindingElement(parent)) {
    const pattern = parent.parent;
    if (ts.isObjectBindingPattern(pattern) && ts.isVariableDeclaration(pattern.parent)) {
      const init = pattern.parent.initializer;
      if (init && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === 'require') {
        return true;
      }
    }
    return false;
  }

  if (ts.isShorthandPropertyAssignment(parent)) {
    const objectLiteral = parent.parent;
    if (
      ts.isObjectLiteralExpression(objectLiteral)
      && ts.isBinaryExpression(objectLiteral.parent)
      && objectLiteral.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && objectLiteral.parent.right === objectLiteral
      && isModuleExportsTarget(objectLiteral.parent.left)
    ) {
      return true;
    }
    return false;
  }

  return false;
}

/** 判定表達式是否為 `module.exports` 或裸 `exports` */
function isModuleExportsTarget(expr: ts.Expression): boolean {
  if (
    ts.isPropertyAccessExpression(expr)
    && ts.isIdentifier(expr.expression)
    && expr.expression.text === 'module'
    && expr.name.text === 'exports'
  ) {
    return true;
  }
  return ts.isIdentifier(expr) && expr.text === 'exports';
}

/**
 * 判定 rename 目標符號的宣告節點是否為 property 宣告本身（shorthand 的 key 側）：
 * interface/type literal 的 `PropertySignature` 與 class 的 `PropertyDeclaration`。
 * 符號節點可能是宣告節點本身或其名稱 Identifier，兩者皆納入判定。
 */
export function isPropertyDeclarationNode(node: ts.Node | undefined): boolean {
  if (!node) {
    return false;
  }
  const declaration = ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)
    ? node
    : node.parent;
  return declaration !== undefined
    && (ts.isPropertySignature(declaration) || ts.isPropertyDeclaration(declaration));
}
