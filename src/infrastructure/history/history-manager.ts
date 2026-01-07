/**
 * HistoryManager - 變更歷史記錄管理器
 * 負責儲存、讀取和清理變更歷史，支援 undo 功能
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

import type { BackupEntry, Changeset } from '@infrastructure/changeset/types.js';
import type {
  HistoryEntry,
  HistoryManagerOptions,
  PersistentBackupEntry,
  HistoryListResult,
  CleanupResult
} from './types.js';
import { HISTORY_DEFAULTS } from './types.js';

/**
 * 歷史記錄管理器
 */
export class HistoryManager {
  private readonly historyDir: string;
  private readonly projectHash: string;
  private readonly projectPath: string;
  private readonly maxEntries: number;
  private readonly maxAgeDays: number;

  constructor(options: HistoryManagerOptions) {
    this.projectPath = path.resolve(options.projectPath);
    this.projectHash = this.computeProjectHash(this.projectPath);
    this.historyDir = path.join(
      os.homedir(),
      '.config',
      'agent-ide',
      HISTORY_DEFAULTS.HISTORY_DIR,
      this.projectHash
    );
    this.maxEntries = options.maxEntries ?? HISTORY_DEFAULTS.MAX_ENTRIES;
    this.maxAgeDays = options.maxAgeDays ?? HISTORY_DEFAULTS.MAX_AGE_DAYS;
  }

  /**
   * 儲存變更前的狀態到歷史記錄
   *
   * @param changeset - 執行的 Changeset
   * @param backups - 備份項目列表（來自 ChangeApplicator）
   * @returns 歷史記錄 ID
   */
  async saveBeforeChange(
    changeset: Changeset,
    backups: readonly BackupEntry[]
  ): Promise<string> {
    // 確保目錄存在
    await this.ensureHistoryDir();

    // 建立歷史記錄項目
    const entry: HistoryEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      command: changeset.command,
      description: changeset.description,
      projectPath: this.projectPath,
      backups: this.convertBackups(backups)
    };

    // 產生檔案名稱
    const fileName = this.generateFileName(entry);
    const filePath = path.join(this.historyDir, fileName);

    // 寫入檔案
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');

    // 清理過期項目
    await this.cleanup();

    return entry.id;
  }

  /**
   * 取得歷史記錄列表
   */
  async listHistory(): Promise<HistoryListResult> {
    try {
      await this.ensureHistoryDir();
      const files = await fs.readdir(this.historyDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const entries: HistoryEntry[] = [];
      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(this.historyDir, file), 'utf-8');
          const entry = JSON.parse(content) as HistoryEntry;
          entries.push(entry);
        } catch {
          // 跳過損壞的檔案
        }
      }

      // 按時間倒序排列（最新在前）
      entries.sort((a, b) => b.timestamp - a.timestamp);

      return {
        entries,
        total: entries.length
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { entries: [], total: 0 };
      }
      throw error;
    }
  }

  /**
   * 取得最近一筆歷史記錄
   */
  async getLatestEntry(): Promise<HistoryEntry | null> {
    const { entries } = await this.listHistory();
    return entries[0] ?? null;
  }

  /**
   * 根據 ID 取得歷史記錄
   * 支援完整 ID 或前綴匹配（至少 8 字元）
   */
  async getEntryById(id: string): Promise<HistoryEntry | null> {
    const { entries } = await this.listHistory();
    // 優先完整匹配
    const exactMatch = entries.find(e => e.id === id);
    if (exactMatch) {return exactMatch;}

    // 前綴匹配（至少 8 字元）
    if (id.length >= 8) {
      return entries.find(e => e.id.startsWith(id)) ?? null;
    }

    return null;
  }

  /**
   * 刪除歷史記錄
   */
  async deleteEntry(id: string): Promise<boolean> {
    try {
      const files = await fs.readdir(this.historyDir);
      // 使用 ID 的前 8 字元來匹配檔案名稱
      const idPrefix = id.substring(0, 8);
      for (const file of files) {
        if (file.includes(idPrefix) && file.endsWith('.json')) {
          // 確認是正確的檔案
          const filePath = path.join(this.historyDir, file);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const entry = JSON.parse(content) as HistoryEntry;
            if (entry.id === id) {
              await fs.unlink(filePath);
              return true;
            }
          } catch {
            // 忽略無法讀取的檔案
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 清理過期項目
   */
  async cleanup(): Promise<CleanupResult> {
    const { entries } = await this.listHistory();
    const now = Date.now();
    const maxAgeMs = this.maxAgeDays * 24 * 60 * 60 * 1000;

    let removed = 0;

    // 1. 刪除過期項目
    const expiredEntries = entries.filter(e => (now - e.timestamp) > maxAgeMs);
    for (const entry of expiredEntries) {
      if (await this.deleteEntry(entry.id)) {
        removed++;
      }
    }

    // 2. 重新取得列表（排除已刪除的）
    const currentEntries = entries.filter(e => (now - e.timestamp) <= maxAgeMs);

    // 3. 刪除超過數量限制的項目（保留最新的）
    if (currentEntries.length > this.maxEntries) {
      const toRemove = currentEntries.slice(this.maxEntries);
      for (const entry of toRemove) {
        if (await this.deleteEntry(entry.id)) {
          removed++;
        }
      }
    }

    return {
      removed,
      kept: entries.length - removed
    };
  }

  /**
   * 清空所有歷史記錄
   */
  async clearAll(): Promise<number> {
    const { entries } = await this.listHistory();
    let removed = 0;

    for (const entry of entries) {
      if (await this.deleteEntry(entry.id)) {
        removed++;
      }
    }

    return removed;
  }

  /**
   * 將 BackupEntry 轉換為 PersistentBackupEntry
   */
  private convertBackups(backups: readonly BackupEntry[]): PersistentBackupEntry[] {
    return backups.map(backup => ({
      filePath: backup.filePath,
      // 將內容轉換為 base64（支援二進位）
      originalContent: backup.originalContent !== null
        ? Buffer.from(backup.originalContent).toString('base64')
        : null,
      type: backup.type,
      targetPath: backup.targetPath
    }));
  }

  /**
   * 將 PersistentBackupEntry 轉換為 BackupEntry
   */
  static restoreBackups(backups: readonly PersistentBackupEntry[]): BackupEntry[] {
    return backups.map(backup => ({
      filePath: backup.filePath,
      // 將 base64 轉換回內容
      originalContent: backup.originalContent !== null
        ? Buffer.from(backup.originalContent, 'base64').toString('utf-8')
        : null,
      type: backup.type,
      targetPath: backup.targetPath
    }));
  }

  /**
   * 計算專案路徑的 hash
   */
  private computeProjectHash(projectPath: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(projectPath);
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * 產生唯一 ID
   */
  private generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * 產生檔案名稱
   */
  private generateFileName(entry: HistoryEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString().replace(/[:.]/g, '-');
    return `${timestamp}-${entry.command}-${entry.id.substring(0, 8)}.json`;
  }

  /**
   * 確保歷史目錄存在
   */
  private async ensureHistoryDir(): Promise<void> {
    try {
      await fs.mkdir(this.historyDir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }
}

/**
 * 將 HistoryEntry 的 backups 轉換回 BackupEntry 格式（用於 undo）
 */
export function restoreBackupsFromHistory(entry: HistoryEntry): BackupEntry[] {
  return HistoryManager.restoreBackups(entry.backups);
}
