/**
 * Low-level AST node/position helpers shared across the reference filter modules.
 */

import * as ts from 'typescript';
import type { Symbol } from '@shared/types/symbol.js';
import type { SymbolLocationTarget } from './symbol-reference-filter-types.js';

export function findAncestor(
  node: ts.Node,
  predicate: (ancestor: ts.Node) => boolean
): ts.Node | undefined {
  let current = node.parent;
  while (current) {
    if (predicate(current)) {
      return current;
    }
    current = current.parent;
  }

  return undefined;
}

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
