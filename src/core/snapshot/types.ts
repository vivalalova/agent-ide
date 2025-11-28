/**
 * Snapshot 模組型別定義
 * 定義模組快照的結構，供 AI 快速理解程式碼
 */

/**
 * 模組快照結構
 * 包含 API、factories、types、private 資訊
 */
export interface ModuleSnapshot {
  /** 模組路徑 */
  readonly module: string;

  /** 公開 API（class → method → 簽章） */
  readonly api: Record<string, Record<string, string>>;

  /** 工廠函數（createXxx） */
  readonly factories: Record<string, string>;

  /** 型別定義（interface/type） */
  readonly types: Record<string, string>;

  /** 私有資訊（class → fields/imports） */
  readonly private: Record<string, PrivateInfo>;
}

/**
 * 專案快照結構（多模組）
 */
export interface ProjectSnapshot {
  /** 專案名稱 */
  readonly project: string;

  /** 各模組快照 */
  readonly modules: Record<string, ModuleSnapshot>;
}

/**
 * 私有資訊結構
 */
export interface PrivateInfo {
  /** 私有欄位列表 */
  readonly fields: readonly string[];

  /** import 來源 */
  readonly imports: string;
}

/**
 * 快照範圍
 */
export enum SnapshotScope {
  Module = 'module',
  Project = 'project'
}

/**
 * 快照選項
 */
export interface SnapshotOptions {
  /** 目標路徑 */
  readonly path: string;

  /** 輸出格式 */
  readonly format: 'json' | 'summary';
}

/**
 * 快照結果（可能是單一模組或專案）
 */
export type SnapshotResult = ModuleSnapshot | ProjectSnapshot;

/**
 * 型別守衛：是否為 ProjectSnapshot
 */
export function isProjectSnapshot(result: SnapshotResult): result is ProjectSnapshot {
  return 'modules' in result;
}

/**
 * 型別守衛：是否為 ModuleSnapshot
 */
export function isModuleSnapshot(result: SnapshotResult): result is ModuleSnapshot {
  return 'module' in result && !('modules' in result);
}
