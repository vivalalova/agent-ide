/**
 * 檔案系統抽象層統一匯出
 */

// 核心類別
export { FileSystem } from '@infrastructure/storage/file-system.js';
export { FileWatcher } from '@infrastructure/storage/file-watcher.js';
export { PathUtils } from '@infrastructure/storage/path-utils.js';

// 型別定義
export type {
  DirectoryEntry,
  FileStats,
  GlobOptions,
  WatchOptions,
  FileChangeEvent,
  FileWatcherEventListener,
  PathInfo,
  FileSystemLock,
  AtomicWriteOptions,
} from '@infrastructure/storage/types.js';

// 錯誤類別
export {
  FileSystemError,
  FileNotFoundError,
  DirectoryNotFoundError,
  PermissionError,
  DirectoryNotEmptyError,
  FileSystemErrorType,
} from '@infrastructure/storage/types.js';

// 便利函式
export const createFileSystem = () => new FileSystem();
export const createFileWatcher = () => {
  const { FileWatcher } = require('./file-watcher');
  return new FileWatcher();
};