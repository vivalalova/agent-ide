/**
 * Dead Code 模組
 * 檢測未使用的程式碼
 */

export { DeadCodeDetector, createDeadCodeDetector } from './dead-code-detector.js';
export type {
  DeadCodeItem,
  DeadCodeDetectorOptions,
  DeadCodeDetectionResult,
  DeadCodeStats
} from './types.js';
export { DEFAULT_DEAD_CODE_OPTIONS } from './types.js';
