/**
 * 檔案生成器 - 處理檔名衝突
 */

import * as path from 'node:path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { FileGenerationResult } from './types.js';

/**
 * 檔案生成器類別
 */
export class FileGenerator {
  constructor(private readonly fileSystem: IFileSystem) {}
  /**
   * 生成唯一檔名
   * @param basePath - 基礎路徑（不含副檔名）
   * @param extension - 副檔名（含點號，如 '.ts'）
   * @returns 唯一的檔案路徑
   */
  async generateUniqueFilename(basePath: string, extension: string): Promise<FileGenerationResult> {
    const originalPath = `${basePath}${extension}`;

    if (!(await this.fileExists(originalPath))) {
      return {
        filePath: originalPath,
        isNew: true,
        hasConflict: false
      };
    }

    let suffix = 1;
    let candidatePath = '';

    do {
      const paddedSuffix = suffix.toString().padStart(2, '0');
      candidatePath = `${basePath}${paddedSuffix}${extension}`;
      suffix++;
    } while ((await this.fileExists(candidatePath)) && suffix < 100);

    if (suffix >= 100) {
      throw new Error(`無法生成唯一檔名：已存在 100 個相同名稱的檔案 (${basePath})`);
    }

    return {
      filePath: candidatePath,
      isNew: true,
      hasConflict: true,
      originalName: path.basename(originalPath)
    };
  }

  /**
   * 從目標路徑生成唯一檔名
   * @param targetPath - 目標路徑（可能包含 "newfile" 等基礎名稱）
   * @param sourceExtension - 來源檔案的副檔名
   * @param directory - 目標目錄
   * @returns 生成結果
   */
  async generateFromTargetPath(
    targetPath: string,
    sourceExtension: string,
    directory: string
  ): Promise<FileGenerationResult> {
    const parsedPath = path.parse(targetPath);

    // 如果目標路徑已經有副檔名，使用原有副檔名
    const extension = parsedPath.ext || sourceExtension;

    // 如果目標路徑沒有副檔名，需要添加
    const baseName = parsedPath.ext ? parsedPath.name : parsedPath.base;
    const basePath = path.join(directory, baseName);

    return this.generateUniqueFilename(basePath, extension);
  }

  /**
   * 檢查檔案是否存在
   * @param filePath - 檔案路徑
   * @returns 是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      return await this.fileSystem.exists(filePath);
    } catch {
      return false;
    }
  }

  /**
   * 確保目錄存在
   * @param dirPath - 目錄路徑
   */
  async ensureDirectoryExists(dirPath: string): Promise<void> {
    if (!(await this.fileSystem.exists(dirPath))) {
      await this.fileSystem.createDirectory(dirPath);
    }
  }

  /**
   * 建立新檔案
   * @param filePath - 檔案路徑
   * @param content - 檔案內容
   */
  async createFile(filePath: string, content: string): Promise<void> {
    const directory = path.dirname(filePath);
    await this.ensureDirectoryExists(directory);
    await this.fileSystem.writeFile(filePath, content);
  }
}
