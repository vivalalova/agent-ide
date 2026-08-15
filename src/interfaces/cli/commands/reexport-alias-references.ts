/**
 * 單層 re-export 別名引用追蹤。
 *
 * 索引與 SymbolFinder 都以「名稱」比對引用，因此當 `export { X as Y } from './x'`
 * 把符號 X 以別名 Y 重新匯出時，下游 `import { Y }; Y()` 的引用會因 token 文字不同而漏抓。
 * 本模組在查詢層補上這類引用，且刻意只活在 find-references 路徑、不碰共用的 SymbolFinder
 * （rename 依賴 SymbolFinder，若讓 finder 跟隨別名會把別名綁定名一起改錯）。
 *
 * 別名的 local 引用透過 SymbolFinder 的 Language Service 路徑（作用域感知）在單一 consumer
 * 檔內解析，並過濾為僅同檔引用——這是本專案唯一以 LS 判定引用的地方，且僅限單檔內。
 */

import * as ts from 'typescript';
import { type SymbolReference } from '@core/foundations/symbol-finder/index.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { Symbol } from '@shared/types/symbol.js';
import type { SymbolReferenceFilterContext } from './symbol-reference-filter-types.js';
import {
  normalizePath,
  pathMatchesTarget,
  resolveModuleFile,
  tryGetSourceFile
} from './module-file-resolver.js';
import { createSymbolReferenceFilterContext } from './symbol-reference-filter-context.js';
import { findImportBindingReferences } from './import-binding-references.js';

/**
 * 單層 re-export 別名引用追蹤。
 *
 * 流程：
 *   1. 掃描所有已索引檔，找出「來源模組直接解析到目標符號定義檔、且改名匯出」的單層 re-export，
 *      收集 (別名, re-export 模組檔)。同名的 re-export 不需處理（下游仍用原名，finder 已涵蓋）。
 *   2. 對每個別名，找出直接從該 re-export 模組 import 此別名的檔案，
 *      用 SymbolFinder 收集這些檔案中對該別名 local 名稱的所有引用（import 與使用點）。
 *
 * 僅追蹤單層 re-export（一次 `as` 跳轉），不遞迴跟隨二次 re-export。
 */
export async function findReExportAliasReferences(
  selectedSymbol: Symbol,
  projectPath: string,
  fileSystem: IFileSystem,
  indexedFiles: readonly string[],
  findReferencesWithSymbol: (filePath: string, symbol: Symbol) => Promise<SymbolReference[]>
): Promise<SymbolReference[]> {
  const filterContext = await createSymbolReferenceFilterContext(selectedSymbol, projectPath, fileSystem);

  // 步驟 1：找出把目標符號改名匯出的單層 re-export（別名 → re-export 模組檔）
  const aliasExports = await collectAliasExports(filterContext, indexedFiles);

  if (aliasExports.length === 0) {
    return [];
  }

  // 步驟 2：找出直接從 re-export 模組 import 該別名的檔案，收集其中對別名 local 名稱的引用
  const collected: SymbolReference[] = [];
  for (const { aliasName, reExportModuleFile } of aliasExports) {
    for (const file of indexedFiles) {
      const normalizedFile = normalizePath(file);
      if (normalizedFile === reExportModuleFile) {
        continue;
      }
      const sourceFile = await tryGetSourceFile(normalizedFile, filterContext);
      if (!sourceFile) {
        continue;
      }

      for (const importDecl of collectNamedImportDeclarations(sourceFile)) {
        const moduleFile = await resolveModuleFile(importDecl.moduleSpecifier.text, normalizedFile, filterContext);
        if (moduleFile === null || !pathMatchesTarget(moduleFile, reExportModuleFile)) {
          continue;
        }
        for (const element of importDecl.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (importedName !== aliasName) {
            continue;
          }
          // 以 import binding 的真實 identifier 節點構造符號，走 LS 精確（作用域感知）查找；
          // 共用 helper 會過濾跨檔結果，並將 binding definition 歸類為 import。
          const aliasRefs = await findImportBindingReferences(
            element.name,
            sourceFile,
            normalizedFile,
            findReferencesWithSymbol
          );
          collected.push(...aliasRefs);
        }
      }
    }
  }

  return collected;
}

/** 把目標符號改名匯出的單層 re-export：別名，以及做這件事的模組檔 */
export interface ReExportAlias {
  readonly aliasName: string;
  readonly reExportModuleFile: string;
}

/**
 * 對外入口：收集「把選定符號以別名匯出」的單層 re-export。
 *
 * find-references 走 `findReExportAliasReferences` 直接拿到引用；call-hierarchy 需要的是
 * 別名本身（下游呼叫點的 token 是別名，以原名搜 callSite 找不到），故共用同一份收集邏輯。
 */
export async function collectReExportAliases(
  selectedSymbol: Symbol,
  projectPath: string,
  fileSystem: IFileSystem,
  indexedFiles: readonly string[]
): Promise<ReExportAlias[]> {
  const filterContext = await createSymbolReferenceFilterContext(selectedSymbol, projectPath, fileSystem);
  return await collectAliasExports(filterContext, indexedFiles);
}

/**
 * 收集「把選定符號以別名匯出」的單層 re-export（別名 → re-export 模組檔）。
 *
 * 兩種來源形狀語意等價（下游都只看得到別名這個 token），故同一套判定：
 *   - `export { X as Y } from './def'`：來源模組解析後即目標定義檔。
 *   - `export { X as Y }`（無 from）：來源是本檔的本地綁定——本檔即目標定義檔（同檔宣告），
 *     或本檔具名 import 了該綁定且其來源模組解析到目標定義檔。
 */
async function collectAliasExports(
  filterContext: SymbolReferenceFilterContext,
  indexedFiles: readonly string[]
): Promise<ReExportAlias[]> {
  const symbolName = filterContext.selectedSymbol.name;
  const aliasExports: ReExportAlias[] = [];

  for (const file of indexedFiles) {
    const normalizedFile = normalizePath(file);
    const sourceFile = await tryGetSourceFile(normalizedFile, filterContext);
    if (!sourceFile) {
      continue;
    }

    for (const exportDecl of collectNamedExportDeclarations(sourceFile)) {
      for (const element of exportDecl.elements) {
        const sourceName = element.propertyName?.text ?? element.name.text;
        const exportedName = element.name.text;
        // 別名與原名相同時下游仍用原名，finder 已涵蓋，不需本模組補抓
        if (exportedName === symbolName) {
          continue;
        }

        const sourceTargetsSymbol = exportDecl.moduleSpecifier
          ? sourceName === symbolName
            && pathMatchesTarget(
              await resolveModuleFile(exportDecl.moduleSpecifier.text, normalizedFile, filterContext) ?? '',
              filterContext.targetFile
            )
          : await localExportSourceTargetsSelectedSymbol(sourceName, sourceFile, normalizedFile, filterContext);
        if (sourceTargetsSymbol) {
          aliasExports.push({ aliasName: exportedName, reExportModuleFile: normalizedFile });
        }
      }
    }
  }

  return aliasExports;
}

/**
 * 無 from 的具名匯出（`export { local as alias }`）：本地名稱 `localName` 是否確實指向選定符號。
 *
 * 本檔即目標定義檔 → 名稱相符即同檔宣告本體；否則需本檔具名 import 了該名稱、
 * 且 import 的原始名為選定符號名、來源模組解析到目標定義檔。
 * default import 來源（`import Foo from './def'; export { Foo as Public }`）不在此列，
 * 與有 from 分支同樣只認具名來源。
 */
async function localExportSourceTargetsSelectedSymbol(
  localName: string,
  sourceFile: ts.SourceFile,
  normalizedFile: string,
  filterContext: SymbolReferenceFilterContext
): Promise<boolean> {
  const symbolName = filterContext.selectedSymbol.name;
  if (pathMatchesTarget(normalizedFile, filterContext.targetFile)) {
    return localName === symbolName;
  }

  for (const importDecl of collectNamedImportDeclarations(sourceFile)) {
    for (const element of importDecl.elements) {
      if (element.name.text !== localName) {
        continue;
      }
      if ((element.propertyName?.text ?? element.name.text) !== symbolName) {
        continue;
      }
      const moduleFile = await resolveModuleFile(importDecl.moduleSpecifier.text, normalizedFile, filterContext);
      if (moduleFile !== null && pathMatchesTarget(moduleFile, filterContext.targetFile)) {
        return true;
      }
    }
  }

  return false;
}

/** 具來源模組的具名 import，萃取出模組路徑字面與 specifier 元素 */
interface NamedModuleBinding<TElement extends ts.ImportSpecifier> {
  readonly moduleSpecifier: ts.StringLiteral;
  readonly elements: readonly TElement[];
}

/** 具名匯出宣告：`export { ... } from '...'`（有 moduleSpecifier）與 `export { ... }`（無）皆收 */
interface NamedExportBinding {
  readonly moduleSpecifier?: ts.StringLiteral;
  readonly elements: readonly ts.ExportSpecifier[];
}

/** 收集 exportClause 為具名匯出的 export 宣告（`export * as ns` 與 `export *` 不在此列） */
function collectNamedExportDeclarations(sourceFile: ts.SourceFile): NamedExportBinding[] {
  const result: NamedExportBinding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isExportDeclaration(node)) {
      const { moduleSpecifier, exportClause } = node;
      if (moduleSpecifier && !ts.isStringLiteral(moduleSpecifier)) {
        return;
      }
      if (exportClause && ts.isNamedExports(exportClause)) {
        result.push({
          ...(moduleSpecifier && ts.isStringLiteral(moduleSpecifier) ? { moduleSpecifier } : {}),
          elements: exportClause.elements
        });
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

/** 收集具來源模組、且帶具名 import 的 import 宣告（`import { ... } from '...'`） */
function collectNamedImportDeclarations(
  sourceFile: ts.SourceFile
): NamedModuleBinding<ts.ImportSpecifier>[] {
  const result: NamedModuleBinding<ts.ImportSpecifier>[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const namedBindings = node.importClause?.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        result.push({ moduleSpecifier: node.moduleSpecifier, elements: namedBindings.elements });
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}
