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
import { isExcludedPropertyKeyIdentifier, nodeStartsAtLocation } from './ast-node-location.js';
import { identifierShadowedByLocalDeclaration } from '@plugins/typescript/lexical-scope-binding.js';
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
  // 先解析模組路徑（不要求該檔以「頂層具名／export *」曝露選定符號）。
  // `export * as ns from './def'` 的 barrel 不把 def 的成員掛在頂層，但仍可能把
  // `ns` 這個具名匯出綁成「包住 def 的 namespace 物件」——具名 import 那條路徑
  // 必須在 providesSelected 為 false 時仍能判定（對齊 rename 側 isNamespaceLocalNameExposed）。
  if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
    return;
  }
  const moduleFile = await resolveModuleFile(node.moduleSpecifier.text, fromFile, filterContext);
  if (moduleFile === null) {
    return;
  }

  const providesSelected = await moduleFileProvidesSelectedSymbol(moduleFile, filterContext);
  const symbolName = filterContext.selectedSymbol.name;
  const ownerName = filterContext.selectedOwnerName;
  const importClause = node.importClause;
  if (!importClause) {
    return;
  }

  if (importClause.name && providesSelected) {
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
    // `import * as ns from spec`：僅當 spec 以頂層（具名／export *）曝露選定符號時，
    // `ns.member` 才是對該符號的引用。純 `export * as api from './def'` 的 barrel
    // 頂層只有 `api`，`ns.member` 不成立（正確路徑是 `import { api }` 再 `api.member`）。
    if (providesSelected) {
      bindings.namespaceNames.add(namedBindings.name.text);
    }
    return;
  }

  for (const element of namedBindings.elements) {
    const importedName = element.propertyName?.text ?? element.name.text;
    if (providesSelected) {
      if (importedName === symbolName) {
        bindings.directNames.add(element.name.text);
      }
      if (ownerName && importedName === ownerName) {
        bindings.ownerNames.add(element.name.text);
      }
    }

    // `import { api } from './barrel'` / `import { api as local } from './barrel'`：
    // 當 barrel 把 `api` 宣告為 `export * as api from '<inner>'`（或經 export *／
    // 具名 re-export 轉發該 namespace 綁定），且 inner 提供選定符號時，本地名稱語意
    // 等同 namespace import，`local.selectedSymbol` 應視為引用。
    if (await moduleFileExportsNamespaceForSelectedSymbol(moduleFile, importedName, filterContext)) {
      bindings.namespaceNames.add(element.name.text);
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
        // 具名 re-export（`export { X }` / `export { X as Y }`）：clause 內有真正指向
        // 目標符號的 token，屬引用，供裸名比對。`export * as ns` 不會進此支（見
        // exportClauseExposesSymbol），其 namespace 綁定不在 exportedNames 語意內。
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
    // `export * from`：來源模組的全部頂層匯出一併轉出
    return true;
  }

  // `export * as ns from`：只曝露名為 ns 的 namespace 物件，不把來源成員掛到頂層。
  // 頂層 provides 判定必須回 false；namespace 綁定另由
  // moduleFileExportsNamespaceForSelectedSymbol 處理。
  if (ts.isNamespaceExport(exportClause)) {
    return false;
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
export async function getDefaultExportDeclaredName(
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

/**
 * 檔案內名為 `localName` 的具名匯出，是否為「指向提供選定符號之模組的 namespace 轉發」。
 *
 * 對齊 rename 側 `isNamespaceLocalNameExposed`：
 * - `export * as localName from '<spec>'`，且 spec 以頂層（具名／export *／定義檔本身）提供選定符號
 * - `export * from '<spec>'` 把上游的同名 namespace 綁定一併轉出
 * - `export { localName }` / `export { src as localName } from '<spec>'` 沿來源名稱往內追
 *
 * 與 `moduleFileProvidesSelectedSymbol` 分屬不同查詢：後者問「file 是否把選定符號
 * 掛在頂層匯出」（consumer 可 `import { symbol }`）；此處問「file 的『這一個』具名
 * 匯出是否為包住選定符號來源的 namespace 物件」（consumer 只能 `import { ns }` 再 `ns.symbol`）。
 * 故 `export * as ns from './def'` 的 barrel 對 def 成員回 false 於 provides、回 true 於此
 * （對 `ns` 這個 localName）。
 */
async function moduleFileExportsNamespaceForSelectedSymbol(
  filePath: string,
  localName: string,
  filterContext: SymbolReferenceFilterContext,
  visiting: Set<string> = new Set()
): Promise<boolean> {
  const normalizedFilePath = normalizePath(filePath);
  const visitKey = `${normalizedFilePath}::${localName}`;
  if (visiting.has(visitKey)) {
    return false;
  }

  if (
    !await filterContext.fileSystem.exists(normalizedFilePath)
    || !await filterContext.fileSystem.isFile(normalizedFilePath)
  ) {
    return false;
  }

  const sourceFile = await tryGetSourceFile(normalizedFilePath, filterContext);
  if (!sourceFile) {
    return false;
  }

  visiting.add(visitKey);
  try {
    for (const statement of sourceFile.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) {
        continue;
      }
      if (!ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }

      const resolved = await resolveModuleFile(
        statement.moduleSpecifier.text,
        normalizedFilePath,
        filterContext
      );
      if (resolved === null) {
        continue;
      }

      // `export * as localName from '<spec>'`：namespace 物件綁定
      if (statement.exportClause && ts.isNamespaceExport(statement.exportClause)) {
        if (
          statement.exportClause.name.text === localName
          && await moduleFileProvidesSelectedSymbol(resolved, filterContext)
        ) {
          return true;
        }
        continue;
      }

      // `export * from '<spec>'`：把上游具名（含 namespace 轉發綁定）一併轉出
      if (!statement.exportClause) {
        if (await moduleFileExportsNamespaceForSelectedSymbol(resolved, localName, filterContext, visiting)) {
          return true;
        }
        continue;
      }

      // `export { localName }` / `export { src as localName } from '<spec>'`
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (element.name.text !== localName) {
            continue;
          }
          const sourceName = element.propertyName?.text ?? element.name.text;
          if (await moduleFileExportsNamespaceForSelectedSymbol(resolved, sourceName, filterContext, visiting)) {
            return true;
          }
        }
      }
    }

    return false;
  } finally {
    visiting.delete(visitKey);
  }
}

export function locationMatchesSelectedBinding(
  sourceFile: ts.SourceFile,
  location: SymbolLocationTarget,
  bindings: SelectedSymbolBindings,
  selectedSymbol: Symbol,
  selectedOwnerName: string | undefined
): boolean {
  let matches = false;

  const visit = (node: ts.Node): void => {
    if (matches) {
      return;
    }

    if (ts.isCallExpression(node) && nodeStartsAtLocation(node, sourceFile, location)) {
      matches = expressionTargetsSelectedBinding(node.expression, bindings, selectedSymbol, sourceFile, selectedOwnerName);
      return;
    }

    if (ts.isIdentifier(node) && nodeStartsAtLocation(node, sourceFile, location)) {
      matches = identifierTargetsSelectedBinding(node, bindings, selectedSymbol, sourceFile, selectedOwnerName);
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
  sourceFile: ts.SourceFile,
  selectedOwnerName: string | undefined
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

    // owner 成員存取：selectedOwnerName 有值代表選定符號確為類別成員（即使 owner class
    // 未 import 進本檔而 ownerNames 為空），據此區分「非成員符號的同名屬性」不誤留。
    return receiverTargetsSelectedOwner(
      expression.expression,
      bindings,
      sourceFile,
      selectedOwnerName !== undefined
    );
  }

  return false;
}

function identifierTargetsSelectedBinding(
  node: ts.Identifier,
  bindings: SelectedSymbolBindings,
  selectedSymbol: Symbol,
  sourceFile: ts.SourceFile,
  selectedOwnerName: string | undefined
): boolean {
  const parent = node.parent;
  if (
    parent
    && ts.isPropertyAccessExpression(parent)
    && parent.name === node
    && parent.name.text === selectedSymbol.name
  ) {
    return expressionTargetsSelectedBinding(parent, bindings, selectedSymbol, sourceFile, selectedOwnerName);
  }

  // interface/type literal 屬性簽名鍵與 object literal 非 shorthand 鍵：名稱字面重合，
  // 但不是對選定綁定的引用，裸名比對前先排除（shorthand 例外，見 helper 文件）。
  if (isExcludedPropertyKeyIdentifier(node)) {
    return false;
  }

  if (bindings.directNames.has(node.text) && !identifierShadowedByLocalDeclaration(node, sourceFile)) {
    return true;
  }

  // exportedNames 只在具名 re-export 子句本身（ExportSpecifier）命中：`export { foo } from './x'`
  // 檔內任意同名 identifier（如函式內區域變數）並非該 export clause 的 token，不得裸名誤留
  return bindings.exportedNames.has(node.text) && ts.isExportSpecifier(node.parent);
}
