/**
 * 跨檔 class 繼承族譜解析器
 *
 * parser 逐檔解析成員存取時只看得到 consumer 檔：`import { Sub } from './sub'; new Sub().m()` 的 Sub
 * 是否繼承 owner class 只寫在 sub 檔內。本解析器在 rename 引擎層預先掃描專案檔的 class 宣告、
 * extends、import 與 export（含 re-export），回傳同步述詞：給定「匯入檔 + specifier + 匯入名」
 * 判定該 class 是否為 owner 本身或其遞迴子類（見 ClassFamilyResolver）。
 */

import * as path from 'path';
import * as ts from 'typescript';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { ClassFamilyOwner, ClassFamilyResolver } from '@infrastructure/parser/types.js';
import type { PathAliasInput } from '@shared/path-alias-resolver.js';
import { collectTopLevelImportBindings, type TopLevelImportBinding } from '@core/foundations/index.js';
import { createProjectFileLocator } from './project-file-locator.js';

export interface ClassFamilyConfig {
  readonly fileSystem: IFileSystem;
  /** 專案內所有原始碼檔案（絕對或相對路徑皆可，內部一律正規化為絕對） */
  readonly projectFiles: readonly string[];
  readonly pathAliases?: PathAliasInput;
  readonly baseUrl?: string;
}

/** extends／re-export 鏈追蹤上限（防環之外的保險） */
const MAX_FAMILY_DEPTH = 16;

/** 匿名 `export default class` 的內部 local 名 */
const ANONYMOUS_DEFAULT_CLASS = '*default*';

/** superclass 表達式：同檔識別符，或 namespace import 成員（`ns.Base`） */
interface SuperClassRef {
  readonly name: string;
  readonly member?: string;
}

type ExportTarget =
  | { readonly localName: string }
  | { readonly specifier: string; readonly importedName: string };

interface LocalClassInfo {
  /** 無 extends 為 undefined */
  readonly superClass?: SuperClassRef;
  /** 自身宣告的成員鍵（見 memberKey） */
  readonly members: ReadonlySet<string>;
}

interface FileClassInfo {
  /** local class 名 → 宣告資訊 */
  readonly classes: Map<string, LocalClassInfo>;
  readonly imports: ReadonlyMap<string, TopLevelImportBinding>;
  readonly exports: Map<string, ExportTarget>;
  /** `export * from` 的 specifier（不轉發 default） */
  readonly starReexports: string[];
}

function getSuperClassRef(node: ts.ClassLikeDeclaration): SuperClassRef | undefined {
  const extendsClause = node.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword);
  const expression = extendsClause?.types[0]?.expression;
  if (!expression) {
    return undefined;
  }
  if (ts.isIdentifier(expression)) {
    return { name: expression.text };
  }
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    return { name: expression.expression.text, member: expression.name.text };
  }
  return undefined;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(modifier => modifier.kind === kind);
}

/** 成員鍵：static 與 instance 分屬不同命名空間 */
function memberKey(name: string, isStatic: boolean): string {
  return `${isStatic ? 'static' : 'instance'}:${name}`;
}

/** class 自身宣告的 method／getter／setter／property 成員鍵（不含 constructor 與 `#private`） */
function collectDeclaredMembers(node: ts.ClassLikeDeclaration): Set<string> {
  const members = new Set<string>();
  for (const member of node.members) {
    const isMember = ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member)
      || ts.isSetAccessorDeclaration(member) || ts.isPropertyDeclaration(member);
    const name = member.name;
    if (isMember && name && (ts.isIdentifier(name) || ts.isStringLiteral(name))) {
      members.add(memberKey(name.text, hasModifier(member, ts.SyntaxKind.StaticKeyword)));
    }
  }
  return members;
}

function toLocalClassInfo(node: ts.ClassLikeDeclaration): LocalClassInfo {
  return { superClass: getSuperClassRef(node), members: collectDeclaredMembers(node) };
}

function parseFileClassInfo(filePath: string, content: string): FileClassInfo {
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const info: FileClassInfo = {
    classes: new Map(),
    imports: collectTopLevelImportBindings(sourceFile),
    exports: new Map(),
    starReexports: []
  };

  for (const statement of sourceFile.statements) {
    if (ts.isClassDeclaration(statement)) {
      const localName = statement.name?.text ?? ANONYMOUS_DEFAULT_CLASS;
      info.classes.set(localName, toLocalClassInfo(statement));
      if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
        const exportedName = hasModifier(statement, ts.SyntaxKind.DefaultKeyword) ? 'default' : localName;
        info.exports.set(exportedName, { localName });
      }
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isClassExpression(declaration.initializer)) {
          continue;
        }
        const localName = declaration.name.text;
        info.classes.set(localName, toLocalClassInfo(declaration.initializer));
        if (isExported) {
          info.exports.set(localName, { localName });
        }
      }
      continue;
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals && ts.isIdentifier(statement.expression)) {
      info.exports.set('default', { localName: statement.expression.text });
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : undefined;
      if (!statement.exportClause) {
        if (specifier !== undefined) {
          info.starReexports.push(specifier);
        }
        continue;
      }
      if (!ts.isNamedExports(statement.exportClause)) {
        continue;
      }
      for (const element of statement.exportClause.elements) {
        const sourceName = element.propertyName?.text ?? element.name.text;
        info.exports.set(
          element.name.text,
          specifier !== undefined ? { specifier, importedName: sourceName } : { localName: sourceName }
        );
      }
    }
  }
  return info;
}

/**
 * 建立 class 族譜述詞。預先讀取並解析專案檔（唯一 I/O 階段），之後述詞全同步；
 * 遞迴以 visited set 防環並設深度上限，只快取確定成立（true）的結果。
 */
export async function createClassFamilyResolver(config: ClassFamilyConfig): Promise<ClassFamilyResolver> {
  const infoByFile = new Map<string, FileClassInfo>();
  for (const file of config.projectFiles) {
    const fileAbs = path.resolve(file);
    let content: string;
    try {
      content = await config.fileSystem.readFile(fileAbs, 'utf-8') as string;
    } catch {
      continue; // 讀不到（已被移動/刪除等）視為無 class
    }
    // 快篩：不含 class 宣告、也不是 re-export barrel 的檔案不影響族譜
    if (!content || (!content.includes('class') && !(content.includes('export') && content.includes('from')))) {
      continue;
    }
    infoByFile.set(fileAbs, parseFileClassInfo(fileAbs, content));
  }

  const locate = createProjectFileLocator(config);
  const familyMemo = new Set<string>();

  /** 檔案的某個匯出名實際指向哪個檔案的哪個 local class（追 re-export 鏈） */
  const resolveExportedClass = (
    fileAbs: string,
    exportedName: string,
    visited: Set<string>,
    depth: number
  ): { fileAbs: string; localName: string } | undefined => {
    const visitKey = `export:${fileAbs}#${exportedName}`;
    const info = infoByFile.get(fileAbs);
    if (!info || visited.has(visitKey) || depth > MAX_FAMILY_DEPTH) {
      return undefined;
    }
    visited.add(visitKey);
    const target = info.exports.get(exportedName);
    if (target && 'localName' in target) {
      const imported = info.imports.get(target.localName);
      if (imported && !info.classes.has(target.localName)) {
        return imported.importedName === undefined
          ? undefined
          : resolveImported(fileAbs, imported.moduleSpecifier, imported.importedName, visited, depth + 1);
      }
      return { fileAbs, localName: target.localName };
    }
    if (target) {
      return resolveImported(fileAbs, target.specifier, target.importedName, visited, depth + 1);
    }
    if (exportedName === 'default') {
      return undefined;
    }
    for (const specifier of info.starReexports) {
      const found = resolveImported(fileAbs, specifier, exportedName, visited, depth + 1);
      if (found) {
        return found;
      }
    }
    return undefined;
  };

  const resolveImported = (
    importingFile: string,
    specifier: string,
    importedName: string,
    visited: Set<string>,
    depth: number
  ): { fileAbs: string; localName: string } | undefined => {
    const target = locate(importingFile, specifier);
    return target ? resolveExportedClass(target, importedName, visited, depth) : undefined;
  };

  /** 某檔的 local class 是否為 owner，或其遞迴子類且 owner 以下（含自身）無類別 override 目標成員 */
  const isInFamily = (
    fileAbs: string,
    localName: string,
    owner: ClassFamilyOwner,
    visited: Set<string>,
    depth: number
  ): boolean => {
    const ownerAbs = path.resolve(owner.filePath);
    if (fileAbs === ownerAbs && localName === owner.className) {
      return true;
    }
    const targetMember = memberKey(owner.memberName, owner.isStatic);
    const memoKey = `${ownerAbs}#${owner.className}.${targetMember}<-${fileAbs}#${localName}`;
    const visitKey = `class:${fileAbs}#${localName}`;
    if (familyMemo.has(memoKey)) {
      return true;
    }
    const info = infoByFile.get(fileAbs);
    const classInfo = info?.classes.get(localName);
    const superClass = classInfo?.superClass;
    if (!info || !classInfo || !superClass || classInfo.members.has(targetMember)
      || visited.has(visitKey) || depth > MAX_FAMILY_DEPTH) {
      return false;
    }
    visited.add(visitKey);

    let parent: { fileAbs: string; localName: string } | undefined;
    const imported = info.imports.get(superClass.name);
    if (superClass.member !== undefined) {
      parent = imported?.isNamespace
        ? resolveImported(fileAbs, imported.moduleSpecifier, superClass.member, visited, depth + 1)
        : undefined;
    } else if (info.classes.has(superClass.name)) {
      parent = { fileAbs, localName: superClass.name };
    } else if (imported?.importedName !== undefined) {
      parent = resolveImported(fileAbs, imported.moduleSpecifier, imported.importedName, visited, depth + 1);
    }

    const result = !!parent && isInFamily(parent.fileAbs, parent.localName, owner, visited, depth + 1);
    if (result) {
      familyMemo.add(memoKey);
    }
    return result;
  };

  return (importingFileName, moduleSpecifier, importedName, owner) => {
    const visited = new Set<string>();
    const resolved = resolveImported(path.resolve(importingFileName), moduleSpecifier, importedName, visited, 0);
    return !!resolved && isInFamily(resolved.fileAbs, resolved.localName, owner, visited, 0);
  };
}
