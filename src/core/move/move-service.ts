/**
 * 檔案移動服務
 * 提供安全的檔案移動功能，自動更新所有相關的 import 路徑
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import {
  ChangesetCommand,
  TextEditOperationType,
  type Changeset,
  type TextEdit,
  createChangesetBuilder
} from '@infrastructure/changeset/index.js';
import { getErrorMessage } from '@shared/errors/index.js';
import { ImportResolver } from './import-resolver.js';
import { PathCalculator } from './path-calculator.js';
import { PathUtils } from './path-utils.js';
import type {
  MoveInput,
  MoveOptions,
  MoveResult,
  PathUpdate,
  ImportResolverConfig,
  MoveError as MoveErrorType
} from './types.js';
import { createMoveError } from './types.js';

/**
 * 移動操作錯誤類別
 * 用於事務中明確識別錯誤類型
 */
export class MoveOperationError extends Error {
  constructor(
    message: string,
    public readonly errorType: MoveErrorType['type'],
    public readonly filePath?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'MoveOperationError';
  }

  /**
   * 轉換為 MoveError 介面
   */
  toMoveError(): MoveErrorType {
    return createMoveError(this.errorType, this.message, this.filePath, this.cause);
  }
}

/**
 * 檔案移動服務類別
 */
export class MoveService {
  private readonly importResolver: ImportResolver;
  private readonly pathCalculator: PathCalculator;
  private readonly pathUtils: PathUtils;

  constructor(
    private readonly fileSystem: IFileSystem,
    config?: ImportResolverConfig,
    importResolver?: ImportResolver
  ) {
    if (importResolver) {
      this.importResolver = importResolver;
    } else {
      const defaultConfig: ImportResolverConfig = {
        pathAliases: {},
        supportedExtensions: ['.js', '.ts', '.jsx', '.tsx', '.vue'],
        ...config
      };
      this.importResolver = new ImportResolver(defaultConfig);
    }
    this.pathCalculator = new PathCalculator(this.fileSystem, this.importResolver);
    this.pathUtils = new PathUtils(this.importResolver);
  }

  /**
   * 移動檔案或目錄
   */
  async moveFile(operation: MoveInput, options: MoveOptions = {}): Promise<MoveResult> {
    const { source, target, updateImports = true } = operation;
    const { preview = false, projectRoot = process.cwd() } = options;
    let fileMoved = false;
    const transactionLog: string[] = [];

    try {
      // 1. 驗證路徑
      await this.validatePaths(source, target);

      // 檢查是否為目錄
      const isDirectory = await this.fileSystem.isDirectory(source);

      // 2. 收集需要更新的檔案
      const pathUpdates = updateImports
        ? await this.pathCalculator.calculatePathUpdatesInternal(source, target, isDirectory, projectRoot)
        : [];

      // 3. 預覽模式
      if (preview) {
        return {
          success: true,
          source,
          target,
          moved: false,
          pathUpdates,
          message: `預覽：將移動 ${source} → ${target}，影響 ${pathUpdates.length} 個 import`
        };
      }

      // 4. 執行移動
      transactionLog.push(`MOVE: ${source} → ${target}`);
      await this.performMove(source, target);
      fileMoved = true;

      // 5. 更新 import 路徑
      if (updateImports && pathUpdates.length > 0) {
        try {
          await this.applyPathUpdates(pathUpdates);
          transactionLog.push(`IMPORT_UPDATES: ${JSON.stringify(
            pathUpdates.map(u => ({
              file: u.filePath,
              line: u.line,
              from: u.oldImport,
              to: u.newImport
            }))
          )}`);
        } catch (updateError) {
          // 所有 import 更新錯誤都應該觸發回滾
          const errorMessage = updateError instanceof Error ? updateError.message : 'Unknown error';

          // 記錄錯誤到事務日誌
          transactionLog.push(`IMPORT_UPDATE_FAILED: ${errorMessage}`);

          // 嘗試回滾檔案移動
          try {
            transactionLog.push(`ROLLBACK_ATTEMPT: ${target} → ${source}`);
            await this.performRollback(target, source, isDirectory);
            fileMoved = false;
            transactionLog.push('ROLLBACK_SUCCESS');
          } catch (rollbackError) {
            // 回滾失敗，記錄完整事務日誌供手動恢復
            const rollbackErrorMsg = rollbackError instanceof Error ? rollbackError.message : 'Unknown error';
            transactionLog.push(`ROLLBACK_FAILED: ${rollbackErrorMsg}`);

            // 建構詳細的手動恢復指引
            const manualRecoverySteps = [
              `將 ${target} 移動回 ${source}`,
              `檢查並還原以下檔案的 import 變更: ${pathUpdates.map(u => u.filePath).join(', ')}`
            ];

            return {
              success: false,
              source,
              target,
              moved: true, // 檔案仍在 target 位置
              pathUpdates,
              error: `Import 更新失敗且無法回滾: ${errorMessage}。回滾錯誤: ${rollbackErrorMsg}。手動恢復步驟: ${manualRecoverySteps.join('; ')}`,
              message: `移動失敗且回滾失敗，需要手動恢復。事務日誌: ${transactionLog.join('; ')}`
            };
          }

          return {
            success: false,
            source,
            target,
            moved: fileMoved,
            pathUpdates,
            error: errorMessage,
            message: `移動失敗: ${errorMessage}`
          };
        }
      }

      return {
        success: true,
        source,
        target,
        moved: true,
        pathUpdates,
        message: `成功移動 ${source} → ${target}，更新了 ${pathUpdates.length} 個 import`
      };

    } catch (error) {
      // 最外層的 try-catch：在計算 pathUpdates 之前發生的錯誤，pathUpdates 可能尚未初始化
      const pathUpdates: PathUpdate[] = [];
      return {
        success: false,
        source,
        target,
        moved: fileMoved,
        pathUpdates,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: `移動失敗: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * 執行回滾操作
   */
  private async performRollback(currentPath: string, originalPath: string, isDirectory: boolean): Promise<void> {
    if (isDirectory) {
      await this.moveDirectory(currentPath, originalPath);
    } else {
      await this.fileSystem.moveFile(currentPath, originalPath);
    }
  }

  /**
   * 生成移動的 Changeset
   * 不執行實際移動，只計算變更
   *
   * @param operation - 移動操作輸入
   * @param options - 移動選項
   * @returns Changeset 物件
   */
  async generateChangeset(operation: MoveInput, options: MoveOptions = {}): Promise<Changeset> {
    const { source, target, updateImports = true } = operation;
    const { projectRoot = process.cwd() } = options;

    const builder = createChangesetBuilder()
      .forCommand(ChangesetCommand.Move)
      .withDescription(`Moved '${path.basename(source)}' to '${path.basename(target)}'`);

    try {
      // 驗證路徑（只讀驗證，不建立目錄）
      await this.validatePathsForChangeset(source, target);

      // 檢查是否為目錄
      const isDirectory = await this.fileSystem.isDirectory(source);

      // 收集 import 更新
      const pathUpdates = updateImports
        ? await this.pathCalculator.calculatePathUpdatesInternal(source, target, isDirectory, projectRoot)
        : [];

      // 轉換 pathUpdates 為 TextEdit，按檔案分組
      // 注意：對於被移動檔案的內部更新，filePath 是 target，但需要從 source 讀取內容
      const grouped = new Map<string, PathUpdate[]>();
      for (const update of pathUpdates) {
        const list = grouped.get(update.filePath) ?? [];
        list.push(update);
        grouped.set(update.filePath, list);
      }

      for (const [filePath, updates] of grouped) {
        // 判斷是否為被移動檔案的內部更新
        // 可能是單檔移動（filePath === target）或目錄移動（filePath 以 target 開頭）
        const isMovedFile = filePath === target || filePath.startsWith(target + path.sep);
        // 計算原始檔案路徑
        let readPath = filePath;
        if (isMovedFile) {
          if (filePath === target) {
            // 單檔移動
            readPath = source;
          } else {
            // 目錄移動：將 target 前綴替換為 source
            const relativePath = filePath.slice(target.length);
            readPath = source + relativePath;
          }
        }
        const content = await this.fileSystem.readFile(readPath, 'utf-8') as string;
        const lines = content.split('\n');

        const edits: TextEdit[] = updates.map(update => {
          const lineIndex = update.line - 1;
          const lineContent = lines[lineIndex] ?? '';
          const startCol = lineContent.indexOf(update.oldImport) + 1;
          const endCol = startCol + update.oldImport.length;

          return {
            range: {
              start: { line: update.line, column: startCol },
              end: { line: update.line, column: endCol }
            },
            newText: update.newImport,
            description: `Update import: ${update.oldImport} → ${update.newImport}`
          };
        });

        // 對於被移動檔案，使用原始路徑來建立 TextChange（轉換器會從該路徑讀取）
        // 實際的檔案移動由 fileOperations 處理
        builder.addTextChange(readPath, edits, TextEditOperationType.Modify);
      }

      // 新增檔案移動操作
      builder.addFileMove(source, target);

      return builder.build();
    } catch (error) {
      return builder
        .addError(getErrorMessage(error))
        .build();
    }
  }

  /**
   * 驗證路徑（只讀版本，用於 generateChangeset）
   * 不建立任何目錄，只做驗證
   */
  private async validatePathsForChangeset(source: string, target: string): Promise<void> {
    // 檢查來源是否存在
    const sourceExists = await this.fileSystem.exists(source);
    if (!sourceExists) {
      throw new Error(`來源路徑不存在: ${source}`);
    }

    // 檢查目標是否已存在
    const targetExists = await this.fileSystem.exists(target);
    if (targetExists) {
      throw new Error(`目標路徑已存在: ${target}`);
    }
  }

  /**
   * 驗證路徑
   */
  private async validatePaths(source: string, target: string): Promise<void> {
    // 檢查來源是否存在
    const sourceExists = await this.fileSystem.exists(source);
    if (!sourceExists) {
      throw new Error(`來源路徑不存在: ${source}`);
    }

    // 檢查目標路徑的父目錄
    const targetDir = path.dirname(target);
    const targetDirExists = await this.fileSystem.exists(targetDir);
    if (!targetDirExists) {
      // 嘗試建立父目錄
      await this.fileSystem.createDirectory(targetDir);
    }

    // 檢查目標是否已存在
    const targetExists = await this.fileSystem.exists(target);
    if (targetExists) {
      throw new Error(`目標路徑已存在: ${target}`);
    }
  }

  /**
   * 執行實際的檔案移動
   */
  private async performMove(source: string, target: string): Promise<void> {
    const isDirectory = await this.fileSystem.isDirectory(source);

    if (isDirectory) {
      // 目錄移動：遞迴複製所有檔案，然後刪除原目錄
      await this.moveDirectory(source, target);
    } else {
      // 單一檔案移動
      const targetDir = path.dirname(target);
      await this.fileSystem.createDirectory(targetDir);
      await this.fileSystem.moveFile(source, target);
    }
  }

  /**
   * 遞迴移動目錄
   */
  private async moveDirectory(source: string, target: string): Promise<void> {
    // 建立目標目錄（recursive: true 確保父目錄也被建立）
    await this.fileSystem.createDirectory(target, true);

    // 讀取源目錄內容
    const entries = await this.fileSystem.readDirectory(source);

    for (const entry of entries) {
      const sourcePath = entry.path;
      const relativePath = path.relative(source, sourcePath);
      const targetPath = path.join(target, relativePath);

      if (entry.isDirectory) {
        // 遞迴處理子目錄
        await this.moveDirectory(sourcePath, targetPath);
      } else if (entry.isFile) {
        // 複製檔案
        const content = await this.fileSystem.readFile(sourcePath, 'utf-8');
        await this.fileSystem.writeFile(targetPath, content as string);
        await this.fileSystem.deleteFile(sourcePath);
      }
    }

    // 刪除原目錄
    await this.fileSystem.deleteDirectory(source);
  }

  /**
   * 應用路徑更新
   */
  private async applyPathUpdates(updates: PathUpdate[]): Promise<void> {
    const fileUpdates = new Map<string, PathUpdate[]>();

    // 按檔案分組
    for (const update of updates) {
      if (!fileUpdates.has(update.filePath)) {
        fileUpdates.set(update.filePath, []);
      }
      const list = fileUpdates.get(update.filePath);
      if (list) {
        list.push(update);
      }
    }

    // 逐檔案應用更新
    for (const [filePath, fileUpdateList] of fileUpdates) {
      await this.applyFileUpdates(filePath, fileUpdateList);
    }
  }

  /**
   * 應用單一檔案的更新
   */
  private async applyFileUpdates(filePath: string, updates: PathUpdate[]): Promise<void> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;

      let newContent = content;

      // 對於多行語句，需要特別處理
      for (const update of updates) {
        // 直接使用字串替換，支援多行
        newContent = newContent.replace(update.oldImport, update.newImport);

        // 如果未找到完全匹配，嘗試規範化並再試一次
        if (newContent.indexOf(update.oldImport) === -1) {
          // 嘗試將多行 oldImport 規範化（移除額外的空格和換行）
          const normalizedOldImport = update.oldImport.replace(/\s+/g, ' ').trim();
          const contentNormalized = newContent.replace(/\s+/g, ' ');

          if (contentNormalized.indexOf(normalizedOldImport) !== -1) {
            newContent = content; // 重置
            newContent = newContent.replace(
              new RegExp(this.pathUtils.escapeRegex(normalizedOldImport).replace(/\s+/g, '\\s+'), 'g'),
              update.newImport.replace(/\s+/g, ' ').trim()
            );
          }
        }
      }

      await this.fileSystem.writeFile(filePath, newContent);
    } catch (error) {
      throw new Error(`更新檔案 ${filePath} 失敗: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
