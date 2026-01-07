/**
 * Lock 型別定義
 * 跨 Process 檔案鎖機制
 */

/**
 * 鎖取得選項
 */
export interface LockOptions {
  /** 專案根目錄 */
  readonly projectPath: string;
  /** 執行的命令名稱 */
  readonly command: string;
  /** 輪詢間隔（毫秒），預設 100ms */
  readonly pollInterval?: number;
  /** 最大等待時間（毫秒），預設 60000ms */
  readonly timeout?: number;
  /** Stale 判斷時間（毫秒），預設 300000ms = 5 分鐘 */
  readonly staleTimeout?: number;
}

/**
 * 鎖的持有者資訊
 */
export interface LockInfo {
  /** Process ID */
  readonly pid: number;
  /** 取得鎖的時間戳 */
  readonly acquiredAt: number;
  /** 執行的命令名稱 */
  readonly command: string;
  /** 專案路徑 */
  readonly projectPath: string;
}

/**
 * 鎖取得結果
 */
export interface LockResult {
  /** 是否成功取得鎖 */
  readonly acquired: boolean;
  /** 釋放鎖的函數（僅當 acquired 為 true 時有效） */
  readonly release: () => Promise<void>;
  /** 若無法取得，持有鎖的資訊 */
  readonly holder?: LockInfo;
  /** 是否清理了 stale lock */
  readonly staleLockCleared?: boolean;
}

/**
 * 預設設定
 */
export const LOCK_DEFAULTS = {
  /** 輪詢間隔 100ms */
  POLL_INTERVAL: 100,
  /** 最大等待時間 60 秒 */
  TIMEOUT: 60_000,
  /** Stale 判斷時間 5 分鐘 */
  STALE_TIMEOUT: 300_000,
  /** 鎖檔案目錄名稱 */
  LOCK_DIR: 'locks'
} as const;
