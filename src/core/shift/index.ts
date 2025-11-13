/**
 * Shift 模組統一匯出點
 */

// 核心服務類別
export { ShiftService } from './shift-service.js';
export { LineExtractor } from './line-extractor.js';
export { FileGenerator } from './file-generator.js';

// 型別定義
export type {
  ShiftOptions,
  ShiftResult,
  FileGenerationResult,
  LineExtractionResult,
  LineInsertionResult,
  ShiftValidationError
} from './types.js';

// 列舉型別
export {
  ShiftStatus,
  ShiftOperationType
} from './types.js';

// 工廠函式
export {
  createShiftResult,
  createShiftValidationError,
  isValidShiftOptions,
  isValidShiftResult
} from './types.js';
