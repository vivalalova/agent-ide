/**
 * 檔案掃描器
 * 負責掃描專案檔案、過濾和 glob 匹配
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { ExtendedDependencyAnalysisOptions } from './types.js';

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

      // 如果是檔案，直接返回該檔案
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

    const traverse = async (dir: string, depth = 0) => {
      if (depth > this.options.maxDepth) {
        return;
      }

      try {
        const entries = await this.fileSystem.readDirectory(dir);

        for (const entry of entries) {
          // 檢查排除模式
          if (this.isExcluded(entry.path)) {
            continue;
          }

          if (entry.isDirectory) {
            await traverse(entry.path, depth + 1);
          } else if (entry.isFile && this.isIncluded(entry.path)) {
            files.push(entry.path);
          }
        }
      } catch (error) {
        console.warn(`無法讀取目錄 ${dir}:`, error);
      }
    };

    await traverse(projectPath);
    return files;
  }

  /**
   * 檢查檔案是否應該被排除
   * @param filePath 檔案路徑
   * @returns 是否排除
   */
  isExcluded(filePath: string): boolean {
    return this.options.excludePatterns.some(pattern => {
      return filePath.includes(pattern) || this.matchGlob(filePath, pattern);
    });
  }

  /**
   * 檢查檔案是否應該被包含
   * @param filePath 檔案路徑
   * @returns 是否包含
   */
  isIncluded(filePath: string): boolean {
    return this.options.includePatterns.some(pattern => {
      return this.matchGlob(filePath, pattern);
    });
  }

  /**
   * 檢查是否應該包含此依賴
   * @param resolvedPath 解析後的路徑
   * @returns 是否包含
   */
  shouldIncludeDependency(resolvedPath: string): boolean {
    if (!this.options.includeNodeModules && resolvedPath.includes('node_modules')) {
      return false;
    }

    return !this.isExcluded(resolvedPath);
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

  /**
   * 簡單的 glob 模式匹配
   * @param filePath 檔案路徑
   * @param pattern glob 模式
   * @returns 是否匹配
   */
  private matchGlob(filePath: string, pattern: string): boolean {
    // 將 ** 替換為特殊標記，避免與 * 衝突
    let regexPattern = pattern.replace(/\*\*/g, '<!DOUBLE_STAR!>');

    // 替換單個 *
    regexPattern = regexPattern.replace(/\*/g, '[^/]*');

    // 替換 **（之前的特殊標記）為匹配任意路徑
    regexPattern = regexPattern.replace(/<!DOUBLE_STAR!>/g, '.*');

    // 替換 ?
    regexPattern = regexPattern.replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }
}
