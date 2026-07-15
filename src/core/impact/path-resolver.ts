/**
 * 路徑解析器
 * 負責解析 import 路徑，包含路徑別名和副檔名解析
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { PathResolutionResult, ExtendedDependencyAnalysisOptions } from './types.js';
import { resolveBarePathAliasAsync } from '@shared/path-alias-resolver.js';
import {
  getImportResolutionExtensions,
  hasRuntimeImportExtensionCandidates
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
    const aliasResult = await resolveBarePathAliasAsync(
      importPath,
      this.options.pathAliases ?? {},
      async candidate => await this.fileSystem.exists(candidate) && await this.fileSystem.isFile(candidate),
      this.options.sourceFileExtensions
    );
    if (aliasResult) {
      return this.resolveWithExtensions(aliasResult, false);
    }

    // TypeScript 的 baseUrl 允許不以 `./` 開頭的專案內 bare import；先嘗試
    // 專案路徑，找不到時才依既有 includeNodeModules 規則處理外部套件。
    if (!isRelative && this.options.baseUrl) {
      const baseUrlResult = await this.resolveWithExtensions(
        path.resolve(this.options.baseUrl, importPath),
        false
      );
      if (baseUrlResult.exists) {
        return baseUrlResult;
      }
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
    const extensions = getImportResolutionExtensions(
      importExtension,
      this.options.sourceFileExtensions
    );
    const usesRuntimeImportExtension = hasRuntimeImportExtensionCandidates(importExtension);
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
