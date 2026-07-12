/**
 * Low-level AST node/position helpers shared across the reference filter modules.
 */

import * as ts from 'typescript';
import type { Symbol } from '@shared/types/symbol.js';
import type { SymbolLocationTarget } from './symbol-reference-filter-types.js';

export function nodeNameMatchesSelectedSymbol(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  selectedSymbol: Symbol
): boolean {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1 === selectedSymbol.location.range.start.line
    && character + 1 === selectedSymbol.location.range.start.column;
}

export function nodeStartsAtLocation(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  location: SymbolLocationTarget
): boolean {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1 === location.line
    && (location.column === undefined || character + 1 === location.column);
}

/**
 * 是否為 interface / type literal 的純簽名鍵或 object literal 的非 shorthand 屬性鍵——
 * 與成員存取（`x.name`）同屬「名稱字面重合但非對綁定的引用」，命中即應排除，
 * 不參與裸名（directNames / nodeNameMatchesSelectedSymbol）比對。涵蓋：
 *   - interface / type literal 的屬性簽名鍵（`{ name: T }` 的 `name`）
 *   - interface / type literal 的方法簽名鍵（`{ run(): T }` 的 `run`）
 *   - object literal 的非 shorthand 屬性鍵（`{ name: value }` 的 `name`）
 * `ShorthandPropertyAssignment`（`{ name }`）刻意不在此列——它同時是鍵也是對該綁定的
 * 真實引用，必須維持可比對。
 * class / object literal 的方法宣告名（`MethodDeclaration`）與 get/set accessor 名也刻意不在此列
 * ——它們是 receiver/owner 分析管線的合法輸入與可解析定義（`--at` 可鎖定），排除會使目標定義
 * 項從 references 漏報，與純簽名鍵（僅型別、無實體）性質不同。
 */
export function isExcludedPropertyKeyIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    (ts.isPropertySignature(parent) && parent.name === node)
    || (ts.isMethodSignature(parent) && parent.name === node)
    || (ts.isPropertyAssignment(parent) && parent.name === node)
  );
}
