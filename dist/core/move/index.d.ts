/**
 * Move 模組入口點
 * 提供檔案和目錄移動功能，自動更新 import/export 路徑
 */
export { MoveService } from './move-service.js';
export { ImportResolver } from './import-resolver.js';
export type { MoveOperation, MoveOptions, MoveResult, PathUpdate, FullMoveOperation, BatchMoveResult, MovePreview, MoveImpact, PathConflict, ImportUpdate, ImportUpdatePreview, ImportStatement, ValidationResult, ValidationError, ValidationWarning, MoveError, RollbackInfo, RollbackOperation, PathUpdateConfig, MoveEngineConfig, ImportResolverConfig, MoveProgress, PathCalculation } from './types.js';
export { MoveOperationType, MoveStatus, PathType } from './types.js';
export { createFullMoveOperation, createValidationError, createMoveError, isFullMoveOperation, isImportStatement } from './types.js';
//# sourceMappingURL=index.d.ts.map