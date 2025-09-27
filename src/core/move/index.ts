/**
 * Move 模組入口點
 * 提供檔案和目錄移動功能，自動更新 import/export 路徑
 */

// 核心服務
export { MoveService } from './move-service.js';
export { ImportResolver } from './import-resolver.js';

// 型別定義
export type {
  // 基本型別
  MoveOperation,
  MoveOptions,
  MoveResult,
  PathUpdate,

  // 完整移動操作
  FullMoveOperation,

  // 批次操作
  BatchMoveResult,

  // 預覽和影響分析
  MovePreview,
  MoveImpact,
  PathConflict,

  // Import 相關
  ImportUpdate,
  ImportUpdatePreview,
  ImportStatement,

  // 驗證相關
  ValidationResult,
  ValidationError,
  ValidationWarning,

  // 錯誤處理
  MoveError,
  RollbackInfo,
  RollbackOperation,

  // 配置
  PathUpdateConfig,
  MoveEngineConfig,
  ImportResolverConfig,

  // 進度追蹤
  MoveProgress,
  PathCalculation
} from './types.js';

// 列舉
export {
  MoveOperationType,
  MoveStatus,
  PathType
} from './types.js';

// 工具函式
export {
  createFullMoveOperation,
  createValidationError,
  createMoveError,
  isFullMoveOperation,
  isImportStatement
} from './types.js';