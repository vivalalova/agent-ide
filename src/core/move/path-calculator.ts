/**
 * 路徑計算模組
 * 負責計算 import 路徑更新
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { ImportResolver } from './import-resolver.js';
import { PathUtils } from './path-utils.js';
import { FileScanner } from './file-scanner.js';
import type { PathUpdate, BatchMoveInfo } from './types.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { SOURCE_FILE_EXTENSIONS } from '@shared/types/index.js';

const SOURCE_FILE_EXTENSIONS_WITH_EXTENSIONLESS_IMPORT = [...SOURCE_FILE_EXTENSIONS, ''] as const;
const SOURCE_INDEX_FILES = SOURCE_FILE_EXTENSIONS.map(extension => `/index${extension}`);

/**
 * 路徑計算器類別
 * 負責計算檔案移動時需要更新的 import 路徑
 */
export class PathCalculator {
  private readonly pathUtils: PathUtils;
  private readonly fileScanner: FileScanner;
  private readonly batchAffectedFilesCache = new WeakMap<BatchMoveInfo, Map<string, Promise<Map<string, string[]>>>>();

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
   * @param batchMoveInfo - 批次移動資訊（glob 模式使用）
   * @returns 路徑更新列表
   */
  async calculatePathUpdatesInternal(
    source: string,
    target: string,
    isDirectory: boolean,
    projectRoot: string,
    batchMoveInfo?: BatchMoveInfo
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
      // 排除同一批次中也被移動的檔案（它們的相對引用會保持不變）
      const affectedFiles = batchMoveInfo
        ? await this.findBatchAffectedFiles(source, projectRoot, batchMoveInfo)
        : await this.fileScanner.findAffectedFiles(source, projectRoot);

      for (const filePath of affectedFiles) {
        const updates = await this.calculatePathUpdates(filePath, source, target);
        pathUpdates.push(...updates);
      }

      // 更新被移動檔案內部的 import（在移動前處理）
      // 傳入 batchMoveInfo 讓方法知道哪些檔案是一起被移動的
      const movedFileInternalUpdates = await this.calculateMovedFileInternalUpdates(
        source,
        target,
        undefined,
        undefined,
        batchMoveInfo
      );
      pathUpdates.push(...movedFileInternalUpdates);
    }

    // 規範化路徑：確保所有 filePath 都是絕對路徑
    // 這避免了相對路徑和絕對路徑被視為不同的檔案
    const normalizedUpdates = pathUpdates.map(update => ({
      ...update,
      filePath: path.isAbsolute(update.filePath)
        ? path.normalize(update.filePath)
        : path.resolve(projectRoot, update.filePath)
    }));

    // 去重：使用 filePath + line + oldImport 作為唯一鍵
    const seen = new Set<string>();
    const uniqueUpdates = normalizedUpdates.filter(update => {
      const key = `${update.filePath}:${update.line}:${update.oldImport}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return uniqueUpdates;
  }

  private async findBatchAffectedFiles(
    source: string,
    projectRoot: string,
    batchMoveInfo: BatchMoveInfo
  ): Promise<string[]> {
    let projectCache = this.batchAffectedFilesCache.get(batchMoveInfo);
    if (!projectCache) {
      projectCache = new Map<string, Promise<Map<string, string[]>>>();
      this.batchAffectedFilesCache.set(batchMoveInfo, projectCache);
    }

    const absoluteProjectRoot = path.isAbsolute(projectRoot) ? projectRoot : path.resolve(projectRoot);
    const projectCacheKey = path.normalize(absoluteProjectRoot);
    let affectedFilesPromise = projectCache.get(projectCacheKey);
    if (!affectedFilesPromise) {
      const batchSourceFiles = Array.from(batchMoveInfo.allMovedFiles.keys());
      affectedFilesPromise = this.fileScanner.findAffectedFilesForPaths(
        batchSourceFiles,
        projectRoot,
        batchSourceFiles
      );
      projectCache.set(projectCacheKey, affectedFilesPromise);
    }

    const normalizedSource = path.isAbsolute(source)
      ? path.normalize(source)
      : path.normalize(path.resolve(absoluteProjectRoot, source));
    const affectedFilesBySource = await affectedFilesPromise;
    return affectedFilesBySource.get(normalizedSource) ?? [];
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

          const newImport = this.replaceModuleSpecifier(
            importStatement.rawStatement,
            importStatement.path,
            newImportPath
          );
          if (newImport === importStatement.rawStatement) {
            continue;
          }

          updates.push({
            filePath,
            line: importStatement.position.line,
            oldImport: importStatement.rawStatement,
            newImport
          });
        }
      }
    } catch (error) {
      diagnostics.warn('move/path-calculator', 'ANALYSIS_DEGRADED', `無法處理檔案: ${error instanceof Error ? error.message : String(error)}`, filePath);
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
   * @param batchMoveInfo - 批次移動資訊（glob 模式使用）
   * @returns 路徑更新列表
   */
  async calculateMovedFileInternalUpdates(
    source: string,
    target: string,
    movedDirectory?: string,
    filesInMovedDir?: string[],
    batchMoveInfo?: BatchMoveInfo
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

      // 如果是批次移動（glob 模式），建立 Set 以快速查找
      // 將所有被移動檔案的 source 路徑規範化，同時加入不帶副檔名的版本
      let normalizedBatchSources: Set<string> | null = null;
      if (batchMoveInfo) {
        normalizedBatchSources = new Set<string>();
        for (const filePath of batchMoveInfo.allMovedFiles.keys()) {
          const normalized = path.normalize(filePath);
          normalizedBatchSources.add(normalized);
          // 同時加入不帶副檔名的版本（用於比較省略副檔名的 import）
          const ext = path.extname(normalized);
          if (ext) {
            normalizedBatchSources.add(normalized.slice(0, -ext.length));
          }
        }
      }

      for (const importStatement of imports) {
        // 跳過 node_modules
        if (this.importResolver.isNodeModuleImport(importStatement.path)) {
          continue;
        }

        // 處理相對路徑的 import
        if (importStatement.path.startsWith('.')) {
          // 計算這個 import 當前指向的檔案
          const sourceDir = path.dirname(source);
          const currentResolved = path.resolve(sourceDir, importStatement.path);
          const normalizedResolved = path.normalize(currentResolved);

          // 如果是目錄移動，檢查被引用的檔案是否也在被移動的目錄內
          if (movedDirectory && normalizedFilesInDir) {
            // 嘗試解析到實際檔案（處理省略副檔名的情況）
            const isTargetInMovedDir = SOURCE_FILE_EXTENSIONS_WITH_EXTENSIONLESS_IMPORT.some(ext => {
              const fullPath = path.normalize(normalizedResolved + ext);
              return normalizedFilesInDir.has(fullPath);
            });

            // 如果目標檔案也在被移動的目錄內，相對位置不變，跳過更新
            if (isTargetInMovedDir) {
              continue;
            }
          }

          // 如果是批次移動（glob 模式），檢查被引用的檔案是否也在被移動列表中
          if (batchMoveInfo) {
            // 遍歷所有被移動的檔案，檢查是否有匹配
            // 使用 pathsMatch 來處理路徑格式差異和副檔名省略
            let isTargetInBatch = false;
            for (const batchSource of batchMoveInfo.allMovedFiles.keys()) {
              if (this.pathUtils.pathsMatch(normalizedResolved, batchSource)) {
                isTargetInBatch = true;
                break;
              }
            }

            // 如果目標檔案也在被移動列表中，相對位置不變，跳過更新
            if (isTargetInBatch) {
              continue;
            }
          }

          // Issue #58 修復：檢查目標目錄是否有同名檔案
          // 如果保持相對路徑不變，在目標位置會解析到的檔案
          const targetDir = path.dirname(target);
          const potentialTargetResolved = path.resolve(targetDir, importStatement.path);

          // 檢查目標位置是否存在同名檔案
          let targetFileExists = false;
          for (const ext of SOURCE_FILE_EXTENSIONS_WITH_EXTENSIONLESS_IMPORT) {
            const fullPath = potentialTargetResolved + ext;
            if (await this.fileSystem.exists(fullPath)) {
              targetFileExists = true;
              break;
            }
          }

          // 檢查這個 import 目前解析到的原始檔案是否仍存在於原位置。
          // 只有「原檔已不在原位（已被搬走）」時，目標目錄的同名檔案才代表
          // 這是連帶／增量搬移的結果；原檔仍在原位時，目標目錄的同名檔案
          // 只是巧合，繼續保留相對路徑會讓 import 靜默綁到錯誤的模組。
          let sourceFileStillExists = false;
          for (const ext of SOURCE_FILE_EXTENSIONS_WITH_EXTENSIONLESS_IMPORT) {
            const fullPath = normalizedResolved + ext;
            if (await this.fileSystem.exists(fullPath)) {
              sourceFileStillExists = true;
              break;
            }
          }

          // 如果目標目錄有同名檔案，且原檔已不在原位（已被搬移過去），
          // 保持相對路徑不變，跳過更新
          if (targetFileExists && !sourceFileStillExists) {
            continue;
          }

          // 計算從新位置應該如何 import 這個檔案，並保留原始 import 的副檔名樣式。
          const newImportPath = this.pathUtils.calculateNewImportPathPreservingStyle(
            importStatement.path,
            target,
            currentResolved,
            currentResolved
          );

          // 如果路徑改變了，加入更新列表
          if (newImportPath !== importStatement.path) {
            const newImport = this.replaceModuleSpecifier(
              importStatement.rawStatement,
              importStatement.path,
              newImportPath
            );
            if (newImport === importStatement.rawStatement) {
              continue;
            }

            updates.push({
              filePath: target, // 注意：這裡是 target，因為更新會在檔案移動後套用
              line: importStatement.position.line,
              oldImport: importStatement.rawStatement,
              newImport
            });
          }
        }
        // 處理 alias 和 baseUrl 相對路徑（如 @/modules/db/...）
        else {
          // 解析 alias 到實際檔案路徑
          const resolvedPath = this.pathUtils.resolveImportPath(importStatement.path, source);

          // 如果解析結果與原始路徑相同，表示無法解析，跳過
          if (resolvedPath === importStatement.path) {
            continue;
          }

          const normalizedResolved = path.normalize(resolvedPath);

          // 如果是目錄移動，檢查被引用的檔案是否在被移動的目錄內
          if (movedDirectory && normalizedFilesInDir) {
            // 嘗試解析到實際檔案（處理省略副檔名和 index 檔案的情況）
            // 檢查直接副檔名匹配（如 @/modules/utils → utils.ts）
            let isTargetInMovedDir = SOURCE_FILE_EXTENSIONS_WITH_EXTENSIONLESS_IMPORT.some(ext => {
              const fullPath = path.normalize(normalizedResolved + ext);
              return normalizedFilesInDir.has(fullPath);
            });

            // 如果不是直接匹配，檢查 index 檔案（如 @/modules/alarm → alarm/index.ts）
            if (!isTargetInMovedDir) {
              isTargetInMovedDir = SOURCE_INDEX_FILES.some(indexFile => {
                const fullPath = path.normalize(normalizedResolved + indexFile);
                return normalizedFilesInDir.has(fullPath);
              });
            }

            // 如果目標檔案也在被移動的目錄內，需要更新 alias 路徑
            if (isTargetInMovedDir) {
              // 計算被引用檔案相對於原目錄的位置
              const relativeToMovedDir = path.relative(movedDirectory, normalizedResolved);

              // 計算源檔案相對於原目錄的位置
              const sourceRelativeToMovedDir = path.relative(movedDirectory, source);

              // 從 target 回溯到目標目錄
              let targetMovedDir = target;
              const depthParts = sourceRelativeToMovedDir.split(path.sep);
              for (let i = 0; i < depthParts.length; i++) {
                targetMovedDir = path.dirname(targetMovedDir);
              }

              // 被引用檔案的新位置
              const newResolvedPath = path.join(targetMovedDir, relativeToMovedDir);

              // 使用 calculateNewImportPathPreservingStyle 計算新的 alias 路徑
              const newImportPath = this.pathUtils.calculateNewImportPathPreservingStyle(
                importStatement.path,
                target,
                normalizedResolved,
                newResolvedPath
              );

              // 如果路徑改變了，加入更新列表
              if (newImportPath !== importStatement.path) {
                const newImport = this.replaceModuleSpecifier(
                  importStatement.rawStatement,
                  importStatement.path,
                  newImportPath
                );
                if (newImport === importStatement.rawStatement) {
                  continue;
                }

                updates.push({
                  filePath: target,
                  line: importStatement.position.line,
                  oldImport: importStatement.rawStatement,
                  newImport
                });
              }
            }
          }
        }
      }
    } catch (error) {
      diagnostics.warn('move/path-calculator', 'ANALYSIS_DEGRADED', `無法處理被移動檔案的內部 import ${source}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return updates;
  }

  private replaceModuleSpecifier(rawStatement: string, oldPath: string, newPath: string): string {
    const escapedOldPath = this.pathUtils.escapeRegex(oldPath);
    const fromSpecifierPattern = new RegExp(
      `(\\bfrom\\s*['"\`])${escapedOldPath}(['"\`])(?=\\s*(?:(?:with|assert)\\s+\\{[\\s\\S]*?\\}\\s*)?;?\\s*(?://[^\\n\\r]*|/\\*[\\s\\S]*?\\*/)?\\s*$)`
    );
    if (fromSpecifierPattern.test(rawStatement)) {
      return rawStatement.replace(fromSpecifierPattern, `$1${newPath}$2`);
    }

    const sideEffectImportPattern = new RegExp(`(\\bimport\\s*['"\`])${escapedOldPath}(['"\`])`);
    if (sideEffectImportPattern.test(rawStatement)) {
      return rawStatement.replace(sideEffectImportPattern, `$1${newPath}$2`);
    }

    const callSpecifierPattern = new RegExp(`(\\b(?:require|import)\\(\\s*['"\`])${escapedOldPath}(['"\`])`);
    return rawStatement.replace(callSpecifierPattern, `$1${newPath}$2`);
  }
}
