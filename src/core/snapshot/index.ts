/**
 * Snapshot 模組統一匯出
 * 提供程式碼快照生成、壓縮、增量更新等功能
 */

import { SnapshotEngine as SnapshotEngineClass } from './snapshot-engine.js';
import { ConfigManager as ConfigManagerClass } from './config.js';

// 核心類別
export { SnapshotEngine } from './snapshot-engine.js';
export { CodeCompressor } from './code-compressor.js';
export { SnapshotDiffer } from './snapshot-differ.js';
export { ConfigManager } from './config.js';

// 型別定義
export type {
  Snapshot,
  SnapshotOptions,
  SnapshotStats,
  SnapshotDiff,
  ModuleSummary,
  CompressedSymbol,
  CompressedCode,
  QualityMetrics,
  FileChange
} from './types.js';
export { CompressionLevel, FileChangeType } from './types.js';
export type { ProjectConfig, ProjectConfig as SnapshotConfig } from './config.js';

// 工廠函式和工具函式
export {
  createDefaultSnapshotOptions,
  isSnapshot,
  estimateSnapshotTokens
} from './types.js';

/**
 * 建立快照引擎的便利函式
 */
export function createSnapshotEngine(): SnapshotEngineClass {
  return new SnapshotEngineClass();
}

/**
 * 建立配置管理器的便利函式
 */
export function createConfigManager(): ConfigManagerClass {
  return new ConfigManagerClass();
}
