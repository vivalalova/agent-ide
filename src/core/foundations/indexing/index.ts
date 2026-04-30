/**
 * 索引模組統一匯出
 * 提供程式碼索引系統的所有核心功能
 */

// 核心類別
import { IndexEngine } from './index-engine.js';
import { FileIndex } from './file-index.js';
import { SymbolIndex } from './symbol-index.js';
import { IndexCacheSerializer, CACHE_VERSION } from './index-cache-serializer.js';
import type { SerializedIndexData } from './index-cache-serializer.js';

// 基礎設施
import type { IFileSystem } from '@infrastructure/storage/index.js';

// 型別定義
import type {
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

// 列舉與常數
import { UpdateOperation, CLI_INDEX_DEFAULTS } from './types.js';

// 工廠函式
import {
  createFileInfo,
  createIndexConfig,
  createSearchOptions,
  shouldIndexFile,
  calculateProgress
} from './types.js';

// 型別守衛
import { isFileInfo, isIndexConfig } from './types.js';

// 匯出核心類別
export { IndexEngine, FileIndex, SymbolIndex, IndexCacheSerializer, CACHE_VERSION };

// 匯出快取型別
export type { SerializedIndexData };

// 匯出型別
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
};

// 匯出列舉與常數
export { UpdateOperation, CLI_INDEX_DEFAULTS };

// 匯出工廠函式
export {
  createFileInfo,
  createIndexConfig,
  createSearchOptions,
  shouldIndexFile,
  calculateProgress
};

// 匯出型別守衛
export { isFileInfo, isIndexConfig };

/**
 * 建立預設的索引引擎實例
 * @param workspacePath - 工作區路徑
 * @param fileSystem - 檔案系統抽象
 * @param options - 索引配置選項
 * @returns IndexEngine 實例
 */
export function createIndexEngine(
  workspacePath: string,
  fileSystem: IFileSystem,
  options?: Partial<IndexConfig>
): IndexEngine {
  const config = createIndexConfig(workspacePath, options);
  return new IndexEngine(config, fileSystem);
}