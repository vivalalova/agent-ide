/**
 * 檔案掃描模組
 * 提供專案檔案掃描、受影響檔案查找等功能
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { ImportResolver } from './import-resolver.js';
import { PathUtils, ALLOWED_EXTENSIONS, EXCLUDE_PATTERNS } from './path-utils.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';

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
      } catch (error) {
        // graceful-degradation: 權限不足的目錄跳過，繼續掃描
        diagnostics.warn('move/file-scanner', 'ANALYSIS_DEGRADED', `Skipping inaccessible directory: ${error instanceof Error ? error.message : String(error)}`);
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
      } catch (error) {
        // graceful-degradation: 權限不足的目錄跳過，繼續掃描
        diagnostics.warn('move/file-scanner', 'ANALYSIS_DEGRADED', `Skipping inaccessible directory: ${error instanceof Error ? error.message : String(error)}`);
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
    const absoluteProjectRoot = this.resolveProjectRoot(projectRoot);
    const normalizedMovedPath = this.normalizePath(movedPath, absoluteProjectRoot);
    const affectedFilesByPath = await this.findAffectedFilesForPaths(
      [movedPath],
      projectRoot,
      excludeFiles
    );

    return affectedFilesByPath.get(normalizedMovedPath) ?? [];
  }

  /**
   * 找出多個移動路徑各自影響的檔案。
   * 批次移動時只掃描並讀取專案檔案一次，避免每個來源檔重複 traversal。
   *
   * @param movedPaths - 被移動的檔案路徑列表
   * @param projectRoot - 專案根目錄
   * @param excludeFiles - 要排除的檔案列表
   * @returns normalized moved path -> 受影響檔案路徑列表
   */
  async findAffectedFilesForPaths(
    movedPaths: readonly string[],
    projectRoot: string,
    excludeFiles: readonly string[] = []
  ): Promise<Map<string, string[]>> {
    const files = await this.getAllProjectFiles(projectRoot);

    // 修復：統一使用絕對路徑進行比較
    // getAllProjectFiles 可能返回相對路徑（當 projectRoot 是相對路徑時）
    // 而 excludeFiles 通常是絕對路徑
    const absoluteProjectRoot = this.resolveProjectRoot(projectRoot);
    const normalizedMovedPaths = movedPaths.map(movedPath => this.normalizePath(movedPath, absoluteProjectRoot));
    const affectedFilesByMovedPath = new Map<string, Set<string>>();
    for (const movedPath of normalizedMovedPaths) {
      affectedFilesByMovedPath.set(movedPath, new Set<string>());
    }

    // 將 excludeFiles 轉為絕對路徑的 Set
    const normalizedExcludeFiles = new Set(
      excludeFiles.map(f => this.normalizePath(f, absoluteProjectRoot))
    );
    for (const movedPath of normalizedMovedPaths) {
      normalizedExcludeFiles.add(movedPath);
    }

    // 過濾出需要檢查的檔案（排除被移動的檔案本身和 excludeFiles）
    const filesToCheck = files.filter(file => {
      // 將檔案路徑轉為絕對路徑進行比較
      const normalizedFile = this.normalizePath(file, absoluteProjectRoot);

      return !normalizedExcludeFiles.has(normalizedFile);
    });

    // 並行讀取所有檔案內容
    const fileContents = await Promise.all(
      filesToCheck.map(async file => {
        try {
          const content = await this.fileSystem.readFile(file, 'utf-8') as string;
          return { file, content };
        } catch (error) {
          // graceful-degradation: 無法讀取的檔案跳過引用檢查
          diagnostics.warn('move/file-scanner', 'FILE_READ_ERROR', `Cannot read file for reference check: ${error instanceof Error ? error.message : String(error)}`);
          return { file, content: null };
        }
      })
    );

    // 批次檢查引用
    for (const { file, content } of fileContents) {
      if (content === null) {
        continue;
      }

      const imports = this.importResolver.parseImportStatements(content, file);
      for (const importStatement of imports) {
        // 跳過 node_modules
        if (this.importResolver.isNodeModuleImport(importStatement.path)) {
          continue;
        }

        // 解析 import 路徑並檢查是否指向目標檔案
        const resolvedPath = this.pathUtils.resolveImportPath(importStatement.path, file);
        for (const movedPath of normalizedMovedPaths) {
          if (this.pathUtils.pathsMatch(resolvedPath, movedPath)) {
            affectedFilesByMovedPath.get(movedPath)?.add(file);
          }
        }
      }
    }

    return new Map(
      Array.from(affectedFilesByMovedPath.entries()).map(([movedPath, affectedFiles]) => [
        movedPath,
        Array.from(affectedFiles)
      ])
    );
  }

  private resolveProjectRoot(projectRoot: string): string {
    return path.isAbsolute(projectRoot) ? projectRoot : path.resolve(projectRoot);
  }

  private normalizePath(filePath: string, absoluteProjectRoot: string): string {
    return path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.normalize(path.resolve(absoluteProjectRoot, filePath));
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
    } catch (error) {
      diagnostics.warn('move/file-scanner', 'FILE_READ_ERROR', `Cannot read file for reference check: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
