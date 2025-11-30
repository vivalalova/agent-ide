/**
 * 位置變換子模組
 * 包含 shift、move-file、move-member 等位置移動功能
 */

export * from './shift/index.js';

// move-file（排除與 symbol/rename 衝突的 ValidationResult）
export {
  MoveService,
  ImportResolver,
  MoveOperationType,
  MoveStatus,
  PathType,
  createFullMoveOperation,
  createValidationError,
  createMoveError,
  isFullMoveOperation,
  isImportStatement,
  type MoveOperation,
  type MoveOptions,
  type MoveResult,
  type PathUpdate,
  type FullMoveOperation,
  type BatchMoveResult,
  type MovePreview,
  type MoveImpact,
  type PathConflict,
  type ImportUpdate,
  type ImportUpdatePreview,
  type ImportStatement,
  type ValidationError as MoveValidationError,
  type ValidationWarning as MoveValidationWarning,
  type MoveError,
  type RollbackInfo,
  type RollbackOperation,
  type PathUpdateConfig,
  type MoveEngineConfig,
  type ImportResolverConfig,
  type MoveProgress,
  type PathCalculation
} from './move-file/index.js';

export * from './move-member/index.js';
