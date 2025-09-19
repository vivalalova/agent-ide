/**
 * 重新命名模組匯出
 * 統一匯出重新命名相關的類別和型別
 */

export { RenameEngine } from './rename-engine';
export { ScopeAnalyzer } from './scope-analyzer';
export { ReferenceUpdater } from './reference-updater';

export {
  // 型別介面
  RenameOptions,
  RenameResult,
  RenameOperation,
  RenamePreview,
  ValidationResult,
  BatchRenameResult,
  ConflictInfo,
  ConflictType,
  RenameSummary,
  ScopeAnalysisResult,
  ShadowedVariable,
  ShadowInfo,
  UpdateResult,
  UpdatedFile,
  TextChange,
  SymbolReference,

  // 工廠函式
  createRenameOptions,
  createRenameOperation,
  createConflictInfo,

  // 型別守衛
  isRenameOptions
} from './types';