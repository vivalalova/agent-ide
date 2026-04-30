/**
 * 路徑解析器
 * 負責解析 import 路徑，包含路徑別名和副檔名解析
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { PathResolutionResult, ExtendedDependencyAnalysisOptions } from './types.js';
import {
  SOURCE_FILE_EXTENSIONS,
  getImportResolutionExtensions
} from '@shared/types/index.js';

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

    // 檢查是否為路徑別名
    const aliasResult = this.resolvePathAlias(importPath);
    if (aliasResult) {
      return this.resolveWithExtensions(aliasResult, false);
    }

    if (!isRelative && !this.options.includeNodeModules) {
      return null; // 忽略 node_modules
    }

    if (isRelative) {
      const dir = path.dirname(fromFile);
      const resolvedPath = path.resolve(dir, importPath);
      return this.resolveWithExtensions(resolvedPath, true);
    } else {
      // 非相對路徑（例如 npm 套件）
      return {
        resolvedPath: importPath,
        isRelative: false,
        exists: true, // 假設存在
        extension: ''
      };
    }
  }

  /**
   * 解析路徑別名
   * @param importPath 匯入路徑
   * @returns 解析後的絕對路徑，若非路徑別名則回傳 null
   */
  private resolvePathAlias(importPath: string): string | null {
    const pathAliases = this.options.pathAliases;
    if (!pathAliases || Object.keys(pathAliases).length === 0) {
      return null;
    }

    // 按別名長度降序排列，優先匹配較長的別名
    const sortedAliases = Object.keys(pathAliases).sort((a, b) => b.length - a.length);

    for (const alias of sortedAliases) {
      // 精確匹配別名（如 @/utils）
      if (importPath === alias) {
        return pathAliases[alias];
      }

      // 匹配別名前綴（如 @/utils/helper 匹配 @/）
      const aliasPrefix = alias.endsWith('/') ? alias : alias + '/';
      if (importPath.startsWith(aliasPrefix)) {
        const relativePart = importPath.slice(aliasPrefix.length);
        return path.join(pathAliases[alias], relativePart);
      }

      // 匹配別名前綴（如 @/utils 匹配 @）
      if (importPath.startsWith(alias + '/')) {
        const relativePart = importPath.slice(alias.length + 1);
        return path.join(pathAliases[alias], relativePart);
      }
    }

    return null;
  }

  /**
   * 嘗試常見副檔名解析路徑
   * @param basePath 基礎路徑
   * @param isRelative 是否為相對路徑
   * @returns 解析結果
   */
  private async resolveWithExtensions(
    basePath: string,
    isRelative: boolean
  ): Promise<PathResolutionResult> {
    const importExtension = path.extname(basePath);
    const extensions = getImportResolutionExtensions(importExtension);
    const usesRuntimeImportExtension = extensions !== SOURCE_FILE_EXTENSIONS;
    const normalizedPath = usesRuntimeImportExtension
      ? basePath.slice(0, -importExtension.length)
      : basePath;

    let finalPath = normalizedPath;
    let exists = false;

    // 先檢查原始路徑是否存在
    try {
      if (await this.fileSystem.exists(normalizedPath)) {
        // 如果是目錄，嘗試解析 index 檔案
        if (await this.fileSystem.isDirectory(normalizedPath)) {
          for (const ext of extensions) {
            const indexPath = path.join(normalizedPath, 'index' + ext);
            try {
              if (await this.fileSystem.exists(indexPath)) {
                return {
                  resolvedPath: indexPath,
                  isRelative,
                  exists: true,
                  extension: ext
                };
              }
            } catch {
              // graceful-degradation: 路徑不存在，繼續嘗試其他選項
            }
          }
        } else {
          return {
            resolvedPath: normalizedPath,
            isRelative,
            exists: true,
            extension: path.extname(normalizedPath)
          };
        }
      }
    } catch {
      // graceful-degradation: 路徑不存在，繼續嘗試其他選項
    }

    // 嘗試常見的副檔名
    for (const ext of extensions) {
      const pathWithExt = normalizedPath + ext;
      try {
        if (await this.fileSystem.exists(pathWithExt)) {
          finalPath = pathWithExt;
          exists = true;
          break;
        }
      } catch {
        // graceful-degradation: 路徑不存在，繼續嘗試其他選項
      }
    }

    // 嘗試 index 檔案（針對目錄式匯入）
    if (!exists) {
      for (const ext of extensions) {
        const indexPath = path.join(normalizedPath, 'index' + ext);
        try {
          if (await this.fileSystem.exists(indexPath)) {
            finalPath = indexPath;
            exists = true;
            break;
          }
        } catch {
          // graceful-degradation: 路徑不存在，繼續嘗試其他選項
        }
      }
    }

    return {
      resolvedPath: finalPath,
      isRelative,
      exists,
      extension: path.extname(finalPath)
    };
  }
}
