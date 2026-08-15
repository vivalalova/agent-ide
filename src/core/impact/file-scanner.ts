/**
 * 檔案掃描器
 * 負責掃描專案檔案、過濾和 glob 匹配
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { ExtendedDependencyAnalysisOptions } from './types.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { getErrorMessage } from '@shared/errors/index.js';
import { matchesAnyGlobPattern, relativizeToRoot } from '@shared/path-pattern.js';

/**
 * 檔案掃描器類別
 */
export class FileScanner {
  private fileSystem: IFileSystem;
  private options: ExtendedDependencyAnalysisOptions;

  constructor(fileSystem: IFileSystem, options: ExtendedDependencyAnalysisOptions) {
    this.fileSystem = fileSystem;
    this.options = options;
  }

  /**
   * 找出專案中的原始檔案
   * @param projectPath 專案路徑（可以是檔案或目錄）
   * @returns 檔案路徑列表
   */
  async findSourceFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];

    // 檢查路徑是檔案還是目錄
    try {
      const stat = await this.fileSystem.getStats(projectPath);

      // 如果是檔案，直接返回該檔案。projectPath 本身即目標，無獨立掃描起點可供
      // 相對化，故不帶 root（等同呼叫端自行以原始路徑比對的現行行為）。
      if (stat.isFile) {
        if (this.isIncluded(projectPath)) {
          return [projectPath];
        }
        return [];
      }

      // 如果不是目錄也不是檔案，返回空陣列
      if (!stat.isDirectory) {
        return [];
      }
    } catch {
      // graceful-degradation: 路徑不存在或無權限時返回空列表
      return [];
    }

    // 掃描起點作為相對化基準：排除／納入樣式須比對「相對於專案根目錄」的路徑，
    // 而非絕對路徑——否則專案根目錄上層若含與排除樣式同名的完整 segment（如專案
    // 位於 /home/dist/myproj，排除樣式 'dist' 會被祖先路徑 /home/dist 命中），
    // 整個專案會被誤判為位於排除目錄下、traverse 起點即被排除、結果整包為空
    // （比照 indexing/types.ts shouldIndexFile 的已修方案）。以區域變數（非實例
    // 欄位）透過 closure 綁定給 traverse，避免可變實例狀態在並發共用同一
    // FileScanner 實例時互相串味。
    const root = projectPath;

    const traverse = async (dir: string, depth = 0) => {
      if (depth > this.options.maxDepth) {
        return;
      }

      try {
        const entries = await this.fileSystem.readDirectory(dir);

        for (const entry of entries) {
          // 檢查排除模式
          if (this.isExcluded(entry.path, root)) {
            continue;
          }

          if (entry.isDirectory) {
            await traverse(entry.path, depth + 1);
          } else if (entry.isFile && this.isIncluded(entry.path, root)) {
            files.push(entry.path);
          }
        }
      } catch (error) {
        diagnostics.warn('impact/file-scanner', 'ANALYSIS_DEGRADED', `無法讀取目錄: ${getErrorMessage(error)}`, dir);
      }
    };

    await traverse(root);
    return files;
  }

  /**
   * 檢查檔案是否應該被排除
   * @param filePath 檔案路徑
   * @param root 比對基準根目錄（如專案根目錄／掃描起點），供相對化排除樣式比對；
   *   未提供時退回以原始路徑比對（見 relativizeToRoot）
   * @returns 是否排除
   */
  isExcluded(filePath: string, root?: string): boolean {
    return matchesAnyGlobPattern(relativizeToRoot(root, filePath), this.options.excludePatterns);
  }

  /**
   * 檢查檔案是否應該被包含
   * @param filePath 檔案路徑
   * @param root 比對基準根目錄（如專案根目錄／掃描起點），供相對化納入樣式比對；
   *   未提供時退回以原始路徑比對（見 relativizeToRoot）
   * @returns 是否包含
   */
  isIncluded(filePath: string, root?: string): boolean {
    return matchesAnyGlobPattern(relativizeToRoot(root, filePath), this.options.includePatterns);
  }

  /**
   * 檢查是否應該包含此依賴
   * @param resolvedPath 解析後的路徑
   * @param root 比對基準根目錄，供相對化排除樣式比對；未提供時退回以原始路徑比對
   * @returns 是否包含
   */
  shouldIncludeDependency(resolvedPath: string, root?: string): boolean {
    if (!this.options.includeNodeModules && resolvedPath.includes('node_modules')) {
      return false;
    }

    return !this.isExcluded(resolvedPath, root);
  }

  /**
   * 檢查是否為測試檔案
   * @param filePath 檔案路徑
   * @returns 是否為測試檔案
   */
  isTestFile(filePath: string): boolean {
    const fileName = path.basename(filePath);
    return fileName.includes('.test.')
      || fileName.includes('.spec.')
      || filePath.includes('__tests__')
      || filePath.includes('/test/')
      || filePath.includes('/tests/');
  }
}
