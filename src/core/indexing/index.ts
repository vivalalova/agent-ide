/**
 * 索引模組統一匯出
 * 提供程式碼索引系統的所有核心功能
 */

// 核心類別
export { IndexEngine } from './index-engine.js';
export { FileIndex } from './file-index.js';
export { SymbolIndex } from './symbol-index.js';

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
} from './types.js';

// 列舉
export { UpdateOperation } from './types.js';

// 工廠函式
export {
  createFileInfo,
  createIndexConfig,
  createSearchOptions,
  shouldIndexFile,
  calculateProgress
} from './types.js';

// 型別守衛
export {
  isFileInfo,
  isIndexConfig
} from './types.js';

/**
 * 建立預設的索引引擎實例
 */
export function createIndexEngine(workspacePath: string, options?: any) {
  const { IndexEngine } = require('./index-engine');
  const { createIndexConfig } = require('./types');
  const config = createIndexConfig(workspacePath, options);
  return new IndexEngine(config);
}