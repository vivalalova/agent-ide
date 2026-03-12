/**
 * Change Applier
 * 負責執行變更（寫入檔案）
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ReferenceUpdate, FileChange, TargetFileChange } from './types.js';

/**
 * Change Applier
 * 負責將準備好的變更寫入檔案系統
 */
export class ChangeApplier {
  constructor(private readonly fileSystem: IFileSystem) {}

  /**
   * 執行變更
   */
  async applyChanges(
    sourceFileChange: FileChange,
    targetFileChange: TargetFileChange,
    referenceUpdates: readonly ReferenceUpdate[]
  ): Promise<void> {
    // 確保目標目錄存在
    if (targetFileChange.isNewFile) {
      const targetDir = path.dirname(targetFileChange.filePath);
      await this.fileSystem.createDirectory(targetDir, true);
    }

    // 寫入來源檔案
    await this.fileSystem.writeFile(sourceFileChange.filePath, sourceFileChange.newCode);

    // 寫入目標檔案
    await this.fileSystem.writeFile(targetFileChange.filePath, targetFileChange.newCode);

    // 更新引用
    for (const update of referenceUpdates) {
      const content = await this.readFile(update.filePath);
      if (!content) {continue;}

      const newContent = content.replace(update.originalImport, update.newImport);
      await this.fileSystem.writeFile(update.filePath, newContent);
    }
  }

  /**
   * 讀取檔案內容
   */
  private async readFile(filePath: string): Promise<string | null> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      return typeof content === 'string' ? content : content.toString('utf-8');
    } catch (error) {
      console.warn(`[move-member] Failed to read file ${filePath}:`, error);
      return null;
    }
  }
}
