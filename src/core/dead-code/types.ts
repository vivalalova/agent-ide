/**
 * Dead Code 檢測型別定義
 */

import type { Location } from '@shared/types/core.js';
import { SymbolType } from '@shared/types/symbol.js';

/**
 * Dead Code 項目
 */
export interface DeadCodeItem {
  /** 符號名稱 */
  readonly name: string;
  /** 符號類型 */
  readonly type: SymbolType;
  /** 位置資訊 */
  readonly location: Location;
  /** 信心程度（0-1） */
  readonly confidence: number;
  /** 原因說明 */
  readonly reason: string;
}

/**
 * Dead Code 檢測選項
 */
export interface DeadCodeDetectorOptions {
  /** 是否包含 export 的符號（預設排除） */
  readonly includeExports?: boolean;
  /** 排除的符號名稱模式 */
  readonly excludePatterns?: readonly string[];
  /** 最小信心程度門檻（0-1） */
  readonly minConfidence?: number;
  /** 要檢測的符號類型 */
  readonly symbolTypes?: readonly SymbolType[];
}

/**
 * Dead Code 檢測結果
 */
export interface DeadCodeDetectionResult {
  /** 是否成功 */
  readonly success: boolean;
  /** Dead code 項目列表 */
  readonly items: readonly DeadCodeItem[];
  /** 統計資訊 */
  readonly stats: DeadCodeStats;
  /** 錯誤訊息（如果有） */
  readonly error?: string;
}

/**
 * Dead Code 統計資訊
 */
export interface DeadCodeStats {
  /** 總共掃描的符號數 */
  readonly totalSymbols: number;
  /** Dead code 數量 */
  readonly deadCodeCount: number;
  /** 按類型統計 */
  readonly byType: Record<string, number>;
  /** 影響的檔案數 */
  readonly filesAffected: number;
  /** 掃描耗時（毫秒） */
  readonly scanTime: number;
  /** 跳過的檔案數（解析失敗） */
  readonly skippedFiles: number;
}

/**
 * 預設選項
 */
export const DEFAULT_DEAD_CODE_OPTIONS: Required<DeadCodeDetectorOptions> = {
  includeExports: false,
  excludePatterns: ['main', 'index', 'App', 'setup', 'init', 'configure'],
  minConfidence: 0.8,
  symbolTypes: [
    SymbolType.Function,
    SymbolType.Class,
    SymbolType.Variable,
    SymbolType.Interface,
    SymbolType.Type
  ]
};
