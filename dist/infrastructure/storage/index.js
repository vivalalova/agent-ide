/**
 * 檔案系統抽象層統一匯出
 */
// 核心類別
export { FileSystem } from './file-system.js';
export { FileWatcher } from './file-watcher.js';
export { PathUtils } from './path-utils.js';
// 錯誤類別
export { FileSystemError, FileNotFoundError, DirectoryNotFoundError, PermissionError, DirectoryNotEmptyError, FileSystemErrorType, } from './types.js';
// 便利函式
export const createFileSystem = () => new FileSystem();
export const createFileWatcher = () => {
    const { FileWatcher } = require('./file-watcher');
    return new FileWatcher();
};
//# sourceMappingURL=index.js.map