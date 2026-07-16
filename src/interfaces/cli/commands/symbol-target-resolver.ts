/**
 * Read-only symbol command target resolution.
 */

import * as path from 'path';
import type { SymbolSearchResult } from '@core/foundations/indexing/index.js';
import type { SymbolIdentity } from '@infrastructure/formatters/index.js';
import { hasPositionInfo, parsePathLocationAbsolute } from '@interfaces/cli/path-location-parser.js';
import { isImportedSymbol } from '@shared/types/symbol.js';
import type { Symbol } from '@shared/types/symbol.js';

export interface SymbolTargetResolution {
  selectedResults: SymbolSearchResult[];
  symbols: SymbolIdentity[];
  targetSymbol?: SymbolIdentity;
}

export type SymbolTargetResolutionResult =
  | { success: true; resolution: SymbolTargetResolution }
  | { success: false; error: string };

export function resolveSymbolTarget(
  symbolName: string,
  candidates: readonly SymbolSearchResult[],
  projectPath: string,
  at?: string
): SymbolTargetResolutionResult {
  const definitionCandidates = candidates.filter(candidate => !isImportedSymbol(candidate.symbol));
  const targetCandidates = definitionCandidates.length > 0 ? definitionCandidates : candidates;

  if (!at) {
    // 與 rename 對齊：多個不同定義且無 --at → fail-fast，避免 silently merge 異符號引用（F6）
    const symbols = dedupeSymbolIdentities(
      targetCandidates.map(candidate => toSymbolIdentity(candidate.symbol))
    );
    if (symbols.length > 1) {
      const lines = symbols.map((symbol, index) => {
        const relPath = path.relative(projectPath, symbol.file) || symbol.file;
        return `   ${index + 1}. ${relPath}:${symbol.line}:${symbol.column}  (${symbol.type})`;
      });
      return {
        success: false,
        error:
          `找到 ${symbols.length} 個同名符號 "${symbolName}"，請用 --at 指定位置：\n\n` +
          `${lines.join('\n')}\n\n` +
          `用法: --at <file:line:column>`
      };
    }
    return {
      success: true,
      resolution: {
        selectedResults: [...targetCandidates],
        symbols
      }
    };
  }

  const location = parsePathLocationAbsolute(at, projectPath);
  if (!hasPositionInfo(location)) {
    return {
      success: false,
      error: `--at 需要 file:line[:column] 格式，收到 "${at}"，符號 "${symbolName}"`
    };
  }

  const matchedResults = targetCandidates.filter(candidate => symbolMatchesLocation(candidate.symbol, location));
  if (matchedResults.length === 0) {
    return {
      success: false,
      error: `在指定位置 "${at}" 找不到符號 "${symbolName}"`
    };
  }

  const symbols = matchedResults.map(candidate => toSymbolIdentity(candidate.symbol));
  const uniqueSymbols = dedupeSymbolIdentities(symbols);
  if (uniqueSymbols.length > 1) {
    return {
      success: false,
      error: `指定位置 "${at}" 找到多個符號 "${symbolName}"，請使用 file:line:column 精確定位`
    };
  }

  return {
    success: true,
    resolution: {
      selectedResults: matchedResults,
      symbols: uniqueSymbols,
      targetSymbol: uniqueSymbols[0]
    }
  };
}

export function toSymbolIdentity(symbol: Symbol): SymbolIdentity {
  const scope = symbol.scope;
  return {
    name: symbol.name,
    type: symbol.type,
    file: symbol.location.filePath,
    line: symbol.location.range.start.line,
    column: symbol.location.range.start.column,
    ...(scope?.name ? { scopeName: scope.name } : {}),
    ...(scope ? { scopeType: scope.type } : {})
  };
}

function symbolMatchesLocation(
  symbol: Symbol,
  location: { readonly filePath: string; readonly line: number; readonly column?: number }
): boolean {
  const start = symbol.location.range.start;
  return normalizePath(symbol.location.filePath) === normalizePath(location.filePath)
    && start.line === location.line
    && (location.column === undefined || start.column === location.column);
}

function dedupeSymbolIdentities(symbols: readonly SymbolIdentity[]): SymbolIdentity[] {
  const seen = new Set<string>();
  const uniqueSymbols: SymbolIdentity[] = [];

  for (const symbol of symbols) {
    const key = [
      symbol.name,
      symbol.type,
      normalizePath(symbol.file),
      symbol.line,
      symbol.column,
      symbol.scopeName ?? '',
      symbol.scopeType ?? ''
    ].join(':');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueSymbols.push(symbol);
  }

  return uniqueSymbols;
}

function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}
