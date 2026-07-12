/**
 * default import 別名引用追蹤。
 *
 * 索引與 SymbolFinder 都以「名稱」比對引用，因此當模組的 default export 宣告名稱
 * 與 consumer 的 default import 本地名稱不同時，import 與後續使用點會漏抓。本模組
 * 僅在 find-references 的 --at 錨定查詢層補上這類引用，不放寬 rename 共用 binding 判斷。
 */

import * as ts from 'typescript';
import { type SymbolReference } from '@core/foundations/symbol-finder/index.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { Symbol } from '@shared/types/symbol.js';
import { getDefaultExportDeclaredName } from './cross-file-import-binding.js';
import { createSymbolReferenceFilterContext } from './symbol-reference-filter-context.js';
import {
  normalizePath,
  pathMatchesTarget,
  resolveModuleFile,
  tryGetSourceFile
} from './module-file-resolver.js';
import { findImportBindingReferences } from './import-binding-references.js';

/**
 * 找出直接 import 目標模組 default export 的本地別名，並收集各 consumer 檔內的引用。
 *
 * 僅追蹤直接 default import，不遞迴跟隨 re-export；import binding 與使用點的作用域
 * 判斷沿用 SymbolFinder 的既有 LS 路徑。
 */
export async function findDefaultImportAliasReferences(
  selectedSymbol: Symbol,
  projectPath: string,
  fileSystem: IFileSystem,
  indexedFiles: readonly string[],
  findReferencesWithSymbol: (filePath: string, symbol: Symbol) => Promise<SymbolReference[]>
): Promise<SymbolReference[]> {
  const filterContext = await createSymbolReferenceFilterContext(selectedSymbol, projectPath, fileSystem);
  const defaultExportName = await getDefaultExportDeclaredName(filterContext.targetFile, filterContext);
  if (defaultExportName !== selectedSymbol.name) {
    return [];
  }

  const collected: SymbolReference[] = [];
  for (const file of indexedFiles) {
    const normalizedFile = normalizePath(file);
    if (normalizedFile === filterContext.targetFile) {
      continue;
    }

    const sourceFile = await tryGetSourceFile(normalizedFile, filterContext);
    if (!sourceFile) {
      continue;
    }

    for (const importDecl of collectDefaultImportDeclarations(sourceFile)) {
      const moduleFile = await resolveModuleFile(importDecl.moduleSpecifier.text, normalizedFile, filterContext);
      if (moduleFile === null || !pathMatchesTarget(moduleFile, filterContext.targetFile)) {
        continue;
      }

      if (importDecl.localName.text === selectedSymbol.name) {
        continue;
      }

      const aliasRefs = await findImportBindingReferences(
        importDecl.localName,
        sourceFile,
        normalizedFile,
        findReferencesWithSymbol
      );
      collected.push(...aliasRefs);
    }
  }

  return collected;
}

/** 收集帶來源模組且含 default import 的 import 宣告。 */
interface DefaultImportDeclaration {
  readonly moduleSpecifier: ts.StringLiteral;
  readonly localName: ts.Identifier;
}

function collectDefaultImportDeclarations(sourceFile: ts.SourceFile): DefaultImportDeclaration[] {
  const result: DefaultImportDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && node.importClause?.name
    ) {
      result.push({
        moduleSpecifier: node.moduleSpecifier,
        localName: node.importClause.name
      });
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return result;
}
