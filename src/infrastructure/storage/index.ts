/**
 * 檔案系統抽象層統一匯出
 */

// 核心類別
export { FileSystem } from './file-system';
export { FileWatcher } from './file-watcher';
export { PathUtils } from './path-utils';

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
} from './types';

// 錯誤類別
export {
  FileSystemError,
  FileNotFoundError,
  DirectoryNotFoundError,
  PermissionError,
  DirectoryNotEmptyError,
  FileSystemErrorType,
} from './types';

// 便利函式
export const createFileSystem = () => new FileSystem();
export const createFileWatcher = () => {
  const { FileWatcher } = require('./file-watcher');
  return new FileWatcher();
};