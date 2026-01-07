/**
 * History 型別定義
 * 變更歷史記錄和 Undo 功能
 */

import type { BackupType, ChangesetCommand } from '@infrastructure/changeset/types.js';

/**
 * 持久化備份項目
 */
export interface PersistentBackupEntry {
  /** 檔案路徑 */
  readonly filePath: string;
  /** 原始內容（base64 編碼以支援二進位，null 表示檔案原本不存在） */
  readonly originalContent: string | null;
  /** 備份類型 */
  readonly type: BackupType;
  /** 目標路徑（move 時使用） */
  readonly targetPath?: string;
}

/**
 * 歷史記錄項目
 */
export interface HistoryEntry {
  /** 唯一 ID（UUID） */
  readonly id: string;
  /** 時間戳（毫秒） */
  readonly timestamp: number;
  /** 執行的命令 */
  readonly command: ChangesetCommand;
  /** 命令描述 */
  readonly description: string;
  /** 專案路徑 */
  readonly projectPath: string;
  /** 備份的檔案 */
  readonly backups: readonly PersistentBackupEntry[];
}

/**
 * HistoryManager 選項
 */
export interface HistoryManagerOptions {
  /** 專案根目錄 */
  readonly projectPath: string;
  /** 最大保留筆數，預設 10 */
  readonly maxEntries?: number;
  /** 最大保留天數，預設 7 */
  readonly maxAgeDays?: number;
}

/**
 * Undo 結果
 */
export interface UndoResult {
  /** 是否成功 */
  readonly success: boolean;
  /** 還原的歷史項目 */
  readonly entry?: HistoryEntry;
  /** 還原的檔案清單 */
  readonly restoredFiles?: readonly string[];
  /** 錯誤訊息 */
  readonly error?: string;
}

/**
 * 歷史記錄列表結果
 */
export interface HistoryListResult {
  /** 歷史記錄列表（按時間倒序） */
  readonly entries: readonly HistoryEntry[];
  /** 總筆數 */
  readonly total: number;
}

/**
 * 清理結果
 */
export interface CleanupResult {
  /** 刪除的筆數 */
  readonly removed: number;
  /** 保留的筆數 */
  readonly kept: number;
}

/**
 * 預設設定
 */
export const HISTORY_DEFAULTS = {
  /** 最大保留筆數 */
  MAX_ENTRIES: 10,
  /** 最大保留天數 */
  MAX_AGE_DAYS: 7,
  /** 歷史記錄目錄名稱 */
  HISTORY_DIR: 'history'
} as const;
