/**
 * Undo 模組型別定義
 */

import type { HistoryEntry } from '@infrastructure/history/index.js';
import type { Changeset } from '@infrastructure/changeset/types.js';

/**
 * Undo 選項
 */
export interface UndoOptions {
  /** 專案根目錄 */
  readonly projectPath: string;
  /** 要還原的歷史記錄 ID（可選，預設為最新一筆） */
  readonly entryId?: string;
}

/**
 * Undo 結果
 */
export interface UndoResult {
  /** 是否成功 */
  readonly success: boolean;
  /** 生成的 Changeset */
  readonly changeset?: Changeset;
  /** 還原的歷史記錄 */
  readonly entry?: HistoryEntry;
  /** 錯誤訊息 */
  readonly error?: string;
}
