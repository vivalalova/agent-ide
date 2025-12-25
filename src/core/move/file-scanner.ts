/**
 * 檔案掃描模組
 * 提供專案檔案掃描、受影響檔案查找等功能
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { ImportResolver } from './import-resolver.js';
import { PathUtils, ALLOWED_EXTENSIONS, EXCLUDE_PATTERNS } from './path-utils.js';

/**
 * 檔案掃描器類別
 * 負責掃描專案檔案、查找受影響的檔案
 */
export class FileScanner {
  private readonly pathUtils: PathUtils;

  constructor(
    private readonly fileSystem: IFileSystem,
    private readonly importResolver: ImportResolver
  ) {
    this.pathUtils = new PathUtils(importResolver);
  }

  /**
   * 獲取專案中的所有檔案
   *
   * @param projectRoot - 專案根目錄
   * @returns 所有符合條件的檔案路徑
   */
  async getAllProjectFiles(projectRoot: string): Promise<string[]> {
    const files: string[] = [];

    const walkDir = async (dir: string): Promise<void> => {
      try {
        const entries = await this.fileSystem.readDirectory(dir);

        for (const entry of entries) {
          if (entry.isDirectory) {
            // 跳過排除的目錄
            if (EXCLUDE_PATTERNS.some(pattern => entry.name.includes(pattern))) {
              continue;
            }
            await walkDir(entry.path);
          } else if (entry.isFile) {
            // 只包含支援的副檔名
            if (ALLOWED_EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
              files.push(entry.path);
            }
          }
        }
      } catch {
        // 忽略無法存取的目錄
      }
    };

    await walkDir(projectRoot);
    return files;
  }

  /**
   * 獲取目錄內的所有檔案（遞迴）
   *
   * @param dirPath - 目錄路徑
   * @returns 目錄內所有符合條件的檔案路徑
   */
  async getFilesInDirectory(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    const walkDir = async (dir: string): Promise<void> => {
      try {
        const entries = await this.fileSystem.readDirectory(dir);

        for (const entry of entries) {
          if (entry.isDirectory) {
            await walkDir(entry.path);
          } else if (entry.isFile) {
            if (ALLOWED_EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
              files.push(entry.path);
            }
          }
        }
      } catch {
        // 忽略無法存取的目錄
      }
    };

    await walkDir(dirPath);
    return files;
  }

  /**
   * 找出受影響的檔案
   * 掃描專案中所有引用了指定路徑的檔案
   *
   * @param movedPath - 被移動的檔案路徑
   * @param projectRoot - 專案根目錄
   * @param excludeFiles - 要排除的檔案列表（用於目錄移動時排除同目錄內的檔案）
   * @returns 受影響的檔案路徑列表
   */
  async findAffectedFiles(
    movedPath: string,
    projectRoot: string,
    excludeFiles: string[] = []
  ): Promise<string[]> {
    const files = await this.getAllProjectFiles(projectRoot);
    const normalizedMovedPath = path.normalize(movedPath);
    const normalizedExcludeFiles = new Set(excludeFiles.map(f => path.normalize(f)));

    // 過濾出需要檢查的檔案（排除被移動的檔案本身和 excludeFiles）
    const filesToCheck = files.filter(file => {
      const normalizedFile = path.normalize(file);
      return normalizedFile !== normalizedMovedPath
        && !normalizedExcludeFiles.has(normalizedFile);
    });

    // 並行讀取所有檔案內容
    const fileContents = await Promise.all(
      filesToCheck.map(async file => {
        try {
          const content = await this.fileSystem.readFile(file, 'utf-8') as string;
          return { file, content };
        } catch {
          return { file, content: null };
        }
      })
    );

    // 批次檢查引用
    const affectedFiles: string[] = [];
    for (const { file, content } of fileContents) {
      if (content === null) {
        continue;
      }

      const imports = this.importResolver.parseImportStatements(content, file);
      const hasReference = imports.some(importStatement => {
        // 跳過 node_modules
        if (this.importResolver.isNodeModuleImport(importStatement.path)) {
          return false;
        }

        // 解析 import 路徑並檢查是否指向目標檔案
        const resolvedPath = this.pathUtils.resolveImportPath(importStatement.path, file);
        return this.pathUtils.pathsMatch(resolvedPath, movedPath);
      });

      if (hasReference) {
        affectedFiles.push(file);
      }
    }

    return affectedFiles;
  }

  /**
   * 檢查檔案是否引用了指定路徑
   *
   * @param filePath - 要檢查的檔案
   * @param targetPath - 目標路徑
   * @returns 是否有引用
   */
  async fileReferencesPath(filePath: string, targetPath: string): Promise<boolean> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;
      const imports = this.importResolver.parseImportStatements(content, filePath);

      for (const importStatement of imports) {
        // 跳過 node_modules
        if (this.importResolver.isNodeModuleImport(importStatement.path)) {
          continue;
        }

        // 解析 import 路徑並檢查是否指向目標檔案
        const resolvedPath = this.pathUtils.resolveImportPath(importStatement.path, filePath);
        if (this.pathUtils.pathsMatch(resolvedPath, targetPath)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }
}
