/**
 * Rename 子模組
 * 符號重命名功能
 */

export { RenameEngine } from './rename-engine.js';
export { ScopeAnalyzer } from './scope-analyzer.js';
export { ReferenceUpdater } from './reference-updater.js';

export {
  // 型別介面
  type RenameOptions,
  type RenameResult,
  type RenameOperation,
  type RenamePreview,
  type ValidationResult,
  type BatchRenameResult,
  type ConflictInfo,
  type RenameSummary,
  type ScopeAnalysisResult,
  type ShadowedVariable,
  type ShadowInfo,
  type UpdateResult,
  type UpdatedFile,
  type TextChange,
  type SymbolReference,

  // Enum
  ConflictType,

  // 工廠函式
  createRenameOptions,
  createRenameOperation,
  createConflictInfo,

  // 型別守衛
  isRenameOptions
} from './types.js';
