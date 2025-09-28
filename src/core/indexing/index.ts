/**
 * 索引模組統一匯出
 * 提供程式碼索引系統的所有核心功能
 */

// 核心類別
export { IndexEngine } from './index-engine';
export { FileIndex } from './file-index';
export { SymbolIndex } from './symbol-index';
export { FileWatcher } from './file-watcher';

// 型別定義
export type {
  FileInfo,
  FileIndexEntry,
  SymbolIndexEntry,
  IndexConfig,
  IndexStats,
  SearchOptions,
  SymbolSearchResult,
  FileSearchResult,
  IndexUpdateEvent,
  BatchIndexOptions,
  IndexProgress,
  IndexStorage,
  IndexData,
  StorageStats,
  IndexQuery
} from './types';

// 列舉
export { UpdateOperation } from './types';

// 工廠函式
export {
  createFileInfo,
  createIndexConfig,
  createSearchOptions,
  shouldIndexFile,
  calculateProgress
} from './types';

// 型別守衛
export {
  isFileInfo,
  isIndexConfig
} from './types';

// 檔案監控相關
export type {
  FileChangeType,
  FileChangeEvent,
  BatchChangeItem,
  BatchProcessOptions
} from './file-watcher';

/**
 * 建立預設的索引引擎實例
 */
export function createIndexEngine(workspacePath: string, options?: any) {
  const { IndexEngine } = require('./index-engine');
  const { createIndexConfig } = require('./types');
  const config = createIndexConfig(workspacePath, options);
  return new IndexEngine(config);
}

/**
 * 建立帶檔案監控的索引引擎
 */
export function createWatchedIndexEngine(
  workspacePath: string,
  options?: any
) {
  const { FileWatcher } = require('./file-watcher');
  const engine = createIndexEngine(workspacePath, options);
  const watcher = new FileWatcher(engine, {
    debounceTime: options?.debounceTime
  });

  return { engine, watcher };
}