/**
 * 檔案系統抽象層統一匯出
 */
export { FileSystem } from './file-system.js';
export { FileWatcher } from './file-watcher.js';
export { PathUtils } from './path-utils.js';
export type { DirectoryEntry, FileStats, GlobOptions, WatchOptions, FileChangeEvent, FileWatcherEventListener, PathInfo, FileSystemLock, AtomicWriteOptions, } from './types.js';
export { FileSystemError, FileNotFoundError, DirectoryNotFoundError, PermissionError, DirectoryNotEmptyError, FileSystemErrorType, } from './types.js';
export declare const createFileSystem: () => FileSystem;
export declare const createFileWatcher: () => any;
//# sourceMappingURL=index.d.ts.map