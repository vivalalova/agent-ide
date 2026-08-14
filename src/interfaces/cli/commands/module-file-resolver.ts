/**
 * Module-path resolution and cached SourceFile access for the reference filter.
 *
 * Path/import resolution here deliberately runs on the injected IFileSystem and the
 * project tsconfig path aliases (see resolveImportPath). This is why the filter does not
 * delegate module-graph resolution to the TypeScript Language Service: the LS host reads
 * unknown files through `ts.sys` (the real disk), which is blind to the injected file
 * system used throughout the tool (memfs under the E2E fixtures). See the module comment
 * in `symbol-reference-filter.ts` for the full tradeoff.
 */

import * as path from 'path';
import * as ts from 'typescript';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { getImportResolutionExtensions, stripSourceFileExtension } from '@shared/types/index.js';
import { resolveBarePathAliasAsync } from '@shared/path-alias-resolver.js';
import { getScriptKind } from '@shared/script-kind.js';
import { resolveProjectImportCandidates } from '@core/foundations/index.js';
import type { SymbolReferenceFilterContext } from './symbol-reference-filter-types.js';

export async function readTextFile(filePath: string, fileSystem: IFileSystem): Promise<string> {
  const content = await fileSystem.readFile(filePath, 'utf-8');
  return typeof content === 'string' ? content : content.toString('utf-8');
}

export function getSourceFile(
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

/**
 * 取得（快取的）SourceFile；僅在快取未命中時才讀檔。
 * 同檔多條引用共用同一份 analysis / sourceFile cache，避免每條引用重讀整檔的重複 IO。
 */
export async function getOrReadSourceFile(
  filePath: string,
  filterContext: SymbolReferenceFilterContext
): Promise<ts.SourceFile> {
  const cached = filterContext.sourceFileCache.get(normalizePath(filePath));
  if (cached) {
    return cached;
  }
  const content = await readTextFile(filePath, filterContext.fileSystem);
  return getSourceFile(filePath, content, filterContext);
}

/** 讀檔並取得（快取的）SourceFile；檔案不存在或讀取失敗回 null（查詢層逐檔容錯，不中斷整體查詢） */
export async function tryGetSourceFile(
  filePath: string,
  filterContext: SymbolReferenceFilterContext
): Promise<ts.SourceFile | null> {
  const cached = filterContext.sourceFileCache.get(normalizePath(filePath));
  if (cached) {
    return cached;
  }
  if (!await filterContext.fileSystem.exists(filePath) || !await filterContext.fileSystem.isFile(filePath)) {
    return null;
  }
  const content = await readTextFile(filePath, filterContext.fileSystem);
  return getSourceFile(filePath, content, filterContext);
}

export async function resolveModuleFile(
  importPath: string,
  fromFile: string,
  filterContext: SymbolReferenceFilterContext
): Promise<string | null> {
  const candidates = await getModuleFileCandidates(importPath, fromFile, filterContext);

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

async function resolveImportPath(
  importPath: string,
  fromFile: string,
  filterContext: SymbolReferenceFilterContext
): Promise<string> {
  if (importPath.startsWith('.')) {
    return path.resolve(path.dirname(fromFile), importPath);
  }

  const aliasResolvedPath = await resolveBarePathAliasAsync(
    importPath,
    filterContext.moduleResolution.pathAliases,
    async candidate => await filterContext.fileSystem.exists(candidate)
      && await filterContext.fileSystem.isFile(candidate)
  );
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

async function getModuleFileCandidates(
  importPath: string,
  fromFile: string,
  filterContext: SymbolReferenceFilterContext
): Promise<string[]> {
  const resolvedPath = await resolveImportPath(importPath, fromFile, filterContext);
  if (!path.isAbsolute(resolvedPath)) {
    return [resolvedPath];
  }

  // resolvedPath 已是絕對路徑（alias/baseUrl/src 前綴 fallback 皆已在 resolveImportPath
  // 解完），交給共用候選組裝走「絕對路徑」分支做副檔名／index 展開，不再各自維護一份
  // 展開邏輯。
  return resolveProjectImportCandidates(resolvedPath, fromFile, {}).map(normalizePath);
}

export function pathMatchesTarget(importPath: string, targetFile: string): boolean {
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

export function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}
