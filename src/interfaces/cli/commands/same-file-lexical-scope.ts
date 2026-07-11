/**
 * Same-file lexical-scope analysis: decides whether a reference located in the file that
 * *defines* the selected symbol actually binds to that specific `--at` definition.
 *
 * This is the hand-written scope model the filter keeps instead of the TypeScript Language
 * Service (see the module comment in `symbol-reference-filter.ts` for why LS is not used as
 * the single authoritative source). Nearest-binding resolution lives in
 * `nearest-lexical-declaration.ts`（供本檔、跨檔遮蔽檢查與 receiver 判定三路共用）。
 */

import * as ts from 'typescript';
import type {
  SymbolLocationTarget,
  SymbolReferenceFilterContext
} from './symbol-reference-filter-types.js';
import { getOrReadSourceFile } from './module-file-resolver.js';
import { findAncestor, nodeNameMatchesSelectedSymbol, nodeStartsAtLocation } from './ast-node-location.js';
import { classChainTargetsOwner, receiverTargetsOwnerName } from './receiver-owner-heritage.js';
import { findNearestLexicalDeclarationName } from './nearest-lexical-declaration.js';

export async function sameFileLocationTargetsSelectedSymbol(
  filePath: string,
  location: SymbolLocationTarget,
  filterContext: SymbolReferenceFilterContext
): Promise<boolean> {
  const sourceFile = await getOrReadSourceFile(filePath, filterContext);
  const referenceNode = findReferenceNodeAtLocation(sourceFile, location, filterContext.selectedSymbol.name);
  if (!referenceNode) {
    return false;
  }

  return sameFileReferenceTargetsSelectedSymbol(referenceNode, sourceFile, filterContext);
}

function findReferenceNodeAtLocation(
  sourceFile: ts.SourceFile,
  location: SymbolLocationTarget,
  symbolName: string
): ts.Node | undefined {
  let match: ts.Node | undefined;

  const visit = (node: ts.Node): void => {
    if (match) {
      return;
    }

    if (
      ts.isCallExpression(node)
      && nodeStartsAtLocation(node, sourceFile, location)
      && expressionReferencesSymbolName(node.expression, symbolName)
    ) {
      match = node.expression;
      return;
    }

    if (ts.isIdentifier(node) && node.text === symbolName && nodeStartsAtLocation(node, sourceFile, location)) {
      match = node;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return match;
}

function expressionReferencesSymbolName(expression: ts.Expression, symbolName: string): boolean {
  if (ts.isIdentifier(expression)) {
    return expression.text === symbolName;
  }

  return ts.isPropertyAccessExpression(expression) && expression.name.text === symbolName;
}

function sameFileReferenceTargetsSelectedSymbol(
  referenceNode: ts.Node,
  sourceFile: ts.SourceFile,
  filterContext: SymbolReferenceFilterContext
): boolean {
  if (ts.isPropertyAccessExpression(referenceNode)) {
    return sameFilePropertyAccessTargetsSelectedSymbol(referenceNode, sourceFile, filterContext);
  }

  if (
    ts.isIdentifier(referenceNode)
    && ts.isPropertyAccessExpression(referenceNode.parent)
    && referenceNode.parent.name === referenceNode
  ) {
    return sameFilePropertyAccessTargetsSelectedSymbol(referenceNode.parent, sourceFile, filterContext);
  }

  if (!ts.isIdentifier(referenceNode)) {
    return false;
  }

  if (nodeNameMatchesSelectedSymbol(referenceNode, sourceFile, filterContext.selectedSymbol)) {
    return true;
  }

  const declarationName = findNearestLexicalDeclarationName(
    sourceFile,
    referenceNode,
    filterContext.selectedSymbol.name
  );
  return declarationName
    ? nodeNameMatchesSelectedSymbol(declarationName, sourceFile, filterContext.selectedSymbol)
    : false;
}

function sameFilePropertyAccessTargetsSelectedSymbol(
  propertyAccess: ts.PropertyAccessExpression,
  sourceFile: ts.SourceFile,
  filterContext: SymbolReferenceFilterContext
): boolean {
  const ownerName = filterContext.selectedOwnerName;
  if (!ownerName || propertyAccess.name.text !== filterContext.selectedSymbol.name) {
    return false;
  }

  if (propertyAccess.expression.kind === ts.SyntaxKind.ThisKeyword) {
    const enclosingClass = findAncestor(propertyAccess, ts.isClassDeclaration);
    return !!enclosingClass
      && ts.isClassDeclaration(enclosingClass)
      && classChainTargetsOwner(enclosingClass, candidate => candidate === ownerName, sourceFile);
  }

  return receiverTargetsOwnerName(propertyAccess.expression, ownerName, sourceFile);
}

