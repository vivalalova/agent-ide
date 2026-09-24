/**
 * Rename 綁定衝突偵測（F2）
 *
 * 判定：對每個即將被改名的「詞法位置」（宣告或引用的識別符），以 TypeScript checker
 * 的 resolveName(newName, 該位置) 查新名稱在此處是否已綁定到別的符號。
 * - 已綁定 → rename 後此位置不是與既有宣告撞名（同 scope：NameCollision），
 *   就是引用被既有綁定捕獲／既有外層綁定被新宣告遮蔽（ScopeConflict）。
 * - 屬性名、import/export 的外部名稱等非詞法位置不參與判定，避免誤報。
 *
 * TS 與 JS（allowJs）檔案共用同一條路徑；每檔獨立建 noLib/noResolve 單檔 program，
 * 不載入 lib 全域（否則 `name`、`length` 等 DOM 全域會造成大量誤報）。
 */

import * as ts from 'typescript';
import type { Range } from '@shared/types/core.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { ConflictType, createConflictInfo, type ConflictInfo } from './types.js';

export interface RenameEditLocation {
  readonly range: Range;
}

const SCRIPT_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/i;

export async function detectBindingConflicts(
  fileSystem: IFileSystem,
  oldName: string,
  newName: string,
  fileChanges: ReadonlyArray<{ filePath: string; changes: ReadonlyArray<RenameEditLocation> }>
): Promise<ConflictInfo[]> {
  const conflicts: ConflictInfo[] = [];

  for (const { filePath, changes } of fileChanges) {
    if (!SCRIPT_EXTENSIONS.test(filePath) || changes.length === 0) {
      continue;
    }
    const content = await fileSystem.readFile(filePath, 'utf-8') as string;
    const { sourceFile, checker } = createSingleFileChecker(filePath, content);
    const reported = new Set<ts.Symbol>();

    for (const change of changes) {
      const pos = toOffset(sourceFile, change.range);
      if (pos === undefined) {continue;}
      const node = findIdentifierAt(sourceFile, pos);
      if (!node || node.text !== oldName || !isLexicalPosition(node)) {continue;}

      const own = referencedSymbol(checker, node);
      const meaning = own ? meaningOf(own) : ts.SymbolFlags.Value | ts.SymbolFlags.Type | ts.SymbolFlags.Namespace;
      const existing = checker.resolveName(newName, node, meaning, false);
      if (!existing || existing === own || reported.has(existing)) {continue;}

      const decl = existing.declarations?.[0];
      const ownDecl = own?.declarations?.[0];
      const existingScope = decl ? enclosingScope(decl) : undefined;
      const ownScope = ownDecl ? enclosingScope(ownDecl) : undefined;
      const sameScope = existingScope !== undefined && existingScope === ownScope;
      // existing 在外層、own 將遮蔽它：只有 own scope 內原本引用 existing 的識別符會被捕獲
      if (!sameScope && existingScope && ownScope && strictlyEncloses(existingScope, ownScope)
        && !referencesSymbolWithin(ownScope, newName, existing, checker)) {continue;}
      reported.add(existing);
      const location = decl && decl.getSourceFile() === sourceFile
        ? toLocation(filePath, sourceFile, decl)
        : { filePath, range: change.range };
      const line = change.range.start.line;

      conflicts.push(sameScope
        ? createConflictInfo(
          ConflictType.NameCollision,
          `'${newName}' 在 '${oldName}' 的作用域中已存在（${filePath}:${line}），改名會產生重複宣告`,
          location
        )
        : createConflictInfo(
          ConflictType.ScopeConflict,
          `'${newName}' 在 ${filePath}:${line} 已綁定到其他符號，改名會造成遮蔽或引用被捕獲`,
          location
        ));
    }
  }

  return conflicts;
}

function strictlyEncloses(outer: ts.Node, inner: ts.Node): boolean {
  for (let current = inner.parent; current; current = current.parent) {
    if (current === outer) {return true;}
  }
  return false;
}

function referencesSymbolWithin(scope: ts.Node, name: string, target: ts.Symbol, checker: ts.TypeChecker): boolean {
  const visit = (node: ts.Node): boolean => {
    if (ts.isIdentifier(node) && node.text === name && isLexicalPosition(node)
      && referencedSymbol(checker, node) === target) {return true;}
    return ts.forEachChild(node, visit) ?? false;
  };
  return visit(scope);
}

/** shorthand 屬性與本地 export specifier 的 getSymbolAtLocation 回傳屬性／別名符號，須改取其引用的本地綁定 */
function referencedSymbol(checker: ts.TypeChecker, node: ts.Identifier): ts.Symbol | undefined {
  const parent = node.parent;
  if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) {
    return checker.getShorthandAssignmentValueSymbol(parent);
  }
  if (ts.isExportSpecifier(parent) && !parent.parent.parent.moduleSpecifier) {
    return checker.getExportSpecifierLocalTargetSymbol(parent);
  }
  return checker.getSymbolAtLocation(node);
}

function createSingleFileChecker(filePath: string, content: string): { sourceFile: ts.SourceFile; checker: ts.TypeChecker } {
  const options: ts.CompilerOptions = {
    noLib: true,
    noResolve: true,
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.Latest
  };
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const host: ts.CompilerHost = {
    getSourceFile: name => (name === filePath ? sourceFile : undefined),
    getDefaultLibFileName: () => 'lib.d.ts',
    writeFile: () => undefined,
    getCurrentDirectory: () => '/',
    getCanonicalFileName: name => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: name => name === filePath,
    readFile: name => (name === filePath ? content : undefined)
  };
  const program = ts.createProgram([filePath], options, host);
  return { sourceFile: program.getSourceFile(filePath) ?? sourceFile, checker: program.getTypeChecker() };
}

function toOffset(sourceFile: ts.SourceFile, range: Range): number | undefined {
  const line = range.start.line - 1;
  if (line < 0 || line >= sourceFile.getLineStarts().length) {return undefined;}
  return ts.getPositionOfLineAndCharacter(sourceFile, line, Math.max(0, range.start.column - 1));
}

function findIdentifierAt(sourceFile: ts.SourceFile, pos: number): ts.Identifier | undefined {
  const visit = (node: ts.Node): ts.Identifier | undefined => {
    if (pos < node.getStart(sourceFile) || pos >= node.getEnd()) {return undefined;}
    if (ts.isIdentifier(node)) {return node;}
    return ts.forEachChild(node, visit);
  };
  return visit(sourceFile);
}

/** 只有詞法綁定／引用位置會受同名綁定影響；屬性名與模組外部名稱不會 */
function isLexicalPosition(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {return false;}
  if (ts.isQualifiedName(parent) && parent.right === node) {return false;}
  if (ts.isImportSpecifier(parent) && parent.propertyName === node) {return false;}
  if (ts.isExportSpecifier(parent)) {
    if (parent.parent.parent.moduleSpecifier) {return false;}
    if (parent.propertyName !== undefined && parent.name === node) {return false;}
  }
  if ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent)
    || ts.isMethodDeclaration(parent) || ts.isMethodSignature(parent) || ts.isGetAccessorDeclaration(parent)
    || ts.isSetAccessorDeclaration(parent) || ts.isEnumMember(parent)) && parent.name === node) {return false;}
  if (ts.isBindingElement(parent) && parent.propertyName === node) {return false;}
  if (ts.isJsxAttribute(parent) || ts.isLabeledStatement(parent)
    || ts.isBreakOrContinueStatement(parent)) {return false;}
  return true;
}

function meaningOf(symbol: ts.Symbol): ts.SymbolFlags {
  const flags = symbol.flags;
  if (flags & ts.SymbolFlags.Alias) {
    return ts.SymbolFlags.Value | ts.SymbolFlags.Type | ts.SymbolFlags.Namespace;
  }
  let meaning = ts.SymbolFlags.None;
  if (flags & ts.SymbolFlags.Value) {meaning |= ts.SymbolFlags.Value;}
  if (flags & ts.SymbolFlags.Type) {meaning |= ts.SymbolFlags.Type;}
  if (flags & ts.SymbolFlags.Namespace) {meaning |= ts.SymbolFlags.Namespace;}
  return meaning === ts.SymbolFlags.None ? ts.SymbolFlags.Value | ts.SymbolFlags.Type | ts.SymbolFlags.Namespace : meaning;
}

/** 宣告所屬的 scope 容器（var/function 提升到 function，let/const/class 用區塊） */
function enclosingScope(decl: ts.Node): ts.Node | undefined {
  const isVar = ts.isVariableDeclaration(decl) && ts.isVariableDeclarationList(decl.parent)
    && (decl.parent.flags & ts.NodeFlags.BlockScoped) === 0;
  const hoisted = isVar || ts.isFunctionDeclaration(decl) || ts.isParameter(decl);
  let current: ts.Node | undefined = decl.parent;
  while (current) {
    if (ts.isSourceFile(current) || ts.isModuleBlock(current) || ts.isFunctionLike(current)) {return current;}
    if (!hoisted && (ts.isBlock(current) || ts.isForStatement(current) || ts.isForInStatement(current) || ts.isForOfStatement(current)
      || ts.isCaseBlock(current) || ts.isCatchClause(current))) {return current;}
    current = current.parent;
  }
  return undefined;
}

function toLocation(filePath: string, sourceFile: ts.SourceFile, decl: ts.Declaration) {
  const nameNode = ts.getNameOfDeclaration(decl) ?? decl;
  const start = sourceFile.getLineAndCharacterOfPosition(nameNode.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(nameNode.getEnd());
  return {
    filePath,
    range: {
      start: { line: start.line + 1, column: start.character + 1 },
      end: { line: end.line + 1, column: end.character + 1 }
    }
  };
}
