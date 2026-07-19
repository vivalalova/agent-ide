/**
 * Resolves a `--at` location that points at a *usage* site (e.g. the callee identifier of a
 * call expression) back to the declared symbol it references, for when
 * `resolveSymbolTarget`'s direct declaration-location match finds nothing.
 *
 * Reuses `locationTargetsSelectedSymbol` — the exact same cross-file import/require binding
 * resolution that `--at` reference filtering already uses — so "which symbol does this usage
 * site resolve to" and "does this reference belong to the selected symbol" always agree
 * (Single Source of Truth; no separate binding-resolution logic here). This is what lets a
 * CJS `require()` call site resolve exactly like an ESM import call site: both are answered
 * by the same `getSelectedSymbolFileAnalysis` binding collection.
 */

import type { SymbolSearchResult } from '@core/foundations/indexing/index.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { isImportedSymbol, SymbolType } from '@shared/types/symbol.js';
import { hasPositionInfo, parsePathLocationAbsolute } from '@interfaces/cli/path-location-parser.js';
import { locationTargetsSelectedSymbol } from './symbol-reference-filter.js';
import {
  resolveSymbolTarget,
  type SymbolTargetResolutionResult
} from './symbol-target-resolver.js';

/**
 * @returns `null` when the location has no usable position, or resolves to zero or more than
 * one candidate (ambiguous) — callers should fall back to the original declaration-match error.
 */
export async function resolveUsageSiteSymbolTarget(
  symbolName: string,
  candidates: readonly SymbolSearchResult[],
  projectPath: string,
  at: string,
  fileSystem: IFileSystem
): Promise<SymbolTargetResolutionResult | null> {
  const location = parsePathLocationAbsolute(at, projectPath);
  if (!hasPositionInfo(location) || location.column === undefined) {
    return null;
  }

  // 與 resolveSymbolTarget 同一套消歧策略：import/require binding 只是通往真正定義的
  // 中介，不應與它競爭候選——否則同名的本地 import binding（如本檔的
  // `const { helper } = require(...)`）與真正定義都會對同一個使用點成立比對，
  // 造成假性歧義（見 F-usage-site：CJS 呼叫點解析誤判為多重候選）。
  const definitionCandidates = candidates.filter(candidate => !isImportedSymbol(candidate.symbol));
  const searchCandidates = definitionCandidates.length > 0 ? definitionCandidates : candidates;

  const rawMatches: SymbolSearchResult[] = [];
  for (const candidate of searchCandidates) {
    const isMatch = await locationTargetsSelectedSymbol(
      { file: location.filePath, line: location.line, column: location.column },
      candidate.symbol,
      projectPath,
      fileSystem
    );
    if (isMatch) {
      rawMatches.push(candidate);
    }
  }

  // `module.exports = { foo }` shorthand 重述同檔既有宣告時，會在該檔多出一個
  // type 為 'property' 的候選（見 F-usage-site 調查）——語意上等同 ESM `export { foo }`
  // 具名 re-export 子句，而後者並不會產生額外競爭候選（已實測驗證）。當同一批比對命中
  // 同時含 property 與非 property（function/class/variable 等真正宣告）候選時，
  // 優先採真正宣告，回復與 ESM 一致的單一候選行為；並非「property 永不是有效目標」，
  // 只在與非 property 候選並存、判定為同一重述關係時才降權。
  const nonPropertyMatches = rawMatches.filter(match => match.symbol.type !== SymbolType.Property);
  const matches = nonPropertyMatches.length > 0 ? nonPropertyMatches : rawMatches;

  if (matches.length !== 1) {
    return null;
  }

  // 轉成「declaration --at」再走一次標準解析：下游只需認得一種 --at 形狀，
  // 且結果與直接對定義位置查詢完全一致（同一顆選定符號、同一份 selectedResults）。
  const matchedDeclaration = matches[0].symbol.location;
  const declarationAt =
    `${matchedDeclaration.filePath}:${matchedDeclaration.range.start.line}:${matchedDeclaration.range.start.column}`;
  return resolveSymbolTarget(symbolName, candidates, projectPath, declarationAt);
}
