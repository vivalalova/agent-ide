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
  const symbolName = selectedSymbol.name;

  // 步驟 1：找出把目標符號改名匯出的單層 re-export（別名 → re-export 模組檔）
  const aliasExports: { aliasName: string; reExportModuleFile: string }[] = [];
  for (const file of indexedFiles) {
    const normalizedFile = normalizePath(file);
    if (normalizedFile === filterContext.targetFile) {
      continue;
    }
    const sourceFile = await tryGetSourceFile(normalizedFile, filterContext);
    if (!sourceFile) {
      continue;
    }

    for (const exportDecl of collectNamedReExportDeclarations(sourceFile)) {
      const moduleFile = await resolveModuleFile(exportDecl.moduleSpecifier.text, normalizedFile, filterContext);
      if (moduleFile === null || !pathMatchesTarget(moduleFile, filterContext.targetFile)) {
        continue;
      }
      for (const element of exportDecl.elements) {
        const sourceName = element.propertyName?.text ?? element.name.text;
        const exportedName = element.name.text;
        if (sourceName === symbolName && exportedName !== symbolName) {
          aliasExports.push({ aliasName: exportedName, reExportModuleFile: normalizedFile });
        }
      }
    }
  }

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

/** 具來源模組的具名 import/re-export，萃取出模組路徑字面與 specifier 元素 */
interface NamedModuleBinding<TElement extends ts.ImportSpecifier | ts.ExportSpecifier> {
  readonly moduleSpecifier: ts.StringLiteral;
  readonly elements: readonly TElement[];
}

/** 收集具來源模組、且 exportClause 為具名匯出的 re-export 宣告（`export { ... } from '...'`） */
function collectNamedReExportDeclarations(
  sourceFile: ts.SourceFile
): NamedModuleBinding<ts.ExportSpecifier>[] {
  const result: NamedModuleBinding<ts.ExportSpecifier>[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isExportDeclaration(node)) {
      const { moduleSpecifier, exportClause } = node;
      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier) && exportClause && ts.isNamedExports(exportClause)) {
        result.push({ moduleSpecifier, elements: exportClause.elements });
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
