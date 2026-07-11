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
  resolveModuleFile,
  tryGetSourceFile
} from './module-file-resolver.js';
import { nodeStartsAtLocation } from './ast-node-location.js';
import { findNearestLexicalDeclarationName } from './nearest-lexical-declaration.js';
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
  const moduleFile = await resolveProvidingModuleFile(node.moduleSpecifier, fromFile, filterContext);
  if (moduleFile === null) {
    return;
  }

  const symbolName = filterContext.selectedSymbol.name;
  const ownerName = filterContext.selectedOwnerName;
  const importClause = node.importClause;
  if (!importClause) {
    return;
  }

  if (importClause.name) {
    // default import 綁定的是模組的 default export 本身，不是任意同名具名 export；
    // 必須先解析目標檔 default export 底層實際宣告的名稱，比對相符才算真綁定
    // （對 owner 亦同：default export 宣告的是誰，才決定 import 本地名稱算不算 owner）
    const defaultExportName = await getDefaultExportDeclaredName(moduleFile, filterContext);
    if (importClause.name.text === symbolName && defaultExportName === symbolName) {
      bindings.directNames.add(importClause.name.text);
    }
    if (ownerName && defaultExportName === ownerName) {
      bindings.ownerNames.add(importClause.name.text);
    }
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
  return await resolveProvidingModuleFile(moduleSpecifier, fromFile, filterContext) !== null;
}

/** 解析 module specifier 對應的檔案路徑，僅在該檔確實提供選定符號時回傳；否則回傳 null。 */
async function resolveProvidingModuleFile(
  moduleSpecifier: ts.Expression | undefined,
  fromFile: string,
  filterContext: SymbolReferenceFilterContext
): Promise<string | null> {
  if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) {
    return null;
  }

  const moduleFile = await resolveModuleFile(moduleSpecifier.text, fromFile, filterContext);
  if (moduleFile === null || !await moduleFileProvidesSelectedSymbol(moduleFile, filterContext)) {
    return null;
  }

  return moduleFile;
}

/**
 * 解析（並依 filterContext 快取）目標模組檔 default export 底層宣告的名稱；
 * 無 default export 或無法判定名稱則回傳 undefined。
 */
async function getDefaultExportDeclaredName(
  moduleFile: string,
  filterContext: SymbolReferenceFilterContext
): Promise<string | undefined> {
  const normalizedModuleFile = normalizePath(moduleFile);
  if (filterContext.defaultExportDeclaredNameCache.has(normalizedModuleFile)) {
    return filterContext.defaultExportDeclaredNameCache.get(normalizedModuleFile);
  }

  const sourceFile = await tryGetSourceFile(moduleFile, filterContext);
  const declaredName = sourceFile ? findDefaultExportDeclaredName(sourceFile) : undefined;
  filterContext.defaultExportDeclaredNameCache.set(normalizedModuleFile, declaredName);
  return declaredName;
}

/**
 * 掃描檔案頂層陳述式，找出 default export 底層宣告名稱，支援四種形式：
 * `export default function <name>`、`export default class <name>`、
 * `export default <Identifier>`（指向本檔既有宣告）、`export { <name> as default }`（本檔內具名宣告）。
 * `export { <name> as default } from './x'` 這種轉出他檔的 default 不在此列（名稱屬於他檔、非本檔宣告），
 * 一律視為無法判定。一個檔案至多一個 default export（TS 編譯期即擋重複宣告），命中即回傳。
 */
function findDefaultExportDeclaredName(sourceFile: ts.SourceFile): string | undefined {
  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
      && statement.name
      && hasDefaultKeyword(statement)
    ) {
      return statement.name.text;
    }

    if (ts.isExportAssignment(statement) && !statement.isExportEquals && ts.isIdentifier(statement.expression)) {
      return statement.expression.text;
    }

    if (
      ts.isExportDeclaration(statement)
      && !statement.moduleSpecifier
      && statement.exportClause
      && !ts.isNamespaceExport(statement.exportClause)
    ) {
      const defaultElement = statement.exportClause.elements.find(element => element.name.text === 'default');
      if (defaultElement?.propertyName) {
        return defaultElement.propertyName.text;
      }
    }
  }

  return undefined;
}

/** 節點是否帶有 `default` modifier（`export default function/class ...`） */
function hasDefaultKeyword(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }
  return !!ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword);
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
    return bindings.directNames.has(expression.text) && !identifierShadowedByLocalDeclaration(expression, sourceFile);
  }

  if (
    ts.isPropertyAccessExpression(expression)
    && expression.name.text === selectedSymbol.name
  ) {
    if (
      ts.isIdentifier(expression.expression)
      && bindings.namespaceNames.has(expression.expression.text)
      && !identifierShadowedByLocalDeclaration(expression.expression, sourceFile)
    ) {
      return true;
    }

    return receiverTargetsSelectedOwner(expression.expression, bindings, sourceFile);
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

  // exportedNames 只在具名 re-export 子句本身（ExportSpecifier）命中：`export { foo } from './x'`
  // 檔內任意同名 identifier（如函式內區域變數）並非該 export clause 的 token，不得裸名誤留
  return bindings.exportedNames.has(node.text) && ts.isExportSpecifier(node.parent);
}

/**
 * 判斷跨檔引用位置的 identifier 是否被「更近的非 import 詞法宣告」遮蔽。
 *
 * directNames 只以裸名比對命中該檔任意同名 identifier，會把遮蔽 import 的區域宣告
 * （for-of / for / catch 變數、參數、解構綁定、區域 const/let/var/function/class）誤判為對匯入符號的引用。
 * 複用同檔作用域機制 findNearestLexicalDeclarationName：若引用位置最近的可見詞法宣告
 * 不是 import binding，代表該名稱被區域宣告遮蔽，非目標引用。import binding 視為模組層宣告參與比較。
 * Identifier、CallExpression callee、namespace receiver（`ns.member` 的 `ns`）三條匹配路徑
 * 都要過這道檢查，尺一致才不會漏放呼叫式引用、也不會把被遮蔽的 namespace receiver 誤留。
 */
function identifierShadowedByLocalDeclaration(node: ts.Identifier, sourceFile: ts.SourceFile): boolean {
  const nearest = findNearestLexicalDeclarationName(sourceFile, node, node.text);
  return nearest !== undefined && !isImportBindingName(nearest);
}

/** 詞法宣告名稱節點是否來自 import binding（具名 import specifier 的 local 名） */
function isImportBindingName(name: ts.Identifier): boolean {
  return ts.isImportSpecifier(name.parent);
}
