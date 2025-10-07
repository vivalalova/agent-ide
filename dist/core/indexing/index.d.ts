/**
 * 索引模組統一匯出
 * 提供程式碼索引系統的所有核心功能
 */
export { IndexEngine } from './index-engine.js';
export { FileIndex } from './file-index.js';
export { SymbolIndex } from './symbol-index.js';
export { FileWatcher } from './file-watcher.js';
export type { FileInfo, FileIndexEntry, SymbolIndexEntry, IndexConfig, IndexStats, SearchOptions, SymbolSearchResult, FileSearchResult, IndexUpdateEvent, BatchIndexOptions, IndexProgress, IndexStorage, IndexData, StorageStats, IndexQuery } from './types.js';
export { UpdateOperation } from './types.js';
export { createFileInfo, createIndexConfig, createSearchOptions, shouldIndexFile, calculateProgress } from './types.js';
export { isFileInfo, isIndexConfig } from './types.js';
export type { FileChangeType, FileChangeEvent, BatchChangeItem, BatchProcessOptions } from './file-watcher.js';
/**
 * 建立預設的索引引擎實例
 */
export declare function createIndexEngine(workspacePath: string, options?: any): any;
/**
 * 建立帶檔案監控的索引引擎
 */
export declare function createWatchedIndexEngine(workspacePath: string, options?: any): {
    engine: any;
    watcher: any;
};
//# sourceMappingURL=index.d.ts.map