/**
 * 路徑計算模組
 * 負責計算 import 路徑更新
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { ImportResolver } from './import-resolver.js';
import { PathUtils } from './path-utils.js';
import { FileScanner } from './file-scanner.js';
import type { PathUpdate } from './types.js';

/**
 * 路徑計算器類別
 * 負責計算檔案移動時需要更新的 import 路徑
 */
export class PathCalculator {
  private readonly pathUtils: PathUtils;
  private readonly fileScanner: FileScanner;

  constructor(
    private readonly fileSystem: IFileSystem,
    private readonly importResolver: ImportResolver
  ) {
    this.pathUtils = new PathUtils(importResolver);
    this.fileScanner = new FileScanner(fileSystem, importResolver);
  }

  /**
   * 計算路徑更新的內部共用方法
   * 用於 moveFile() 和 generateChangeset() 共用
   *
   * @param source - 來源路徑
   * @param target - 目標路徑
   * @param isDirectory - 是否為目錄
   * @param projectRoot - 專案根目錄
   * @returns 路徑更新列表
   */
  async calculatePathUpdatesInternal(
    source: string,
    target: string,
    isDirectory: boolean,
    projectRoot: string
  ): Promise<PathUpdate[]> {
    const pathUpdates: PathUpdate[] = [];

    if (isDirectory) {
      // 目錄移動：處理目錄內所有檔案
      const filesInDir = await this.fileScanner.getFilesInDirectory(source);

      for (const filePath of filesInDir) {
        // 計算檔案在目錄內的相對路徑
        const relativePath = path.relative(source, filePath);
        const newFilePath = path.join(target, relativePath);

        // 更新其他檔案對目錄內檔案的引用
        // 排除目錄內的所有檔案，避免重複處理
        const affectedFiles = await this.fileScanner.findAffectedFiles(
          filePath,
          projectRoot,
          filesInDir
        );
        for (const affectedFile of affectedFiles) {
          const updates = await this.calculatePathUpdates(affectedFile, filePath, newFilePath);
          pathUpdates.push(...updates);
        }

        // 更新目錄內檔案的內部 import
        // 傳入目錄資訊，讓方法知道哪些引用不需要更新
        const internalUpdates = await this.calculateMovedFileInternalUpdates(
          filePath,
          newFilePath,
          source,
          filesInDir
        );
        pathUpdates.push(...internalUpdates);
      }
    } else {
      // 單一檔案移動
      // 更新其他檔案對被移動檔案的引用
      const affectedFiles = await this.fileScanner.findAffectedFiles(source, projectRoot);

      for (const filePath of affectedFiles) {
        const updates = await this.calculatePathUpdates(filePath, source, target);
        pathUpdates.push(...updates);
      }

      // 更新被移動檔案內部的 import（在移動前處理）
      const movedFileInternalUpdates = await this.calculateMovedFileInternalUpdates(source, target);
      pathUpdates.push(...movedFileInternalUpdates);
    }

    return pathUpdates;
  }

  /**
   * 計算路徑更新
   * 針對單一檔案，計算其對被移動檔案的 import 更新
   *
   * @param filePath - 包含 import 的檔案
   * @param oldPath - 舊的目標路徑
   * @param newPath - 新的目標路徑
   * @returns 路徑更新列表
   */
  async calculatePathUpdates(
    filePath: string,
    oldPath: string,
    newPath: string
  ): Promise<PathUpdate[]> {
    const updates: PathUpdate[] = [];

    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;
      const imports = this.importResolver.parseImportStatements(content, filePath);

      for (const importStatement of imports) {
        // 跳過 node_modules
        if (this.importResolver.isNodeModuleImport(importStatement.path)) {
          continue;
        }

        // 將 oldPath 規範化為絕對路徑以便比較
        const normalizedOldPath = path.isAbsolute(oldPath)
          ? path.normalize(oldPath)
          : path.normalize(path.resolve(oldPath));

        // 計算 import 指向的絕對路徑
        const resolvedPath = this.pathUtils.resolveImportPath(importStatement.path, filePath);

        // 使用 pathsMatch 檢查是否指向被移動的檔案
        if (this.pathUtils.pathsMatch(resolvedPath, normalizedOldPath)) {
          // 計算新的 import 路徑，保留原始路徑類型（別名或相對路徑）
          const newImportPath = this.pathUtils.calculateNewImportPathPreservingStyle(
            importStatement.path,
            filePath,
            normalizedOldPath,
            newPath
          );

          const newImport = importStatement.rawStatement.replace(
            new RegExp(`(['"\`])${this.pathUtils.escapeRegex(importStatement.path)}\\1`),
            `$1${newImportPath}$1`
          );

          updates.push({
            filePath,
            line: importStatement.position.line,
            oldImport: importStatement.rawStatement,
            newImport
          });
        }
      }
    } catch (error) {
      console.warn(`無法處理檔案 ${filePath}:`, error);
    }

    return updates;
  }

  /**
   * 計算被移動檔案內部的 import 更新
   * 這些更新會在檔案移動後套用
   *
   * @param source - 來源檔案路徑
   * @param target - 目標檔案路徑
   * @param movedDirectory - 被移動的目錄路徑（目錄移動時使用）
   * @param filesInMovedDir - 被移動目錄內的所有檔案（目錄移動時使用）
   * @returns 路徑更新列表
   */
  async calculateMovedFileInternalUpdates(
    source: string,
    target: string,
    movedDirectory?: string,
    filesInMovedDir?: string[]
  ): Promise<PathUpdate[]> {
    const updates: PathUpdate[] = [];

    try {
      const content = await this.fileSystem.readFile(source, 'utf-8') as string;
      const imports = this.importResolver.parseImportStatements(content, source);

      // 防禦性檢查：確保 imports 是陣列
      if (!imports || !Array.isArray(imports)) {
        return updates;
      }

      // 如果是目錄移動，建立 Set 以快速查找
      const normalizedFilesInDir = filesInMovedDir
        ? new Set(filesInMovedDir.map(f => path.normalize(f)))
        : null;

      for (const importStatement of imports) {
        // 跳過 node_modules
        if (this.importResolver.isNodeModuleImport(importStatement.path)) {
          continue;
        }

        // 只處理相對路徑的 import
        if (importStatement.path.startsWith('.')) {
          // 計算這個 import 當前指向的檔案
          const sourceDir = path.dirname(source);
          const currentResolved = path.resolve(sourceDir, importStatement.path);
          const normalizedResolved = path.normalize(currentResolved);

          // 如果是目錄移動，檢查被引用的檔案是否也在被移動的目錄內
          if (movedDirectory && normalizedFilesInDir) {
            // 嘗試解析到實際檔案（處理省略副檔名的情況）
            const possibleExtensions = ['.ts', '.tsx', '.js', '.jsx', ''];
            const isTargetInMovedDir = possibleExtensions.some(ext => {
              const fullPath = path.normalize(normalizedResolved + ext);
              return normalizedFilesInDir.has(fullPath);
            });

            // 如果目標檔案也在被移動的目錄內，相對位置不變，跳過更新
            if (isTargetInMovedDir) {
              continue;
            }
          }

          // 計算從新位置應該如何 import 這個檔案
          const newImportPath = this.pathUtils.calculateNewImportPath(target, currentResolved);

          // 如果路徑改變了，加入更新列表
          if (newImportPath !== importStatement.path) {
            updates.push({
              filePath: target, // 注意：這裡是 target，因為更新會在檔案移動後套用
              line: importStatement.position.line,
              oldImport: importStatement.rawStatement,
              newImport: importStatement.rawStatement.replace(
                new RegExp(`(['"\`])${this.pathUtils.escapeRegex(importStatement.path)}\\1`),
                `$1${newImportPath}$1`
              )
            });
          }
        }
      }
    } catch (error) {
      console.warn(`無法處理被移動檔案的內部 import ${source}:`, error);
    }

    return updates;
  }
}
