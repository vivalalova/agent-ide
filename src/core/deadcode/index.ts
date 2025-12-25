/**
 * Dead Code 模組
 * 檢測與刪除未使用的程式碼
 */

export { DeadCodeDetector, createDeadCodeDetector } from './dead-code-detector.js';
export { DeadCodeRemover, createDeadCodeRemover } from './dead-code-remover.js';
export { DeadCodeCacheService, createDeadCodeCacheService } from './shared-cache.js';
export type {
  DeadCodeItem,
  DeadCodeDetectorOptions,
  DeadCodeDetectionResult,
  DeadCodeStats,
  DeadCodeRemovalOptions,
  DeadCodeRemovalPreview,
  DeadCodeRemovalResult,
  RemovalOperation,
  ImportCleanupOperation,
  RemovalSummary,
  UpdatedFile
} from './types.js';
export { DEFAULT_DEAD_CODE_OPTIONS, DEFAULT_REMOVAL_OPTIONS } from './types.js';
