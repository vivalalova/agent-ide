/**
 * History 模組 - 變更歷史記錄管理
 */

export { HistoryManager, restoreBackupsFromHistory } from './history-manager.js';
export type {
  HistoryEntry,
  PersistentBackupEntry,
  HistoryManagerOptions,
  UndoResult,
  HistoryListResult,
  CleanupResult
} from './types.js';
export { HISTORY_DEFAULTS } from './types.js';
