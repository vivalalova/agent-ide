/**
 * CJS `require()` 解構匯入的共用 AST 判斷／收集原語。
 *
 * 單一權威來源：`require('./mod')` 呼叫辨識與 `const { foo } = require(...)` 解構 binding
 * 收集只在此定義一次，供兩處消費：
 *   - `language-service.ts`（rename 引擎）：錨定單一符號名稱對應的 binding 位置
 *   - `cross-file-import-binding.ts`（find-references / call-hierarchy 的 `--at` 過濾）：
 *     收集整檔的 binding 對應表，判斷 `--at` 引用是否綁定到選定符號
 *
 * 兩處各自需要不同的回傳形狀（位置 vs. 完整 binding 描述），故下沉的是最底層的
 * AST 判斷與「收集本檔全部 require 解構 binding」，由呼叫端各自過濾/轉換，
 * 不重複解析 `require(...)` 呼叫與 ObjectBindingPattern 的邏輯本身。
 */

import * as ts from 'typescript';

/** `require('...')` 呼叫（callee 為識別符 require） */
export function isRequireCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === 'require'
    && node.arguments.length >= 1;
}

/** 取得 `require(...)` 呼叫的 module specifier 字面值；非字串字面值引數回傳 undefined */
export function getRequireModuleSpecifier(call: ts.CallExpression): string | undefined {
  const arg = call.arguments[0];
  return arg && ts.isStringLiteral(arg) ? arg.text : undefined;
}

/**
 * 一個 `const { foo } = require('./mod')` / `const { foo: bar } = require('./mod')`
 * 解構出的具名 binding。
 * - `importedName`：被匯入名稱（有別名時為 propertyName，如 `{ foo: bar }` 的 `foo`），
 *   與 ESM 具名 import 的「被匯入名」語意對齊，供比對是否為目標符號。
 * - `localName`：本地使用的名稱（有別名時為 `bar`），本檔內實際引用使用的識別符。
 * - `nameNode`：anchor 節點——有別名時是 propertyName token，否則是 name token；
 *   與 ESM 具名 import 的 anchor 選擇一致。
 */
export interface RequireDestructuringBinding {
  readonly moduleSpecifier: string;
  readonly importedName: string;
  readonly localName: string;
  readonly nameNode: ts.Identifier;
}

/**
 * 收集來源檔案頂層所有 `const { foo } = require('./mod')` 解構 binding。
 * 只處理頂層 VariableStatement（與 ESM import 只在頂層合法一致）；
 * 非 ObjectBindingPattern（如 `const mod = require('./mod')` 整體綁定）不在此列，
 * 語意上是 namespace 綁定，非具名 binding，交由呼叫端視需求另行判斷。
 */
export function collectRequireDestructuringBindings(
  sourceFile: ts.SourceFile
): RequireDestructuringBinding[] {
  const bindings: RequireDestructuringBinding[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const decl of statement.declarationList.declarations) {
      if (!decl.initializer || !isRequireCall(decl.initializer)) {
        continue;
      }
      const moduleSpecifier = getRequireModuleSpecifier(decl.initializer);
      if (moduleSpecifier === undefined) {
        continue;
      }
      if (!ts.isObjectBindingPattern(decl.name)) {
        continue;
      }

      for (const element of decl.name.elements) {
        if (!ts.isBindingElement(element) || !ts.isIdentifier(element.name)) {
          continue;
        }
        const propertyName = element.propertyName;
        const importedName = propertyName && ts.isIdentifier(propertyName)
          ? propertyName.text
          : element.name.text;
        const nameNode = propertyName && ts.isIdentifier(propertyName) ? propertyName : element.name;

        bindings.push({
          moduleSpecifier,
          importedName,
          localName: element.name.text,
          nameNode
        });
      }
    }
  }

  return bindings;
}
