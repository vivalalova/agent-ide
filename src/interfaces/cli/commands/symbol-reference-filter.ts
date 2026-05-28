/**
 * Filters read-only symbol references to the definition selected by --at.
 */

import * as path from 'path';
import * as ts from 'typescript';
import type { SymbolReference } from '@core/foundations/symbol-finder/index.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import {
  loadTsconfigPathConfig,
  type TsconfigPathConfig
} from '@plugins/typescript/tsconfig-loader.js';
import {
  getImportResolutionExtensions,
  SOURCE_FILE_EXTENSIONS,
  stripSourceFileExtension
} from '@shared/types/index.js';
import type { Symbol } from '@shared/types/symbol.js';

interface SymbolReferenceFilterContext {
  readonly selectedSymbol: Symbol;
  readonly selectedOwnerName?: string;
  readonly targetFile: string;
  readonly projectPath: string;
  readonly fileSystem: IFileSystem;
  readonly moduleProviderCache: Map<string, boolean>;
  readonly visitingModuleFiles: Set<string>;
  readonly fileAnalysisCache: Map<string, SelectedSymbolFileAnalysis>;
  readonly sourceFileCache: Map<string, ts.SourceFile>;
  readonly moduleResolution: TsconfigPathConfig;
}

interface SelectedSymbolBindings {
  readonly directNames: Set<string>;
  readonly namespaceNames: Set<string>;
  readonly exportedNames: Set<string>;
  readonly ownerNames: Set<string>;
}

interface SelectedSymbolFileAnalysis {
  readonly sourceFile: ts.SourceFile;
  readonly bindings: SelectedSymbolBindings;
}

interface SymbolLocationTarget {
  readonly file: string;
  readonly line: number;
  readonly column?: number;
}

export async function filterReferencesToSelectedSymbol(
  references: readonly SymbolReference[],
  selectedSymbol: Symbol,
  projectPath: string,
  fileSystem: IFileSystem
): Promise<SymbolReference[]> {
  const filterContext = await createSymbolReferenceFilterContext(selectedSymbol, projectPath, fileSystem);
  const filteredReferences: SymbolReference[] = [];

  for (const reference of references) {
    if (isSelectedSymbolDefinition(reference, selectedSymbol)) {
      filteredReferences.push(reference);
      continue;
    }

    if (
      await symbolLocationTargetsSelectedSymbol(
        {
          file: reference.location.filePath,
          line: reference.location.range.start.line,
          column: reference.location.range.start.column
        },
        filterContext
      )
    ) {
      filteredReferences.push(reference);
    }
  }

  return filteredReferences;
}

function isSelectedSymbolDefinition(reference: SymbolReference, selectedSymbol: Symbol): boolean {
  const referenceStart = reference.location.range.start;
  const symbolStart = selectedSymbol.location.range.start;
  return reference.type === 'definition'
    && normalizePath(reference.location.filePath) === normalizePath(selectedSymbol.location.filePath)
    && referenceStart.line === symbolStart.line
    && referenceStart.column === symbolStart.column;
}

export async function locationTargetsSelectedSymbol(
  location: SymbolLocationTarget,
  selectedSymbol: Symbol,
  projectPath: string,
  fileSystem: IFileSystem
): Promise<boolean> {
  const locationFilter = await createSelectedSymbolLocationFilter(selectedSymbol, projectPath, fileSystem);
  return await locationFilter(location);
}

export async function createSelectedSymbolLocationFilter(
  selectedSymbol: Symbol,
  projectPath: string,
  fileSystem: IFileSystem
): Promise<(location: SymbolLocationTarget) => Promise<boolean>> {
  const filterContext = await createSymbolReferenceFilterContext(selectedSymbol, projectPath, fileSystem);
  return async location => await symbolLocationTargetsSelectedSymbol(location, filterContext);
}

async function createSymbolReferenceFilterContext(
  selectedSymbol: Symbol,
  projectPath: string,
  fileSystem: IFileSystem
): Promise<SymbolReferenceFilterContext> {
  const selectedOwnerName = await getSelectedOwnerName(selectedSymbol, fileSystem);
  const moduleResolution = await loadTsconfigPathConfig(projectPath, fileSystem);
  return {
    selectedSymbol,
    ...(selectedOwnerName ? { selectedOwnerName } : {}),
    targetFile: normalizePath(selectedSymbol.location.filePath),
    projectPath,
    fileSystem,
    moduleProviderCache: new Map(),
    visitingModuleFiles: new Set(),
    fileAnalysisCache: new Map(),
    sourceFileCache: new Map(),
    moduleResolution
  };
}

async function symbolLocationTargetsSelectedSymbol(
  location: SymbolLocationTarget,
  filterContext: SymbolReferenceFilterContext
): Promise<boolean> {
  const referenceFile = normalizePath(location.file);
  const content = await readTextFile(referenceFile, filterContext.fileSystem);
  if (referenceFile === filterContext.targetFile) {
    return sameFileLocationTargetsSelectedSymbol(content, referenceFile, location, filterContext);
  }

  const analysis = await getSelectedSymbolFileAnalysis(content, referenceFile, filterContext);
  return locationMatchesSelectedBinding(
    analysis.sourceFile,
    location,
    analysis.bindings,
    filterContext.selectedSymbol
  );
}

async function readTextFile(filePath: string, fileSystem: IFileSystem): Promise<string> {
  const content = await fileSystem.readFile(filePath, 'utf-8');
  return typeof content === 'string' ? content : content.toString('utf-8');
}

async function getSelectedSymbolFileAnalysis(
  content: string,
  filePath: string,
  filterContext: SymbolReferenceFilterContext
): Promise<SelectedSymbolFileAnalysis> {
  const normalizedFilePath = normalizePath(filePath);
  const cached = filterContext.fileAnalysisCache.get(normalizedFilePath);
  if (cached) {
    return cached;
  }

  const sourceFile = getSourceFile(filePath, content, filterContext);

  const bindings: SelectedSymbolBindings = {
    directNames: new Set<string>(),
    namespaceNames: new Set<string>(),
    exportedNames: new Set<string>(),
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

function getSourceFile(
  filePath: string,
  content: string,
  filterContext: SymbolReferenceFilterContext
): ts.SourceFile {
  const normalizedFilePath = normalizePath(filePath);
  const cached = filterContext.sourceFileCache.get(normalizedFilePath);
  if (cached) {
    return cached;
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath)
  );
  filterContext.sourceFileCache.set(normalizedFilePath, sourceFile);
  return sourceFile;
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
      bindings.exportedNames.add(symbolName);
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
    const content = await readTextFile(normalizedFilePath, filterContext.fileSystem);
    const analysis = await getSelectedSymbolFileAnalysis(content, normalizedFilePath, filterContext);
    const providesSymbol = analysis.bindings.exportedNames.has(filterContext.selectedSymbol.name);
    if (providesSymbol) {
      filterContext.moduleProviderCache.set(normalizedFilePath, true);
    }
    return providesSymbol;
  } finally {
    filterContext.visitingModuleFiles.delete(normalizedFilePath);
  }
}

function locationMatchesSelectedBinding(
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

async function resolveModuleFile(
  importPath: string,
  fromFile: string,
  filterContext: SymbolReferenceFilterContext
): Promise<string | null> {
  const candidates = getModuleFileCandidates(importPath, fromFile, filterContext);

  for (const candidate of candidates) {
    if (pathMatchesTarget(candidate, filterContext.targetFile)) {
      return filterContext.targetFile;
    }
  }

  for (const candidate of candidates) {
    if (await filterContext.fileSystem.exists(candidate) && await filterContext.fileSystem.isFile(candidate)) {
      return normalizePath(candidate);
    }
  }

  return null;
}

function resolveImportPath(
  importPath: string,
  fromFile: string,
  filterContext: SymbolReferenceFilterContext
): string {
  if (importPath.startsWith('.')) {
    return path.resolve(path.dirname(fromFile), importPath);
  }

  const aliasResolvedPath = resolvePathAlias(importPath, filterContext.moduleResolution.pathAliases);
  if (aliasResolvedPath) {
    return aliasResolvedPath;
  }

  if (filterContext.moduleResolution.baseUrl) {
    return path.resolve(filterContext.moduleResolution.baseUrl, importPath);
  }

  if (importPath.startsWith('src/')) {
    return path.resolve(filterContext.projectPath, importPath);
  }

  return importPath;
}

function resolvePathAlias(importPath: string, pathAliases: Record<string, string>): string | null {
  const aliasEntries = Object.entries(pathAliases)
    .sort(([left], [right]) => right.length - left.length);

  for (const [alias, resolvedAliasPath] of aliasEntries) {
    if (importPath === alias || importPath.startsWith(`${alias}/`)) {
      const remainingPath = importPath.slice(alias.length).replace(/^\//, '');
      return path.join(resolvedAliasPath, remainingPath);
    }
  }

  return null;
}

function getModuleFileCandidates(
  importPath: string,
  fromFile: string,
  filterContext: SymbolReferenceFilterContext
): string[] {
  const resolvedPath = resolveImportPath(importPath, fromFile, filterContext);
  if (!path.isAbsolute(resolvedPath)) {
    return [resolvedPath];
  }

  const extension = path.extname(resolvedPath);
  const directCandidates = extension
    ? getImportResolutionExtensions(extension).map(candidateExtension =>
      `${resolvedPath.slice(0, -extension.length)}${candidateExtension}`
    )
    : SOURCE_FILE_EXTENSIONS.map(candidateExtension => `${resolvedPath}${candidateExtension}`);
  const indexCandidates = SOURCE_FILE_EXTENSIONS.map(candidateExtension =>
    path.join(resolvedPath, `index${candidateExtension}`)
  );

  return [...new Set([resolvedPath, ...directCandidates, ...indexCandidates].map(candidate => normalizePath(candidate)))];
}

function pathMatchesTarget(importPath: string, targetFile: string): boolean {
  const normalizedImportPath = normalizePath(importPath);
  const normalizedTargetFile = normalizePath(targetFile);

  if (normalizedImportPath === normalizedTargetFile) {
    return true;
  }

  if (stripSourceFileExtension(normalizedImportPath) === stripSourceFileExtension(normalizedTargetFile)) {
    return true;
  }

  const importExtension = path.extname(normalizedImportPath);
  const baseImportPath = importExtension
    ? normalizedImportPath.slice(0, -importExtension.length)
    : normalizedImportPath;

  return getImportResolutionExtensions(importExtension).some(extension =>
    normalizePath(`${baseImportPath}${extension}`) === normalizedTargetFile
  );
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

  return bindings.directNames.has(node.text) || bindings.exportedNames.has(node.text);
}

async function getSelectedOwnerName(
  selectedSymbol: Symbol,
  fileSystem: IFileSystem
): Promise<string | undefined> {
  const scopedOwnerName = getScopedOwnerName(selectedSymbol);
  if (scopedOwnerName) {
    return scopedOwnerName;
  }

  const content = await readTextFile(selectedSymbol.location.filePath, fileSystem);
  const sourceFile = ts.createSourceFile(
    selectedSymbol.location.filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(selectedSymbol.location.filePath)
  );
  return findOwnerClassNameAtLocation(sourceFile, {
    file: selectedSymbol.location.filePath,
    line: selectedSymbol.location.range.start.line,
    column: selectedSymbol.location.range.start.column
  });
}

function getScopedOwnerName(symbol: Symbol): string | undefined {
  if (symbol.scope?.parent?.type === 'class') {
    return symbol.scope.parent.name;
  }

  if (symbol.scope?.type === 'class') {
    return symbol.scope.name;
  }

  return undefined;
}

function findOwnerClassNameAtLocation(
  sourceFile: ts.SourceFile,
  location: SymbolLocationTarget
): string | undefined {
  let ownerName: string | undefined;

  const visit = (node: ts.Node): void => {
    if (ownerName) {
      return;
    }

    if (ts.isClassDeclaration(node) && node.name) {
      for (const member of node.members) {
        const name = getMemberNameNode(member);
        if (name && nodeStartsAtLocation(name, sourceFile, location)) {
          ownerName = node.name.text;
          return;
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return ownerName;
}

function getMemberNameNode(member: ts.ClassElement): ts.Identifier | undefined {
  if (
    (
      ts.isMethodDeclaration(member)
      || ts.isPropertyDeclaration(member)
      || ts.isGetAccessorDeclaration(member)
      || ts.isSetAccessorDeclaration(member)
    )
    && ts.isIdentifier(member.name)
  ) {
    return member.name;
  }

  return undefined;
}

function sameFileLocationTargetsSelectedSymbol(
  content: string,
  filePath: string,
  location: SymbolLocationTarget,
  filterContext: SymbolReferenceFilterContext
): boolean {
  const sourceFile = getSourceFile(filePath, content, filterContext);
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

  if (
    propertyAccess.expression.kind === ts.SyntaxKind.ThisKeyword
    && nodeIsInsideClass(propertyAccess, ownerName)
  ) {
    return true;
  }

  return receiverTargetsOwnerName(
    propertyAccess.expression,
    ownerName,
    sourceFile,
    propertyAccess.getStart(sourceFile)
  );
}

function findNearestLexicalDeclarationName(
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
          && (isHoistedLexicalDeclaration(node) || nameStart <= referenceStart)
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

function findAncestor(
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

function receiverTargetsSelectedOwner(
  receiver: ts.Expression,
  bindings: SelectedSymbolBindings,
  sourceFile: ts.SourceFile,
  referenceStart: number
): boolean {
  if (bindings.ownerNames.size === 0) {
    return false;
  }

  if (ts.isParenthesizedExpression(receiver)) {
    return receiverTargetsSelectedOwner(receiver.expression, bindings, sourceFile, referenceStart);
  }

  if (ts.isNewExpression(receiver)) {
    return constructorTargetsSelectedOwner(receiver.expression, bindings);
  }

  if (ts.isIdentifier(receiver)) {
    return bindings.ownerNames.has(receiver.text)
      || variableInitializedWithSelectedOwner(receiver.text, sourceFile, referenceStart, bindings);
  }

  return false;
}

function constructorTargetsSelectedOwner(
  expression: ts.Expression,
  bindings: SelectedSymbolBindings
): boolean {
  return ts.isIdentifier(expression) && bindings.ownerNames.has(expression.text);
}

function variableInitializedWithSelectedOwner(
  variableName: string,
  sourceFile: ts.SourceFile,
  referenceStart: number,
  bindings: SelectedSymbolBindings
): boolean {
  return variableInitializedWithOwner(variableName, sourceFile, referenceStart, ownerName =>
    bindings.ownerNames.has(ownerName)
  );
}

function receiverTargetsOwnerName(
  receiver: ts.Expression,
  ownerName: string,
  sourceFile: ts.SourceFile,
  referenceStart: number
): boolean {
  if (ts.isParenthesizedExpression(receiver)) {
    return receiverTargetsOwnerName(receiver.expression, ownerName, sourceFile, referenceStart);
  }

  if (ts.isNewExpression(receiver)) {
    return constructorTargetsOwnerName(receiver.expression, ownerName);
  }

  if (ts.isIdentifier(receiver)) {
    return receiver.text === ownerName
      || variableInitializedWithOwner(receiver.text, sourceFile, referenceStart, candidateOwnerName =>
        candidateOwnerName === ownerName
      );
  }

  return false;
}

function constructorTargetsOwnerName(expression: ts.Expression, ownerName: string): boolean {
  return ts.isIdentifier(expression) && expression.text === ownerName;
}

function variableInitializedWithOwner(
  variableName: string,
  sourceFile: ts.SourceFile,
  referenceStart: number,
  ownerMatches: (ownerName: string) => boolean
): boolean {
  let matches = false;

  const visit = (node: ts.Node): void => {
    if (matches) {
      return;
    }

    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === variableName
      && node.initializer
      && node.getStart(sourceFile) < referenceStart
      && ts.isNewExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression)
      && ownerMatches(node.initializer.expression.text)
    ) {
      matches = true;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return matches;
}

function nodeIsInsideClass(node: ts.Node, ownerName: string): boolean {
  const classNode = findAncestor(node, ts.isClassDeclaration);
  return !!classNode && ts.isClassDeclaration(classNode) && !!classNode.name && classNode.name.text === ownerName;
}

function nodeNameMatchesSelectedSymbol(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  selectedSymbol: Symbol
): boolean {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1 === selectedSymbol.location.range.start.line
    && character + 1 === selectedSymbol.location.range.start.column;
}

function nodeStartsAtLocation(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  location: SymbolLocationTarget
): boolean {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1 === location.line
    && (location.column === undefined || character + 1 === location.column);
}

function getScriptKind(filePath: string): ts.ScriptKind {
  switch (path.extname(filePath)) {
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.tsx':
      return ts.ScriptKind.TSX;
    default:
      return ts.ScriptKind.TS;
  }
}

function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}
