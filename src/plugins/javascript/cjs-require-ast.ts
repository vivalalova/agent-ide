/**
 * CJS `require()` 呼叫的共用 AST 判斷原語（Babel AST）。
 *
 * 對齊 TS 側 `@plugins/typescript/cjs-require-ast.ts` 的職責（`require('./mod')`
 * 呼叫辨識），但兩者對應不同 AST（Babel vs TypeScript Compiler API），
 * 無法合併成同一份實作，僅同名同責任分居兩側。
 *
 * 原本在本模組（Babel AST）內重複三處（依賴收集、shorthand 判定、F4 rename
 * 綁定判定），收斂為單一來源，供 symbol-extractor.ts、dependency-analyzer.ts、
 * shorthand-rename.ts、reference-resolver.ts 共用。
 */

import * as babel from '@babel/types';

/** `require('...')` 呼叫（callee 為識別符 require） */
export function isRequireCallExpression(node: babel.Node | null | undefined): node is babel.CallExpression {
  return !!node && babel.isCallExpression(node) && babel.isIdentifier(node.callee) && node.callee.name === 'require';
}

/** `module.exports` 或裸 `exports`（CJS 匯出物件本身） */
export function isModuleExportsTarget(node: babel.Node): boolean {
  if (
    babel.isMemberExpression(node)
    && !node.computed
    && babel.isIdentifier(node.object, { name: 'module' })
    && babel.isIdentifier(node.property, { name: 'exports' })
  ) {
    return true;
  }
  return babel.isIdentifier(node, { name: 'exports' });
}
