/**
 * Read-only symbol command target resolution.
 */

import * as path from 'path';
import type { SymbolSearchResult } from '@core/foundations/indexing/index.js';
import type { SymbolIdentity } from '@infrastructure/formatters/index.js';
import { hasPositionInfo, parsePathLocationAbsolute } from '@interfaces/cli/path-location-parser.js';
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
    return {
      success: true,
      resolution: {
        selectedResults: [...targetCandidates],
        symbols: targetCandidates.map(candidate => toSymbolIdentity(candidate.symbol))
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

function isImportedSymbol(symbol: Symbol): boolean {
  return (symbol as { readonly isImported?: boolean }).isImported === true;
}

function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}
