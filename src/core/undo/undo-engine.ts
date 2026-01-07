/**
 * UndoEngine - 從歷史記錄產生反向 Changeset
 */

import {
  HistoryManager,
  restoreBackupsFromHistory,
  type HistoryEntry
} from '@infrastructure/history/index.js';
import {
  BackupType,
  ChangesetCommand,
  FileOperationType,
  type Changeset,
  type FileTextChange,
  type FileOperation,
  type BackupEntry
} from '@infrastructure/changeset/types.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { UndoOptions, UndoResult } from './types.js';

/**
 * Undo 引擎
 * 將歷史記錄轉換為反向的 Changeset
 */
export class UndoEngine {
  constructor(
    private readonly fileSystem: IFileSystem
  ) {}

  /**
   * 從歷史記錄生成反向 Changeset
   */
  async generateUndoChangeset(options: UndoOptions): Promise<UndoResult> {
    const { projectPath, entryId } = options;

    // 1. 取得歷史管理器
    const historyManager = new HistoryManager({ projectPath });

    // 2. 取得要還原的歷史記錄
    let entry: HistoryEntry | null;
    if (entryId) {
      entry = await historyManager.getEntryById(entryId);
      if (!entry) {
        return {
          success: false,
          error: `找不到歷史記錄 ID: ${entryId}`
        };
      }
    } else {
      entry = await historyManager.getLatestEntry();
      if (!entry) {
        return {
          success: false,
          error: '沒有可還原的變更'
        };
      }
    }

    // 3. 還原備份內容（base64 解碼）
    const backups = restoreBackupsFromHistory(entry);

    // 4. 生成反向 Changeset
    const changeset = await this.createReverseChangeset(entry, backups);

    return {
      success: true,
      changeset,
      entry
    };
  }

  /**
   * 刪除已還原的歷史記錄
   */
  async deleteHistoryEntry(projectPath: string, entryId: string): Promise<boolean> {
    const historyManager = new HistoryManager({ projectPath });
    return historyManager.deleteEntry(entryId);
  }

  /**
   * 建立反向 Changeset
   */
  private async createReverseChangeset(
    entry: HistoryEntry,
    backups: BackupEntry[]
  ): Promise<Changeset> {
    const textChanges: FileTextChange[] = [];
    const fileOperations: FileOperation[] = [];

    for (const backup of backups) {
      switch (backup.type) {
        case BackupType.Text:
          // 文字備份：需要讀取當前內容並與備份比較
          if (backup.originalContent !== null) {
            const textChange = await this.createTextRestore(backup);
            if (textChange) {
              textChanges.push(textChange);
            }
          }
          break;

        case BackupType.Create:
          // 新建檔案的備份：還原時要刪除
          fileOperations.push({
            type: FileOperationType.Delete,
            sourcePath: backup.filePath
          });
          break;

        case BackupType.Delete:
          // 刪除檔案的備份：還原時要重新建立
          if (backup.originalContent !== null) {
            fileOperations.push({
              type: FileOperationType.Create,
              sourcePath: backup.filePath,
              targetPath: backup.filePath,
              content: backup.originalContent
            });
          }
          break;

        case BackupType.Move:
          // 移動檔案的備份：還原時要移回原位置
          if (backup.targetPath) {
            // 如果有原始內容，表示是檔案移動
            if (backup.originalContent !== null) {
              // 刪除目標位置的檔案
              fileOperations.push({
                type: FileOperationType.Delete,
                sourcePath: backup.targetPath
              });
              // 在原位置重新建立檔案
              fileOperations.push({
                type: FileOperationType.Create,
                sourcePath: backup.filePath,
                targetPath: backup.filePath,
                content: backup.originalContent
              });
            } else {
              // 目錄移動：把目錄移回原位置
              fileOperations.push({
                type: FileOperationType.Move,
                sourcePath: backup.targetPath,
                targetPath: backup.filePath
              });
            }
          }
          break;
      }
    }

    return {
      textChanges,
      fileOperations,
      description: `還原: ${entry.description}`,
      command: ChangesetCommand.Rename, // 使用 Rename 作為 undo 的命令類型
      success: true
    };
  }

  /**
   * 建立文字還原變更
   * 讀取當前檔案內容，生成完整替換的 TextChange
   */
  private async createTextRestore(backup: BackupEntry): Promise<FileTextChange | null> {
    try {
      // 檢查檔案是否存在
      const exists = await this.fileSystem.exists(backup.filePath);
      if (!exists) {
        // 檔案不存在，需要重新建立
        // 這種情況應該用 FileOperation.Create 處理
        return null;
      }

      // 讀取當前內容
      const currentContent = await this.fileSystem.readFile(backup.filePath, 'utf-8') as string;

      // 如果原始內容為 null（新建的檔案），無法透過 TextChange 還原
      if (backup.originalContent === null) {
        return null;
      }

      // 如果內容相同，不需要變更
      if (currentContent === backup.originalContent) {
        return null;
      }

      // 計算行數
      const lines = currentContent.split('\n');
      const lineCount = lines.length;

      // 生成完整檔案替換的 TextChange
      return {
        filePath: backup.filePath,
        edits: [{
          range: {
            start: { line: 1, column: 1 },
            end: { line: lineCount, column: (lines[lineCount - 1]?.length ?? 0) + 1 }
          },
          newText: backup.originalContent,
          description: '還原檔案內容'
        }]
      };
    } catch {
      // 發生錯誤時跳過此檔案
      return null;
    }
  }
}
