/**
 * Move File 子模組
 * 檔案移動 + import 路徑自動更新
 */

// 核心服務
export { MoveEngine, MoveOperationError } from './move-engine.js';
export { ImportResolver } from './import-resolver.js';

// 內部模組（供進階使用）
export { PathUtils, ALLOWED_EXTENSIONS, EXCLUDE_PATTERNS } from './path-utils.js';
export { FileScanner } from './file-scanner.js';
export {
  createGlobMovePlan,
  getGlobBaseDir,
  isGlobPattern,
  resolveGlobPattern
} from './glob-move-planner.js';
export { PathCalculator } from './path-calculator.js';

export type {
  GlobMovedFile,
  GlobMovePlan,
  GlobMovePlanInput
} from './glob-move-planner.js';

// 型別定義
export type {
  // 基本型別
  MoveInput,
  MoveOptions,
  MoveResult,
  PathUpdate,

  // 內部移動操作
  InternalMoveOperation,

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
  createInternalMoveOperation,
  createValidationError,
  createMoveError,
  isInternalMoveOperation,
  isImportStatement
} from './types.js';
