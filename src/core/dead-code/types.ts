/**
 * Dead Code 檢測型別定義
 */

import type { Location, Range } from '@shared/types/core.js';
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
 * 預設排除的符號名稱
 *
 * 只排除 `main`：程式進入點通常不會被其他模組引用，但為必要符號。
 * 其他如 `index`、`App`、`setup`、`init`、`configure` 等應由使用者根據專案特性自行配置，
 * 以避免過度排除導致漏報真正未使用的程式碼。
 */
const DEFAULT_EXCLUDE_PATTERNS: readonly string[] = ['main'];

/**
 * 預設選項
 *
 * 信心度門檻設計考量：
 * - 檢測用 0.8：較寬鬆，報告更多潛在問題供開發者檢視判斷
 * - 刪除用 0.9（見 DEFAULT_REMOVAL_OPTIONS）：較嚴格，避免誤刪正常程式碼
 */
export const DEFAULT_DEAD_CODE_OPTIONS: Required<DeadCodeDetectorOptions> = {
  includeExports: false,
  excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
  minConfidence: 0.8,
  symbolTypes: [
    SymbolType.Function,
    SymbolType.Class,
    SymbolType.Variable,
    SymbolType.Interface,
    SymbolType.Type
  ]
};

// ============================================================================
// Dead Code 刪除相關型別
// ============================================================================

/**
 * Dead Code 刪除選項
 */
export interface DeadCodeRemovalOptions {
  /** 最小信心度門檻（0-1），預設 0.9 */
  readonly minConfidence?: number;
  /** 排除的檔案模式 */
  readonly excludeFiles?: readonly string[];
  /** 排除的符號名稱 */
  readonly excludeSymbols?: readonly string[];
  /** 是否清理變成未使用的 import */
  readonly cleanupImports?: boolean;
}

/**
 * 單一刪除操作
 */
export interface RemovalOperation {
  /** 檔案路徑 */
  readonly filePath: string;
  /** 刪除範圍 */
  readonly range: Range;
  /** 原始程式碼 */
  readonly originalCode: string;
  /** 符號名稱 */
  readonly symbolName: string;
  /** 符號類型 */
  readonly symbolType: SymbolType;
  /** 信心程度 */
  readonly confidence: number;
}

/**
 * Import 清理操作
 */
export interface ImportCleanupOperation {
  /** 檔案路徑 */
  readonly filePath: string;
  /** 刪除範圍 */
  readonly range: Range;
  /** 原始 import 語句 */
  readonly originalImport: string;
  /** 變成未使用的符號（可能有多個） */
  readonly unusedSymbols: readonly string[];
  /** 清理類型：delete=刪除整行, partial=部分清理 */
  readonly cleanupType: 'delete' | 'partial';
  /** 部分清理時的新 import 語句 */
  readonly newImport?: string;
}

/**
 * 刪除統計摘要
 */
export interface RemovalSummary {
  /** 總刪除數 */
  readonly totalRemovals: number;
  /** 按類型統計 */
  readonly byType: Record<string, number>;
  /** 影響檔案數 */
  readonly filesAffected: number;
  /** 刪除程式碼行數 */
  readonly linesRemoved: number;
  /** Import 清理數 */
  readonly importsCleanedUp: number;
}

/**
 * Dead Code 刪除預覽結果
 */
export interface DeadCodeRemovalPreview {
  /** 是否成功 */
  readonly success: boolean;
  /** 刪除操作列表 */
  readonly removals: readonly RemovalOperation[];
  /** Import 清理操作 */
  readonly importCleanups: readonly ImportCleanupOperation[];
  /** 影響的檔案 */
  readonly affectedFiles: readonly string[];
  /** 統計摘要 */
  readonly summary: RemovalSummary;
  /** 警告（低信心或被排除） */
  readonly warnings?: readonly string[];
  /** 錯誤 */
  readonly errors?: readonly string[];
}

/**
 * 已更新的檔案
 */
export interface UpdatedFile {
  /** 檔案路徑 */
  readonly filePath: string;
  /** 刪除的符號數 */
  readonly removedSymbols: number;
  /** 清理的 import 數 */
  readonly cleanedImports: number;
}

/**
 * Dead Code 刪除結果
 */
export interface DeadCodeRemovalResult {
  /** 是否成功 */
  readonly success: boolean;
  /** 已更新的檔案 */
  readonly updatedFiles: readonly UpdatedFile[];
  /** 統計摘要 */
  readonly summary: RemovalSummary;
  /** 錯誤 */
  readonly errors?: readonly string[];
}

/**
 * 預設排除的符號名稱（刪除操作用）
 *
 * 只排除 `main`：程式進入點通常不會被其他模組引用，但為必要符號。
 * 其他如 `index`、`App`、`setup`、`init`、`configure` 等應由使用者根據專案特性自行配置，
 * 以避免過度排除導致漏報真正未使用的程式碼。
 */
const DEFAULT_EXCLUDE_SYMBOLS: readonly string[] = ['main'];

/**
 * 刪除選項預設值
 *
 * 信心度門檻設計考量：
 * - 刪除用 0.9：較嚴格，避免誤刪正常程式碼
 * - 檢測用 0.8（見 DEFAULT_DEAD_CODE_OPTIONS）：較寬鬆，報告更多潛在問題供開發者檢視判斷
 */
export const DEFAULT_REMOVAL_OPTIONS: Required<DeadCodeRemovalOptions> = {
  minConfidence: 0.9,
  excludeFiles: [],
  excludeSymbols: DEFAULT_EXCLUDE_SYMBOLS,
  cleanupImports: true
};
