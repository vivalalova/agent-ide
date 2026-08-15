/**
 * JavaScript rename 的 shorthand token 判定（Babel AST）
 *
 * object literal shorthand（`{ foo }`）與 destructuring shorthand
 * （`const { foo } = opts`）：此 token 同時是 key 與 value/binding，
 * 天真替換成 newName 會把 key 一併改掉（缺陷：見
 * tests/e2e/commands/javascript/cli-rename-shorthand-bugs.e2e.test.ts）。
 * 標記後由 rename edit 產生端展開為 `key: newName`。
 */

import * as babel from '@babel/types';
import type { NodePath } from '@babel/traverse';
import { isRequireCallExpression } from './cjs-require-ast.js';

/**
 * 判定引用節點是否為 object property shorthand token（`{ foo }`，含
 * ObjectExpression 的 value 與 ObjectPattern 的 key/value——shorthand
 * 下兩者是不同的 Identifier 節點物件但同一位置），是則回傳原始 key 文字
 * （供 rename 展開為 `key: newName`）。非 shorthand（含具名別名
 * `{ foo: bar }`）回傳 undefined，維持原本天真替換行為。
 *
 * 例外：CJS `const { foo } = require('./mod')` 解構與 `module.exports = { foo }`
 * 這類 shorthand，其 key 語意上就是被匯入/匯出的符號名本身（等同 ESM
 * `import { foo }` / `export { foo }` specifier，見 isRequireDestructuringBindingOf
 * 的既有 F4 設計），rename 時應隨新名稱整個 token 一起改（`{ bar }`），不可展開成
 * `{ foo: bar }`——否則會破壞既有 CJS 跨檔 rename 行為（見
 * cli-rename-cjs-require-f4、cli-rename-dry-run-cjs-multi-edit-preview 等既有 E2E）。
 */
export function getShorthandKeyText(path: NodePath<babel.Identifier>): string | undefined {
  const parent = path.parent;
  if (!babel.isObjectProperty(parent) || !parent.shorthand || !babel.isIdentifier(parent.key)) {
    return undefined;
  }
  if (isRequireOrModuleExportsShorthand(path)) {
    return undefined;
  }
  return parent.key.name;
}

/**
 * 判定 shorthand ObjectProperty 是否位於 CJS require 解構
 * （`const { foo } = require('./mod')`）或 module.exports 匯出
 * （`module.exports = { foo }` / `exports = { foo }`）之中。
 */
function isRequireOrModuleExportsShorthand(path: NodePath<babel.Identifier>): boolean {
  const propertyPath = path.parentPath;
  const containerPath = propertyPath?.parentPath;
  if (!containerPath) {
    return false;
  }

  if (containerPath.isObjectPattern()) {
    const declaratorPath = containerPath.parentPath;
    if (!declaratorPath?.isVariableDeclarator()) {
      return false;
    }
    return isRequireCallExpression(declaratorPath.node.init);
  }

  if (containerPath.isObjectExpression()) {
    const assignmentPath = containerPath.parentPath;
    if (!assignmentPath?.isAssignmentExpression()) {
      return false;
    }
    return isModuleExportsTarget(assignmentPath.node.left);
  }

  return false;
}

/** 判定表達式是否為 `module.exports` 或裸 `exports` */
function isModuleExportsTarget(left: babel.Node): boolean {
  if (
    babel.isMemberExpression(left)
    && babel.isIdentifier(left.object)
    && left.object.name === 'module'
    && babel.isIdentifier(left.property)
    && left.property.name === 'exports'
    && !left.computed
  ) {
    return true;
  }
  return babel.isIdentifier(left) && left.name === 'exports';
}
