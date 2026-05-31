/**
 * Worker Pool 型別定義
 * 提供跨執行緒可序列化的任務和結果型別
 */

import type { Symbol, Dependency } from '@shared/types/index.js';

/**
 * Parser 任務（傳送給 Worker）
 * 所有欄位必須可序列化
 */
export interface ParseTask {
  /** 檔案路徑 */
  filePath: string;
  /** 檔案內容（主執行緒預讀） */
  content: string;
  /** 額外 Parser 模組路徑，worker 會在解析前載入 */
  parserModulePaths?: readonly string[];
}

/**
 * Parser 結果（Worker 回傳）
 * Symbol 和 Dependency 都是純 Object，可直接序列化
 */
export interface ParseResult {
  /** 檔案路徑 */
  filePath: string;
  /** 提取的符號列表 */
  symbols: Symbol[];
  /** 依賴的模組列表 */
  dependencies: Dependency[];
  /** 解析錯誤訊息 */
  errors: string[];
}

/**
 * Worker Pool 配置選項
 */
export interface WorkerPoolOptions {
  /** 最大執行緒數（預設：CPU 核心數 - 1） */
  maxThreads?: number;
  /** 最小執行緒數（預設：1） */
  minThreads?: number;
  /** 額外 Parser 模組路徑，會套用到所有任務 */
  parserModulePaths?: readonly string[];
}
