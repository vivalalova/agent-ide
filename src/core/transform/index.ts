/**
 * Transform 模組統一匯出
 * 整合 rename/move/shift/refactor 為統一的程式碼變換框架
 */

// 共用型別
export {
  // Enum
  TransformCategory,
  TransformType,
  TransformErrorCode,
  TransformWarningCode,

  // Interface
  type TransformValidation,
  type TransformError,
  type TransformWarning,
  type TransformPreview,
  type TransformSummary,
  type TransformResult,
  type FileChange,
  type TextChange,
  type TransformOperation,

  // Class
  BaseTransformExecutor,

  // Type Guard
  isTextChange,
  isFileChange,
  isTransformResult
} from './types.js';

// 共享元件（排除與 symbol/rename 衝突的型別）
export {
  CodeEditor,
  createCodeEditor,
  type PreviewedChange,
  SymbolFinder,
  createSymbolFinder,
  SymbolReferenceType,
  ClassMemberType,
  type CallSite,
  type CallSiteArgument,
  type ClassMember,
  type SymbolDefinition
} from './shared/index.js';

// 符號變換
export * from './symbol/index.js';

// 結構變換
export * from './structure/index.js';

// 位置變換
export * from './location/index.js';
