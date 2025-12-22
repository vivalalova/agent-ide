/**
 * 變更應用器
 * 負責將變更集應用到檔案系統，支援 dry-run、備份、回滾
 */

import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type {
  Changeset,
  FileTextChange,
  FileOperation,
  ApplyResult,
  ApplyOptions,
  BackupEntry,
  TextEdit
} from './types.js';

/**
 * 變更應用器
 * 統一處理文字變更和檔案操作的應用邏輯
 */
export class ChangeApplicator {
  constructor(private readonly fileSystem: IFileSystem) {}

  /**
   * 應用變更集
   * @param changeset 要應用的變更集
   * @param options 應用選項
   * @returns 應用結果
   */
  async apply(changeset: Changeset, options: ApplyOptions = {}): Promise<ApplyResult> {
    const { dryRun = false, atomic = true, rollbackOnError = true } = options;

    // dry-run 模式：只計算會修改的檔案，不實際寫入
    if (dryRun) {
      return this.dryRunApply(changeset);
    }

    const backups: BackupEntry[] = [];
    const modifiedFiles: string[] = [];
    const createdFiles: string[] = [];
    const deletedFiles: string[] = [];
    const movedFiles: Array<{ from: string; to: string }> = [];
    const errors: string[] = [];

    try {
      // 1. 建立備份
      await this.createBackups(changeset, backups);

      // 2. 應用文字變更
      for (const textChange of changeset.textChanges) {
        try {
          await this.applyTextChange(textChange, atomic);
          modifiedFiles.push(textChange.filePath);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`文字變更失敗 [${textChange.filePath}]: ${message}`);

          if (rollbackOnError) {
            const rollbackErrors = await this.rollback(backups);
            return {
              success: false,
              modifiedFiles: [],
              createdFiles: [],
              deletedFiles: [],
              movedFiles: [],
              errors: [...errors, ...rollbackErrors]
            };
          }
        }
      }

      // 3. 應用檔案操作
      for (const operation of changeset.fileOperations) {
        try {
          await this.applyFileOperation(operation, atomic);

          switch (operation.type) {
            case 'create':
              if (operation.targetPath) {
                createdFiles.push(operation.targetPath);
              }
              break;
            case 'delete':
              deletedFiles.push(operation.sourcePath);
              break;
            case 'move':
              if (operation.targetPath) {
                movedFiles.push({
                  from: operation.sourcePath,
                  to: operation.targetPath
                });
              }
              break;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`檔案操作失敗 [${operation.type}]: ${message}`);

          if (rollbackOnError) {
            const rollbackErrors = await this.rollback(backups);
            return {
              success: false,
              modifiedFiles: [],
              createdFiles: [],
              deletedFiles: [],
              movedFiles: [],
              errors: [...errors, ...rollbackErrors]
            };
          }
        }
      }

      return {
        success: errors.length === 0,
        modifiedFiles,
        createdFiles,
        deletedFiles,
        movedFiles,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`應用變更時發生未預期錯誤: ${message}`);

      if (rollbackOnError && backups.length > 0) {
        const rollbackErrors = await this.rollback(backups);
        errors.push(...rollbackErrors);
      }

      return {
        success: false,
        modifiedFiles: [],
        createdFiles: [],
        deletedFiles: [],
        movedFiles: [],
        errors
      };
    }
  }

  /**
   * Dry-run 模式：計算會修改的檔案，不實際執行
   * @param changeset 變更集
   * @returns 預覽結果
   */
  private dryRunApply(changeset: Changeset): ApplyResult {
    const modifiedFiles = changeset.textChanges.map(tc => tc.filePath);
    const createdFiles: string[] = [];
    const deletedFiles: string[] = [];
    const movedFiles: Array<{ from: string; to: string }> = [];

    for (const operation of changeset.fileOperations) {
      switch (operation.type) {
        case 'create':
          if (operation.targetPath) {
            createdFiles.push(operation.targetPath);
          }
          break;
        case 'delete':
          deletedFiles.push(operation.sourcePath);
          break;
        case 'move':
          if (operation.targetPath) {
            movedFiles.push({
              from: operation.sourcePath,
              to: operation.targetPath
            });
          }
          break;
      }
    }

    return {
      success: true,
      modifiedFiles,
      createdFiles,
      deletedFiles,
      movedFiles
    };
  }

  /**
   * 建立備份
   * @param changeset 變更集
   * @param backups 備份列表（會被修改）
   */
  private async createBackups(
    changeset: Changeset,
    backups: BackupEntry[]
  ): Promise<void> {
    // 備份文字變更的檔案
    for (const textChange of changeset.textChanges) {
      const exists = await this.fileSystem.exists(textChange.filePath);

      if (exists) {
        const content = await this.fileSystem.readFile(textChange.filePath, 'utf-8');
        backups.push({
          filePath: textChange.filePath,
          originalContent: content as string,
          type: 'text'
        });
      }
    }

    // 備份檔案操作
    for (const operation of changeset.fileOperations) {
      switch (operation.type) {
        case 'create':
          // 新建檔案：備份為 null（回滾時刪除）
          if (operation.targetPath) {
            backups.push({
              filePath: operation.targetPath,
              originalContent: null,
              type: 'create'
            });
          }
          break;

        case 'delete': {
          // 刪除檔案：備份內容
          const exists = await this.fileSystem.exists(operation.sourcePath);
          if (exists) {
            const content = await this.fileSystem.readFile(operation.sourcePath, 'utf-8');
            backups.push({
              filePath: operation.sourcePath,
              originalContent: content as string,
              type: 'delete'
            });
          }
          break;
        }

        case 'move': {
          // 移動檔案或目錄：備份來源內容
          const exists = await this.fileSystem.exists(operation.sourcePath);
          if (exists) {
            // 檢查是目錄還是檔案
            const isDir = await this.fileSystem.isDirectory(operation.sourcePath);
            if (isDir) {
              // 目錄移動：不備份內容（由 moveDirectory 處理）
              backups.push({
                filePath: operation.sourcePath,
                originalContent: null, // 目錄不備份內容
                type: 'move',
                targetPath: operation.targetPath
              });
            } else {
              const content = await this.fileSystem.readFile(operation.sourcePath, 'utf-8');
              backups.push({
                filePath: operation.sourcePath,
                originalContent: content as string,
                type: 'move',
                targetPath: operation.targetPath
              });
            }
          }
          break;
        }
      }
    }
  }

  /**
   * 應用單一文字變更
   * @param textChange 文字變更
   * @param atomic 是否使用原子寫入
   */
  private async applyTextChange(
    textChange: FileTextChange,
    atomic: boolean
  ): Promise<void> {
    const content = await this.fileSystem.readFile(textChange.filePath, 'utf-8');
    const newContent = this.applyEdits(content as string, textChange.edits);

    await this.fileSystem.writeFile(textChange.filePath, newContent, {
      fsync: atomic
    });
  }

  /**
   * 應用編輯操作到內容
   * 從後往前排序以避免位置偏移
   * @param content 原始內容
   * @param edits 編輯操作列表
   * @returns 修改後的內容
   */
  private applyEdits(content: string, edits: readonly TextEdit[]): string {
    if (edits.length === 0) {
      return content;
    }

    // 將內容分割成行（保留換行符）
    const lines = this.splitLines(content);

    // 按位置從後往前排序（避免位置偏移）
    const sortedEdits = [...edits].sort((a, b) => {
      // 先比較行號
      if (a.range.start.line !== b.range.start.line) {
        return b.range.start.line - a.range.start.line; // 從後往前
      }
      // 同行則比較列號
      return b.range.start.column - a.range.start.column;
    });

    // 依序應用編輯
    for (const edit of sortedEdits) {
      const { range, newText } = edit;

      // 計算起始和結束偏移
      const startOffset = this.calculateOffset(lines, range.start.line, range.start.column);
      const endOffset = this.calculateOffset(lines, range.end.line, range.end.column);

      // 重新組合內容（使用 join 重建原始字串）
      const fullContent = lines.join('');

      // 替換指定範圍
      const before = fullContent.substring(0, startOffset);
      const after = fullContent.substring(endOffset);

      // 更新行陣列
      const newFullContent = before + newText + after;
      lines.length = 0;
      lines.push(...this.splitLines(newFullContent));
    }

    return lines.join('');
  }

  /**
   * 分割內容為行（保留換行符）
   * @param content 原始內容
   * @returns 行陣列
   */
  private splitLines(content: string): string[] {
    const result: string[] = [];
    let current = '';

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      current += char;

      if (char === '\n') {
        result.push(current);
        current = '';
      }
    }

    // 處理最後一行（可能沒有換行符）
    if (current.length > 0) {
      result.push(current);
    }

    return result;
  }

  /**
   * 計算指定位置的字元偏移量
   * @param lines 行陣列
   * @param line 行號（1-based，從 1 開始）
   * @param column 列號（1-based，從 1 開始）
   * @returns 字元偏移量
   * @throws Error 當行號或列號無效時
   */
  private calculateOffset(lines: string[], line: number, column: number): number {
    // 驗證參數
    if (line < 1) {
      throw new Error(`無效的行號: ${line}，行號必須 >= 1（1-based 索引）`);
    }
    if (column < 1) {
      throw new Error(`無效的列號: ${column}，列號必須 >= 1（1-based 索引）`);
    }

    let offset = 0;

    // 累加前面所有行的長度
    for (let i = 0; i < line - 1 && i < lines.length; i++) {
      offset += lines[i].length;
    }

    // 加上當前行的列偏移
    offset += column - 1;

    return offset;
  }

  /**
   * 應用檔案操作
   * @param operation 檔案操作
   * @param atomic 是否使用原子寫入
   */
  private async applyFileOperation(
    operation: FileOperation,
    atomic: boolean
  ): Promise<void> {
    switch (operation.type) {
      case 'create':
        if (!operation.targetPath) {
          throw new Error('CREATE 操作需要 targetPath');
        }
        await this.fileSystem.writeFile(
          operation.targetPath,
          operation.content ?? '',
          { fsync: atomic }
        );
        break;

      case 'delete':
        await this.fileSystem.deleteFile(operation.sourcePath);
        break;

      case 'move':
        if (!operation.targetPath) {
          throw new Error('MOVE 操作需要 targetPath');
        }
        // 檢查是目錄還是檔案
        const isDir = await this.fileSystem.isDirectory(operation.sourcePath);
        if (isDir) {
          await this.moveDirectory(operation.sourcePath, operation.targetPath);
        } else {
          await this.fileSystem.moveFile(operation.sourcePath, operation.targetPath);
        }
        break;
    }
  }

  /**
   * 遞迴移動目錄
   * @param source 來源目錄
   * @param target 目標目錄
   */
  private async moveDirectory(source: string, target: string): Promise<void> {
    // 建立目標目錄
    await this.fileSystem.createDirectory(target);

    // 讀取源目錄內容
    const entries = await this.fileSystem.readDirectory(source);

    for (const entry of entries) {
      const sourcePath = entry.path;
      // 使用 path 模組計算相對路徑
      const relativePath = sourcePath.slice(source.length);
      const targetPath = target + relativePath;

      if (entry.isDirectory) {
        // 遞迴處理子目錄
        await this.moveDirectory(sourcePath, targetPath);
      } else if (entry.isFile) {
        // 移動檔案
        await this.fileSystem.moveFile(sourcePath, targetPath);
      }
    }

    // 刪除原目錄
    await this.fileSystem.deleteDirectory(source);
  }

  /**
   * 回滾所有變更
   * 反向遍歷備份，恢復原始狀態
   * @param backups 備份列表
   * @returns 回滾過程中發生的錯誤列表
   */
  private async rollback(backups: readonly BackupEntry[]): Promise<readonly string[]> {
    const rollbackErrors: string[] = [];

    // 反向遍歷備份
    for (let i = backups.length - 1; i >= 0; i--) {
      const backup = backups[i];

      try {
        switch (backup.type) {
          case 'text':
          case 'delete':
            // 恢復原始內容
            if (backup.originalContent !== null) {
              await this.fileSystem.writeFile(backup.filePath, backup.originalContent);
            }
            break;

          case 'create': {
            // 刪除新建的檔案
            const exists = await this.fileSystem.exists(backup.filePath);
            if (exists) {
              await this.fileSystem.deleteFile(backup.filePath);
            }
            break;
          }

          case 'move': {
            // 將檔案移回原位置
            if (backup.targetPath && backup.originalContent !== null) {
              // 刪除目標位置的檔案
              const targetExists = await this.fileSystem.exists(backup.targetPath);
              if (targetExists) {
                await this.fileSystem.deleteFile(backup.targetPath);
              }

              // 恢復原始位置的檔案
              await this.fileSystem.writeFile(backup.filePath, backup.originalContent);
            }
            break;
          }
        }
      } catch (error) {
        // 回滾時發生錯誤，收集錯誤並繼續處理其他項目
        const message = error instanceof Error ? error.message : String(error);
        rollbackErrors.push(`回滾失敗 [${backup.filePath}]: ${message}`);
      }
    }

    return rollbackErrors;
  }
}
