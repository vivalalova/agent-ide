import * as fs from 'fs/promises';
import * as path from 'path';
import { glob as globby } from 'glob';
import { FileNotFoundError, DirectoryNotFoundError, PermissionError, DirectoryNotEmptyError, } from './types.js';
/**
 * 檔案系統操作類別
 * 提供統一的檔案和目錄操作介面
 */
export class FileSystem {
    tempSuffix = '.tmp';
    /**
     * 讀取檔案內容
     */
    async readFile(filePath, encoding) {
        try {
            if (encoding) {
                return await fs.readFile(filePath, encoding);
            }
            return await fs.readFile(filePath);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new FileNotFoundError(filePath, error);
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(filePath, error);
            }
            throw error;
        }
    }
    /**
     * 寫入檔案內容
     * 自動建立不存在的目錄
     */
    async writeFile(filePath, content, options) {
        try {
            // 確保目錄存在
            const dir = path.dirname(filePath);
            await this.createDirectory(dir, true);
            if (options?.fsync) {
                // 使用原子寫入
                await this.atomicWrite(filePath, content, options);
            }
            else {
                // 直接寫入
                await fs.writeFile(filePath, content, { encoding: options?.encoding });
            }
        }
        catch (error) {
            if (error.code === 'EACCES') {
                throw new PermissionError(filePath, error);
            }
            throw error;
        }
    }
    /**
     * 原子寫入檔案
     */
    async atomicWrite(filePath, content, options) {
        const tempPath = filePath + (options.tempSuffix || this.tempSuffix);
        try {
            await fs.writeFile(tempPath, content, { encoding: options.encoding });
            if (options.fsync) {
                const fd = await fs.open(tempPath, 'r+');
                try {
                    await fd.sync();
                }
                finally {
                    await fd.close();
                }
            }
            await fs.rename(tempPath, filePath);
        }
        catch (error) {
            // 清理暫存檔案
            try {
                await fs.unlink(tempPath);
            }
            catch {
                // 忽略清理錯誤
            }
            throw error;
        }
    }
    /**
     * 追加檔案內容
     */
    async appendFile(filePath, content) {
        try {
            await fs.appendFile(filePath, content);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new FileNotFoundError(filePath, error);
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(filePath, error);
            }
            throw error;
        }
    }
    /**
     * 刪除檔案
     */
    async deleteFile(filePath) {
        try {
            await fs.unlink(filePath);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new FileNotFoundError(filePath, error);
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(filePath, error);
            }
            throw error;
        }
    }
    /**
     * 建立目錄
     */
    async createDirectory(dirPath, recursive = false) {
        try {
            await fs.mkdir(dirPath, { recursive });
        }
        catch (error) {
            if (error.code === 'EEXIST') {
                // 目錄已存在，不是錯誤
                return;
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(dirPath, error);
            }
            throw error;
        }
    }
    /**
     * 讀取目錄內容
     */
    async readDirectory(dirPath) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            const result = [];
            for (const entry of entries) {
                const entryPath = path.join(dirPath, entry.name);
                const stats = await this.safeGetStats(entryPath);
                result.push({
                    name: entry.name,
                    path: entryPath,
                    isFile: entry.isFile(),
                    isDirectory: entry.isDirectory(),
                    size: stats?.size,
                    modifiedTime: stats?.modifiedTime,
                });
            }
            return result;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new DirectoryNotFoundError(dirPath, error);
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(dirPath, error);
            }
            throw error;
        }
    }
    /**
     * 刪除目錄
     */
    async deleteDirectory(dirPath, recursive = false) {
        try {
            if (recursive) {
                await fs.rm(dirPath, { recursive: true, force: false });
            }
            else {
                await fs.rmdir(dirPath);
            }
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new DirectoryNotFoundError(dirPath, error);
            }
            if (error.code === 'ENOTEMPTY') {
                throw new DirectoryNotEmptyError(dirPath, error);
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(dirPath, error);
            }
            throw error;
        }
    }
    /**
     * 檢查路徑是否存在
     */
    async exists(targetPath) {
        try {
            await fs.access(targetPath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * 獲取檔案統計資訊
     */
    async getStats(targetPath) {
        try {
            const stats = await fs.stat(targetPath);
            return {
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory(),
                size: stats.size,
                createdTime: stats.birthtime,
                modifiedTime: stats.mtime,
                accessedTime: stats.atime,
                mode: stats.mode,
                uid: stats.uid,
                gid: stats.gid,
            };
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new FileNotFoundError(targetPath, error);
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(targetPath, error);
            }
            throw error;
        }
    }
    /**
     * 安全獲取檔案統計資訊（不拋出錯誤）
     */
    async safeGetStats(targetPath) {
        try {
            return await this.getStats(targetPath);
        }
        catch {
            return null;
        }
    }
    /**
     * 檢查是否為檔案
     */
    async isFile(targetPath) {
        try {
            const stats = await this.getStats(targetPath);
            return stats.isFile;
        }
        catch {
            return false;
        }
    }
    /**
     * 檢查是否為目錄
     */
    async isDirectory(targetPath) {
        try {
            const stats = await this.getStats(targetPath);
            return stats.isDirectory;
        }
        catch {
            return false;
        }
    }
    /**
     * 複製檔案
     */
    async copyFile(srcPath, destPath) {
        try {
            // 確保目標目錄存在
            const destDir = path.dirname(destPath);
            await this.createDirectory(destDir, true);
            await fs.copyFile(srcPath, destPath);
        }
        catch (error) {
            if (error.code === 'ENOENT' && error.path === srcPath) {
                throw new FileNotFoundError(srcPath, error);
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(error.path || srcPath, error);
            }
            throw error;
        }
    }
    /**
     * 移動檔案
     */
    async moveFile(srcPath, destPath) {
        try {
            // 確保目標目錄存在
            const destDir = path.dirname(destPath);
            await this.createDirectory(destDir, true);
            await fs.rename(srcPath, destPath);
        }
        catch (error) {
            if (error.code === 'EXDEV') {
                // 跨裝置移動，使用複製+刪除
                await this.copyFile(srcPath, destPath);
                await this.deleteFile(srcPath);
                return;
            }
            if (error.code === 'ENOENT') {
                throw new FileNotFoundError(srcPath, error);
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(error.path || srcPath, error);
            }
            throw error;
        }
    }
    /**
     * Glob 搜尋檔案
     */
    async glob(pattern, options = {}) {
        try {
            const results = await globby(pattern, {
                cwd: options.cwd,
                ignore: options.ignore,
                dot: options.dot,
                absolute: options.absolute,
                // 移除不支援的選項
                ...(options.followSymlinks && { followSymbolicLinks: options.followSymlinks }),
            });
            return results.sort();
        }
        catch (error) {
            throw error;
        }
    }
}
//# sourceMappingURL=file-system.js.map