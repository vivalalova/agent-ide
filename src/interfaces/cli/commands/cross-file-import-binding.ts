/**
 * Cross-file import/export binding collection and reference matching.
 *
 * For a candidate reference located in a file *other* than the selected symbol's defining
 * file, this module resolves the module graph (which import brings the selected symbol into
 * the file, under which local names, and through which re-export chain) and then decides
 * whether a specific identifier / call expression at the candidate location binds to one of
 * those names. Shadowing of an imported binding by a nearer local declaration is rejected
 * via the shared lexical-scope check.
 *
 * Module-graph resolution runs on the injected IFileSystem plus tsconfig path aliases (see
 * `module-file-resolver.ts`), which is why this path cannot delegate to the TypeScript
 * Language Service — see the module comment in `symbol-reference-filter.ts`.
 */

import * as ts from 'typescript';
import type { Symbol } from '@shared/types/symbol.js';
import type {
  SelectedSymbolBindings,
  SelectedSymbolFileAnalysis,
  SymbolLocationTarget,
  SymbolReferenceFilterContext
} from './symbol-reference-filter-types.js';
import {
  getOrReadSourceFile,
  normalizePath,
  pathMatchesTarget,
  resolveModuleFile
} from './module-file-resolver.js';
import { nodeStartsAtLocation } from './ast-node-location.js';
import { findNearestLexicalDeclarationName } from './same-file-lexical-scope.js';
import { receiverTargetsSelectedOwner } from './receiver-owner-heritage.js';

export async function getSelectedSymbolFileAnalysis(
  filePath: string,
  filterContext: SymbolReferenceFilterContext
): Promise<SelectedSymbolFileAnalysis> {
  const normalizedFilePath = normalizePath(filePath);
  const cached = filterContext.fileAnalysisCache.get(normalizedFilePath);
  if (cached) {
    return cached;
  }

  const sourceFile = await getOrReadSourceFile(filePath, filterContext);

  const bindings: SelectedSymbolBindings = {
    directNames: new Set<string>(),
    namespaceNames: new Set<string>(),
    exportedNames: new Set<string>(),
    starReExportedNames: new Set<string>(),
    ownerNames: new Set<string>()
  };
  const analysis: SelectedSymbolFileAnalysis = { sourceFile, bindings };
  filterContext.fileAnalysisCache.set(normalizedFilePath, analysis);

  const importDeclarations: ts.ImportDeclaration[] = [];
  const exportDeclarations: ts.ExportDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      importDeclarations.push(node);
      return;
    }

    if (ts.isExportDeclaration(node)) {
      exportDeclarations.push(node);
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  for (const declaration of importDeclarations) {
    await addImportBindings(declaration, filePath, filterContext, bindings);
  }

  for (const declaration of exportDeclarations) {
    await addExportBindings(declaration, filePath, filterContext, bindings);
  }

  return analysis;
}

async function addImportBindings(
  node: ts.ImportDeclaration,
  fromFile: string,
  filterContext: SymbolReferenceFilterContext,
  bindings: SelectedSymbolBindings
): Promise<void> {
  if (!await moduleSpecifierProvidesSelectedSymbol(node.moduleSpecifier, fromFile, filterContext)) {
    return;
  }

  const symbolName = filterContext.selectedSymbol.name;
  const ownerName = filterContext.selectedOwnerName;
  const importClause = node.importClause;
  if (!importClause) {
    return;
  }

  if (importClause.name?.text === symbolName) {
    bindings.directNames.add(importClause.name.text);
  }
  if (ownerName && importClause.name) {
    bindings.ownerNames.add(importClause.name.text);
  }

  const namedBindings = importClause.namedBindings;
  if (!namedBindings) {
    return;
  }

  if (ts.isNamespaceImport(namedBindings)) {
    bindings.namespaceNames.add(namedBindings.name.text);
    return;
  }

  for (const element of namedBindings.elements) {
    const importedName = element.propertyName?.text ?? element.name.text;
    if (importedName === symbolName) {
      bindings.directNames.add(element.name.text);
    }
    if (ownerName && importedName === ownerName) {
      bindings.ownerNames.add(element.name.text);
    }
  }
}

async function addExportBindings(
  node: ts.ExportDeclaration,
  fromFile: string,
  filterContext: SymbolReferenceFilterContext,
  bindings: SelectedSymbolBindings
): Promise<void> {
  const symbolName = filterContext.selectedSymbol.name;

  if (node.moduleSpecifier) {
    if (
      exportClauseExposesSymbol(node.exportClause, symbolName)
      && await moduleSpecifierProvidesSelectedSymbol(node.moduleSpecifier, fromFile, filterContext)
    ) {
      if (node.exportClause) {
        // 具名 / namespace re-export：clause 內有真正指向目標符號的 token，屬引用，供裸名比對
        bindings.exportedNames.add(symbolName);
      } else {
        // `export *`：檔內沒有符號 token，僅記錄模組圖轉出資訊，
        // 不得讓整檔任意同名 identifier 因此被誤判為引用
        bindings.starReExportedNames.add(symbolName);
      }
    }
    return;
  }

  const exportClause = node.exportClause;
  if (!exportClause || ts.isNamespaceExport(exportClause)) {
    return;
  }

  for (const element of exportClause.elements) {
    const localName = element.propertyName?.text ?? element.name.text;
    if (bindings.directNames.has(localName)) {
      bindings.exportedNames.add(element.name.text);
      bindings.directNames.add(localName);
    }
  }
}

function exportClauseExposesSymbol(
  exportClause: ts.NamedExportBindings | undefined,
  symbolName: string
): boolean {
  if (!exportClause) {
    return true;
  }

  if (ts.isNamespaceExport(exportClause)) {
    return exportClause.name.text === symbolName;
  }

  return exportClause.elements.some(element =>
    element.name.text === symbolName || element.propertyName?.text === symbolName
  );
}

async function moduleSpecifierProvidesSelectedSymbol(
  moduleSpecifier: ts.Expression | undefined,
  fromFile: string,
  filterContext: SymbolReferenceFilterContext
): Promise<boolean> {
  if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) {
    return false;
  }

  const moduleFile = await resolveModuleFile(moduleSpecifier.text, fromFile, filterContext);
  return moduleFile !== null && await moduleFileProvidesSelectedSymbol(moduleFile, filterContext);
}

async function moduleFileProvidesSelectedSymbol(
  filePath: string,
  filterContext: SymbolReferenceFilterContext
): Promise<boolean> {
  const normalizedFilePath = normalizePath(filePath);
  if (pathMatchesTarget(normalizedFilePath, filterContext.targetFile)) {
    return true;
  }

  const cached = filterContext.moduleProviderCache.get(normalizedFilePath);
  if (cached === true) {
    return true;
  }

  if (filterContext.visitingModuleFiles.has(normalizedFilePath)) {
    return false;
  }

  if (
    !await filterContext.fileSystem.exists(normalizedFilePath)
    || !await filterContext.fileSystem.isFile(normalizedFilePath)
  ) {
    return false;
  }

  filterContext.visitingModuleFiles.add(normalizedFilePath);
  try {
    const analysis = await getSelectedSymbolFileAnalysis(normalizedFilePath, filterContext);
    const symbolName = filterContext.selectedSymbol.name;
    const providesSymbol = analysis.bindings.exportedNames.has(symbolName)
      || analysis.bindings.starReExportedNames.has(symbolName);
    if (providesSymbol) {
      filterContext.moduleProviderCache.set(normalizedFilePath, true);
    }
    return providesSymbol;
  } finally {
    filterContext.visitingModuleFiles.delete(normalizedFilePath);
  }
}

export function locationMatchesSelectedBinding(
  sourceFile: ts.SourceFile,
  location: SymbolLocationTarget,
  bindings: SelectedSymbolBindings,
  selectedSymbol: Symbol
): boolean {
  let matches = false;

  const visit = (node: ts.Node): void => {
    if (matches) {
      return;
    }

    if (ts.isCallExpression(node) && nodeStartsAtLocation(node, sourceFile, location)) {
      matches = expressionTargetsSelectedBinding(node.expression, bindings, selectedSymbol, sourceFile);
      return;
    }

    if (ts.isIdentifier(node) && nodeStartsAtLocation(node, sourceFile, location)) {
      matches = identifierTargetsSelectedBinding(node, bindings, selectedSymbol, sourceFile);
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return matches;
}

function expressionTargetsSelectedBinding(
  expression: ts.Expression,
  bindings: SelectedSymbolBindings,
  selectedSymbol: Symbol,
  sourceFile: ts.SourceFile
): boolean {
  if (ts.isIdentifier(expression)) {
    return bindings.directNames.has(expression.text);
  }

  if (
    ts.isPropertyAccessExpression(expression)
    && expression.name.text === selectedSymbol.name
  ) {
    if (ts.isIdentifier(expression.expression) && bindings.namespaceNames.has(expression.expression.text)) {
      return true;
    }

    return receiverTargetsSelectedOwner(expression.expression, bindings, sourceFile, expression.getStart(sourceFile));
  }

  return false;
}

function identifierTargetsSelectedBinding(
  node: ts.Identifier,
  bindings: SelectedSymbolBindings,
  selectedSymbol: Symbol,
  sourceFile: ts.SourceFile
): boolean {
  const parent = node.parent;
  if (
    parent
    && ts.isPropertyAccessExpression(parent)
    && parent.name === node
    && parent.name.text === selectedSymbol.name
  ) {
    return expressionTargetsSelectedBinding(parent, bindings, selectedSymbol, sourceFile);
  }

  if (bindings.directNames.has(node.text) && !identifierShadowedByLocalDeclaration(node, sourceFile)) {
    return true;
  }

  return bindings.exportedNames.has(node.text);
}

/**
 * 判斷跨檔引用位置的 identifier 是否被「更近的非 import 詞法宣告」遮蔽。
 *
 * directNames 只以裸名比對命中該檔任意同名 identifier，會把遮蔽 import 的區域宣告
 * （for-of / for / catch 變數、參數、區域 const/let/var/function/class）誤判為對匯入符號的引用。
 * 複用同檔作用域機制 findNearestLexicalDeclarationName：若引用位置最近的可見詞法宣告
 * 不是 import binding，代表該名稱被區域宣告遮蔽，非目標引用。import binding 視為模組層宣告參與比較。
 */
function identifierShadowedByLocalDeclaration(node: ts.Identifier, sourceFile: ts.SourceFile): boolean {
  const nearest = findNearestLexicalDeclarationName(sourceFile, node, node.text);
  return nearest !== undefined && !isImportBindingName(nearest);
}

/** 詞法宣告名稱節點是否來自 import binding（具名 import specifier 的 local 名） */
function isImportBindingName(name: ts.Identifier): boolean {
  return ts.isImportSpecifier(name.parent);
}
