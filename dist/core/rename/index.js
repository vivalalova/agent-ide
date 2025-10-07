/**
 * 重新命名模組匯出
 * 統一匯出重新命名相關的類別和型別
 */
export { RenameEngine } from './rename-engine.js';
export { ScopeAnalyzer } from './scope-analyzer.js';
export { ReferenceUpdater } from './reference-updater.js';
export { ConflictType, 
// 工廠函式
createRenameOptions, createRenameOperation, createConflictInfo, 
// 型別守衛
isRenameOptions } from './types.js';
//# sourceMappingURL=index.js.map