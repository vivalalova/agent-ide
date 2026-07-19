/**
 * 路徑解析器
 * 負責解析 import 路徑，包含路徑別名和副檔名解析
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { PathResolutionResult, ExtendedDependencyAnalysisOptions } from './types.js';
import {
  resolveExistingProjectFile,
  resolveProjectImportCandidates
} from '@core/foundations/index.js';
import { hasRuntimeImportExtensionCandidates } from '@shared/types/index.js';

/**
 * 路徑解析器類別
 */
export class PathResolver {
  private fileSystem: IFileSystem;
  private options: ExtendedDependencyAnalysisOptions;

  constructor(fileSystem: IFileSystem, options: ExtendedDependencyAnalysisOptions) {
    this.fileSystem = fileSystem;
    this.options = options;
  }

  /**
   * 解析路徑
   * @param importPath 匯入路徑
   * @param fromFile 來源檔案
   * @returns 解析結果
   */
  async resolvePath(
    importPath: string,
    fromFile: string
  ): Promise<PathResolutionResult | null> {
    const isRelative = importPath.startsWith('.') || importPath.startsWith('/');

    const candidates = resolveProjectImportCandidates(importPath, fromFile, {
      pathAliases: this.options.pathAliases,
      baseUrl: this.options.baseUrl,
      sourceFileExtensions: this.options.sourceFileExtensions
    });
    const resolved = await resolveExistingProjectFile(
      candidates,
      async candidate => await this.fileSystem.exists(candidate) && await this.fileSystem.isFile(candidate)
    );

    if (resolved) {
      return {
        resolvedPath: resolved,
        isRelative,
        exists: true,
        extension: path.extname(resolved)
      };
    }

    if (!isRelative && !this.options.includeNodeModules) {
      return null; // 忽略 node_modules
    }

    if (isRelative) {
      const fallbackPath = this.unresolvedRelativeFallbackPath(importPath, fromFile);
      return {
        resolvedPath: fallbackPath,
        isRelative: true,
        exists: false,
        extension: path.extname(fallbackPath)
      };
    }

    // 非相對路徑（例如 npm 套件）
    return {
      resolvedPath: importPath,
      isRelative: false,
      exists: true, // 假設存在
      extension: ''
    };
  }

  /**
   * 相對 import 所有候選皆不存在時，仍須回報一個 exists:false 的 resolvedPath（雙語意：
   * null 代表排除 node_modules、非 null 物件 + exists:false 代表相對路徑找不到目標檔）。
   * 回報用的 base path 計算方式須與候選組裝內部一致（runtime import 副檔名可映射時去除
   * 副檔名），故沿用同一份 hasRuntimeImportExtensionCandidates 判斷，不另立規則。
   */
  private unresolvedRelativeFallbackPath(importPath: string, fromFile: string): string {
    const basePath = path.resolve(path.dirname(fromFile), importPath);
    const importExtension = path.extname(basePath);
    return hasRuntimeImportExtensionCandidates(importExtension)
      ? basePath.slice(0, -importExtension.length)
      : basePath;
  }
}
