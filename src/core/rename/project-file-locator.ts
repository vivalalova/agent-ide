/**
 * 專案內 import specifier → 專案檔絕對路徑
 *
 * 相對路徑、tsconfig paths 別名、baseUrl、省略副檔名、index 檔慣例一律交由 file-move 的
 * PathUtils，與 move / change-signature 同一把尺（Single Source of Truth）。
 */

import * as path from 'path';
import { ImportResolver } from '@core/move/import-resolver.js';
import { ALLOWED_EXTENSIONS, PathUtils } from '@core/move/path-utils.js';
import type { PathAliasInput } from '@shared/path-alias-resolver.js';
import { resolveBarePathAlias } from '@shared/path-alias-resolver.js';

export interface ProjectFileLocatorConfig {
  /** 專案內所有原始碼檔案（絕對或相對路徑皆可，內部一律正規化為絕對） */
  readonly projectFiles: readonly string[];
  /** tsconfig path aliases（已解析為絕對路徑，見 tsconfig-loader） */
  readonly pathAliases?: PathAliasInput;
  /** tsconfig baseUrl（絕對路徑） */
  readonly baseUrl?: string;
}

/** 將 specifier 從 importingFile 解析後，找出對應的專案檔絕對路徑；找不到回 null */
export type ProjectFileLocator = (importingFile: string, specifier: string) => string | null;

/**
 * @param preferredFiles 優先比對的檔案（絕對路徑），不在專案檔清單內也可命中（如 rename 定義檔）
 */
export function createProjectFileLocator(
  config: ProjectFileLocatorConfig,
  preferredFiles: readonly string[] = []
): ProjectFileLocator {
  const pathUtils = new PathUtils(
    new ImportResolver({
      pathAliases: config.pathAliases ?? {},
      baseUrl: config.baseUrl,
      supportedExtensions: ALLOWED_EXTENSIONS
    })
  );
  const projectAbsolute = config.projectFiles.map(file => path.resolve(file));
  const candidates = [...preferredFiles, ...projectAbsolute];

  return (importingFile, specifier) => {
    const aliasResolved = resolveBarePathAlias(
      specifier,
      config.pathAliases ?? {},
      candidate => projectAbsolute.some(fileAbs => pathUtils.pathsMatch(candidate, fileAbs))
    );
    const resolved = aliasResolved ?? pathUtils.resolveImportPath(specifier, importingFile);
    return candidates.find(fileAbs => pathUtils.pathsMatch(resolved, fileAbs)) ?? null;
  };
}
