/**
 * Same-file lexical-scope analysis: decides whether a reference located in the file that
 * *defines* the selected symbol actually binds to that specific `--at` definition.
 *
 * This is the hand-written scope model the filter keeps instead of the TypeScript Language
 * Service (see the module comment in `symbol-reference-filter.ts` for why LS is not used as
 * the single authoritative source). `findNearestLexicalDeclarationName` approximates
 * lexical resolution — honouring shadowing, hoisting and module/function-body visibility —
 * and is reused by the cross-file binding path for its shadow check.
 */

import * as ts from 'typescript';
import type {
  SymbolLocationTarget,
  SymbolReferenceFilterContext
} from './symbol-reference-filter-types.js';
import { getOrReadSourceFile } from './module-file-resolver.js';
import { findAncestor, nodeNameMatchesSelectedSymbol, nodeStartsAtLocation } from './ast-node-location.js';
import { classChainTargetsOwner, receiverTargetsOwnerName } from './receiver-owner-heritage.js';

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

  return receiverTargetsOwnerName(
    propertyAccess.expression,
    ownerName,
    sourceFile,
    propertyAccess.getStart(sourceFile)
  );
}

export function findNearestLexicalDeclarationName(
  sourceFile: ts.SourceFile,
  referenceNode: ts.Identifier,
  symbolName: string
): ts.Identifier | undefined {
  const referenceStart = referenceNode.getStart(sourceFile);
  let best: { name: ts.Identifier; scopeSpan: number; nameStart: number } | undefined;

  const visit = (node: ts.Node): void => {
    const name = getLexicalDeclarationName(node);
    if (name?.text === symbolName) {
      const nameStart = name.getStart(sourceFile);
      const scope = getLexicalDeclarationScope(node);
      const scopeStart = scope.getStart(sourceFile);
      const scopeEnd = scope.getEnd();
      const isVisible = nameStart === referenceStart
        || (
          scopeStart <= referenceStart
          && referenceStart <= scopeEnd
          && (
            isHoistedLexicalDeclaration(node)
            || nameStart <= referenceStart
            || isModuleOrFunctionBodyScope(scope)
          )
        );

      if (isVisible) {
        const scopeSpan = scopeEnd - scopeStart;
        if (!best || scopeSpan < best.scopeSpan || (scopeSpan === best.scopeSpan && nameStart > best.nameStart)) {
          best = { name, scopeSpan, nameStart };
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return best?.name;
}

function getLexicalDeclarationName(node: ts.Node): ts.Identifier | undefined {
  if (
    (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node))
    && node.name
    && ts.isIdentifier(node.name)
  ) {
    return node.name;
  }

  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name;
  }

  if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
    return node.name;
  }

  if (ts.isImportSpecifier(node) && ts.isIdentifier(node.name)) {
    return node.name;
  }

  return undefined;
}

function getLexicalDeclarationScope(node: ts.Node): ts.Node {
  if (ts.isParameter(node)) {
    return findAncestor(node, ts.isFunctionLike) ?? node.getSourceFile();
  }

  if (ts.isVariableDeclaration(node) && isVarDeclaration(node)) {
    return findAncestor(node, ts.isFunctionLike) ?? node.getSourceFile();
  }

  return findAncestor(node, parent => ts.isBlock(parent) || ts.isSourceFile(parent)) ?? node.getSourceFile();
}

function isVarDeclaration(node: ts.VariableDeclaration): boolean {
  return ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.BlockScoped) === 0;
}

function isHoistedLexicalDeclaration(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node);
}

/**
 * 模組層（SourceFile）或函式體層級（Block 的父節點是函式）的 scope：
 * 這類 scope 內的識別符綁定屬靜態詞法解析，非 runtime TDZ 概念，
 * 宣告在整個 scope 內皆可見，不受「宣告需在引用之前」的順序限制。
 */
function isModuleOrFunctionBodyScope(scope: ts.Node): boolean {
  return ts.isSourceFile(scope) || (ts.isBlock(scope) && ts.isFunctionLike(scope.parent));
}
