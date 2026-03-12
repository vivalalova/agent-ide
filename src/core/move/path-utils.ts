/**
 * 路徑工具模組
 * 提供路徑解析、比對、轉換等工具方法
 */

import * as path from 'path';
import { ImportResolver } from './import-resolver.js';

/**
 * 支援的檔案副檔名
 */
export const ALLOWED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.vue'] as const;

/**
 * 排除的目錄模式
 */
export const EXCLUDE_PATTERNS = ['node_modules', 'dist', '.git', 'coverage', '.build'] as const;

/**
 * 支援移除的副檔名
 */
const REMOVABLE_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx'];

/**
 * 路徑工具類別
 * 處理 import 路徑的解析、比對和轉換
 */
export class PathUtils {
  constructor(private readonly importResolver: ImportResolver) {}

  /**
   * 解析 import 路徑為絕對路徑
   *
   * @param importPath - import 語句中的路徑
   * @param fromFile - 包含該 import 的檔案路徑
   * @returns 解析後的絕對路徑
   */
  resolveImportPath(importPath: string, fromFile: string): string {
    if (this.importResolver.isNodeModuleImport(importPath)) {
      return importPath; // Node 模組不處理
    }

    if (importPath.startsWith('.')) {
      // 相對路徑 - 轉換為絕對路徑
      const fromDir = path.dirname(path.isAbsolute(fromFile) ? fromFile : path.resolve(fromFile));
      const resolved = path.resolve(fromDir, importPath);
      // 正規化路徑
      return path.normalize(resolved);
    }

    // 嘗試解析別名（如 @/ 開頭的路徑映射）
    const resolved = this.importResolver.resolvePathAlias(importPath);
    if (resolved !== importPath) {
      // 如果解析成功（與原始路徑不同）
      if (path.isAbsolute(resolved)) {
        // 絕對路徑直接返回
        return path.normalize(resolved);
      }
      // 非絕對路徑：相對於專案根目錄或 baseUrl
      // 由於 pathAliases 已經在 move.command.ts 中轉為絕對路徑，這裡應該是絕對路徑
      // 若仍為相對路徑，則視為相對於當前檔案
      const fromDir = path.dirname(path.isAbsolute(fromFile) ? fromFile : path.resolve(fromFile));
      const absoluteResolved = path.resolve(fromDir, resolved);
      return path.normalize(absoluteResolved);
    }

    // 嘗試解析 baseUrl 相對路徑（如 src/utils）
    const baseUrl = this.importResolver.getBaseUrl();
    if (baseUrl) {
      const absoluteResolved = path.resolve(baseUrl, importPath);
      return path.normalize(absoluteResolved);
    }

    return importPath;
  }

  /**
   * 檢查兩個路徑是否指向同一個檔案
   *
   * @param path1 - 第一個路徑（可能是目錄，如 import from '@/utils' 解析為 /path/utils）
   * @param path2 - 第二個路徑（通常是完整檔案路徑，如 /path/utils/index.ts）
   * @returns 是否指向同一檔案
   */
  pathsMatch(path1: string, path2: string): boolean {
    try {
      // 確保兩個路徑都是絕對路徑並正規化
      const abs1 = path.isAbsolute(path1)
        ? path.normalize(path1)
        : path.normalize(path.resolve(path1));
      const abs2 = path.isAbsolute(path2)
        ? path.normalize(path2)
        : path.normalize(path.resolve(path2));

      // 檢查完全匹配
      if (abs1 === abs2) {
        return true;
      }

      // 檢查去除副檔名後是否匹配（TypeScript/JavaScript 可以省略副檔名）
      const withoutExt1 = this.removeExtension(abs1);
      const withoutExt2 = this.removeExtension(abs2);

      if (withoutExt1 === withoutExt2) {
        return true;
      }

      // 處理目錄 import 指向 index 檔案的情況
      // 如 import from '@/utils' 解析為 /path/utils，實際指向 /path/utils/index.ts
      const indexBasename = path.basename(withoutExt2);
      if (indexBasename === 'index') {
        const dirPath = path.dirname(withoutExt2);
        if (withoutExt1 === dirPath) {
          return true;
        }
      }

      return false;
    } catch {
      // graceful-degradation: 路徑解析失敗時保守回傳 false
      return false;
    }
  }

  /**
   * 移除檔案副檔名
   *
   * @param filePath - 檔案路徑
   * @returns 移除副檔名後的路徑
   */
  removeExtension(filePath: string): string {
    const ext = path.extname(filePath);
    if (REMOVABLE_EXTENSIONS.includes(ext)) {
      return filePath.slice(0, -ext.length);
    }
    return filePath;
  }

  /**
   * 計算新的 import 路徑
   *
   * @param fromFile - import 所在的檔案
   * @param toFile - import 指向的目標檔案
   * @returns 新的相對 import 路徑
   */
  calculateNewImportPath(fromFile: string, toFile: string): string {
    const fromDir = path.dirname(fromFile);
    let relativePath = path.relative(fromDir, toFile);

    // 移除副檔名（如果目標是支援的檔案類型）
    const ext = path.extname(relativePath);
    if (REMOVABLE_EXTENSIONS.includes(ext)) {
      relativePath = relativePath.slice(0, -ext.length);
    }

    // 確保相對路徑以 ./ 或 ../ 開始
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    // 統一使用正斜線
    return relativePath.replace(/\\/g, '/');
  }

  /**
   * 計算新的 import 路徑，保留原始路徑樣式（別名、baseUrl 相對路徑或相對路徑）
   *
   * @param originalImportPath - 原始 import 路徑
   * @param fromFile - import 所在的檔案
   * @param oldFilePath - 舊的目標檔案路徑（未使用但保留介面一致性）
   * @param newFilePath - 新的目標檔案路徑
   * @returns 新的 import 路徑
   */
  calculateNewImportPathPreservingStyle(
    originalImportPath: string,
    fromFile: string,
    _oldFilePath: string,
    newFilePath: string
  ): string {
    // 如果原本是路徑別名或 baseUrl 相對路徑，保留樣式
    if (!originalImportPath.startsWith('.') && !originalImportPath.startsWith('/')) {
      // 1. 檢查是否為路徑別名（精確匹配：alias 本身或 alias/ 開頭）
      for (const [alias, aliasPath] of Object.entries(this.importResolver.getPathAliases())) {
        if (originalImportPath === alias || originalImportPath.startsWith(alias + '/')) {
          const resolvedAliasPath = path.normalize(aliasPath);

          // 計算新檔案相對於別名基礎路徑的相對路徑
          let newRelativeToAlias = path.relative(resolvedAliasPath, path.normalize(newFilePath));
          newRelativeToAlias = newRelativeToAlias.replace(/\\/g, '/');

          // 移除副檔名
          const newExt = path.extname(newRelativeToAlias);
          if (REMOVABLE_EXTENSIONS.includes(newExt)) {
            newRelativeToAlias = newRelativeToAlias.slice(0, -newExt.length);
          }

          // 組合新的別名路徑：alias + / + newRelativeToAlias
          // 如果 alias 本身不以 / 結尾，需要加上
          const separator = alias.endsWith('/') ? '' : '/';
          return alias + separator + newRelativeToAlias;
        }
      }

      // 2. 檢查是否為 baseUrl 相對路徑（如 src/utils）
      const baseUrl = this.importResolver.getBaseUrl();
      if (baseUrl) {
        // 保留原始的 baseUrl 相對路徑格式
        let newRelativeToBaseUrl = path.relative(baseUrl, path.normalize(newFilePath));
        newRelativeToBaseUrl = newRelativeToBaseUrl.replace(/\\/g, '/');

        // 移除副檔名
        const newExt = path.extname(newRelativeToBaseUrl);
        if (REMOVABLE_EXTENSIONS.includes(newExt)) {
          newRelativeToBaseUrl = newRelativeToBaseUrl.slice(0, -newExt.length);
        }

        return newRelativeToBaseUrl;
      }
    }

    // 否則使用相對路徑
    return this.calculateNewImportPath(fromFile, newFilePath);
  }

  /**
   * 跳脫正則表達式特殊字元
   *
   * @param str - 要跳脫的字串
   * @returns 跳脫後的字串
   */
  escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
