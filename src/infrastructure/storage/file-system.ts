import * as fs from 'fs/promises';
import * as path from 'path';
import { glob as globby, type GlobOptions as GlobbyOptions } from 'glob';
import {
  DirectoryEntry,
  FileStats,
  GlobOptions,
  FileNotFoundError,
  DirectoryNotFoundError,
  PermissionError,
  DirectoryNotEmptyError,
  AtomicWriteOptions,
  FileSystemError,
  FileSystemErrorType,
} from './types.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { createUniqueTempPath } from './atomic-write.js';

/** Node.js 系統錯誤介面 */
interface NodeSystemError extends Error {
  code?: string;
  path?: string;
}

/**
 * 檔案系統操作類別
 * 提供統一的檔案和目錄操作介面
 */
export class FileSystem implements IFileSystem {
  private readonly tempSuffix = '.tmp';

  /**
   * 讀取檔案內容
   */
  async readFile(filePath: string, encoding?: BufferEncoding): Promise<string | Buffer> {
    try {
      if (encoding) {
        return await fs.readFile(filePath, encoding);
      }
      return await fs.readFile(filePath);
    } catch (error) {
      const nodeError = error as NodeSystemError;
      if (nodeError.code === 'ENOENT') {
        throw new FileNotFoundError(filePath, nodeError);
      }
      if (nodeError.code === 'EACCES') {
        throw new PermissionError(filePath, nodeError);
      }
      throw error;
    }
  }

  /**
   * 寫入檔案內容
   * 自動建立不存在的目錄
   */
  async writeFile(filePath: string, content: string | Buffer, options?: AtomicWriteOptions): Promise<void> {
    try {
      // 確保目錄存在
      const dir = path.dirname(filePath);
      await this.createDirectory(dir, true);

      if (options?.fsync) {
        // 使用原子寫入
        await this.atomicWrite(filePath, content, options);
      } else {
        // 直接寫入
        await fs.writeFile(filePath, content, { encoding: options?.encoding });
      }
    } catch (error) {
      const nodeError = error as NodeSystemError;
      if (nodeError.code === 'EACCES') {
        throw new PermissionError(filePath, nodeError);
      }
      throw error;
    }
  }

  /**
   * 原子寫入檔案
   */
  private async atomicWrite(filePath: string, content: string | Buffer, options: AtomicWriteOptions): Promise<void> {
    // 唯一 tmp 路徑（pid + 隨機字串）：避免併發寫入同一目標檔案時共用同一個 tmp 檔而互踩
    const tempPath = createUniqueTempPath(filePath, options.tempSuffix || this.tempSuffix);

    try {
      await fs.writeFile(tempPath, content, { encoding: options.encoding });

      if (options.fsync) {
        const fd = await fs.open(tempPath, 'r+');
        try {
          await fd.sync();
        } finally {
          await fd.close();
        }
      }

      await fs.rename(tempPath, filePath);
    } catch (error) {
      // 清理暫存檔案
      try {
        await fs.unlink(tempPath);
      } catch {
        // graceful-degradation: 暫存檔案清理失敗不影響主流程錯誤傳播
      }
      throw error;
    }
  }

  /**
   * 追加檔案內容
   */
  async appendFile(filePath: string, content: string | Buffer): Promise<void> {
    try {
      await fs.appendFile(filePath, content);
    } catch (error) {
      const nodeError = error as NodeSystemError;
      if (nodeError.code === 'ENOENT') {
        throw new FileNotFoundError(filePath, nodeError);
      }
      if (nodeError.code === 'EACCES') {
        throw new PermissionError(filePath, nodeError);
      }
      throw error;
    }
  }

  /**
   * 刪除檔案
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      const nodeError = error as NodeSystemError;
      if (nodeError.code === 'ENOENT') {
        throw new FileNotFoundError(filePath, nodeError);
      }
      if (nodeError.code === 'EACCES') {
        throw new PermissionError(filePath, nodeError);
      }
      throw error;
    }
  }

  /**
   * 建立目錄
   */
  async createDirectory(dirPath: string, recursive = false): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive });
    } catch (error) {
      const nodeError = error as NodeSystemError;
      if (nodeError.code === 'EEXIST') {
        // fs.mkdir 對「路徑已存在」一律拋 EEXIST，無論該路徑現況是目錄還是檔案；
        // 必須用 stat 分辨，目錄已存在才視為成功（idempotent），
        // 若是檔案則 fast-fail 拋錯，禁靜默吞掉
        const stats = await fs.stat(dirPath);
        if (stats.isDirectory()) {
          return;
        }
        throw new FileSystemError(
          FileSystemErrorType.FILE_ALREADY_EXISTS,
          `Path already exists and is not a directory: ${dirPath}`,
          dirPath,
          nodeError
        );
      }
      if (nodeError.code === 'EACCES') {
        throw new PermissionError(dirPath, nodeError);
      }
      throw error;
    }
  }

  /**
   * 讀取目錄內容
   */
  async readDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const result: DirectoryEntry[] = [];

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);

        // 直接使用 dirent 的 isFile/isDirectory，無需額外 stat
        // 若需要 size/modifiedTime，僅在需要時才呼叫 stat
        let size: number | undefined;
        let modifiedTime: Date | undefined;

        if (entry.isFile()) {
          const stats = await this.safeGetStats(entryPath);
          size = stats?.size;
          modifiedTime = stats?.modifiedTime;
        }

        result.push({
          name: entry.name,
          path: entryPath,
          isFile: entry.isFile(),
          isDirectory: entry.isDirectory(),
          size,
          modifiedTime,
        });
      }

      return result;
    } catch (error) {
      const nodeError = error as NodeSystemError;
      if (nodeError.code === 'ENOENT') {
        throw new DirectoryNotFoundError(dirPath, nodeError);
      }
      if (nodeError.code === 'EACCES') {
        throw new PermissionError(dirPath, nodeError);
      }
      throw error;
    }
  }

  /**
   * 刪除目錄
   */
  async deleteDirectory(dirPath: string, recursive = false): Promise<void> {
    try {
      if (recursive) {
        await fs.rm(dirPath, { recursive: true, force: false });
      } else {
        await fs.rmdir(dirPath);
      }
    } catch (error) {
      const nodeError = error as NodeSystemError;
      if (nodeError.code === 'ENOENT') {
        throw new DirectoryNotFoundError(dirPath, nodeError);
      }
      if (nodeError.code === 'ENOTEMPTY') {
        throw new DirectoryNotEmptyError(dirPath, nodeError);
      }
      if (nodeError.code === 'EACCES') {
        throw new PermissionError(dirPath, nodeError);
      }
      throw error;
    }
  }

  /**
   * 檢查路徑是否存在
   */
  async exists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      // graceful-degradation: fs.access 失敗等同於不存在
      return false;
    }
  }

  /**
   * 獲取檔案統計資訊
   */
  async getStats(targetPath: string): Promise<FileStats> {
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
    } catch (error) {
      const nodeError = error as NodeSystemError;
      if (nodeError.code === 'ENOENT') {
        throw new FileNotFoundError(targetPath, nodeError);
      }
      if (nodeError.code === 'EACCES') {
        throw new PermissionError(targetPath, nodeError);
      }
      throw error;
    }
  }

  /**
   * 安全獲取檔案統計資訊（不拋出錯誤）
   */
  private async safeGetStats(targetPath: string): Promise<FileStats | null> {
    try {
      return await this.getStats(targetPath);
    } catch {
      // graceful-degradation: 明確設計為不拋錯的安全版本
      return null;
    }
  }

  /**
   * 檢查是否為檔案
   */
  async isFile(targetPath: string): Promise<boolean> {
    try {
      const stats = await this.getStats(targetPath);
      return stats.isFile;
    } catch {
      // graceful-degradation: stat 失敗時保守回傳 false
      return false;
    }
  }

  /**
   * 檢查是否為目錄
   */
  async isDirectory(targetPath: string): Promise<boolean> {
    try {
      const stats = await this.getStats(targetPath);
      return stats.isDirectory;
    } catch {
      // graceful-degradation: stat 失敗時保守回傳 false
      return false;
    }
  }

  /**
   * 複製檔案
   */
  async copyFile(srcPath: string, destPath: string): Promise<void> {
    try {
      // 確保目標目錄存在
      const destDir = path.dirname(destPath);
      await this.createDirectory(destDir, true);

      await fs.copyFile(srcPath, destPath);
    } catch (error) {
      const nodeError = error as NodeSystemError;
      if (nodeError.code === 'ENOENT' && nodeError.path === srcPath) {
        throw new FileNotFoundError(srcPath, nodeError);
      }
      if (nodeError.code === 'EACCES') {
        throw new PermissionError(nodeError.path || srcPath, nodeError);
      }
      throw error;
    }
  }

  /**
   * 移動檔案
   */
  async moveFile(srcPath: string, destPath: string): Promise<void> {
    try {
      // 確保目標目錄存在
      const destDir = path.dirname(destPath);
      await this.createDirectory(destDir, true);

      await fs.rename(srcPath, destPath);
    } catch (error) {
      const nodeError = error as NodeSystemError;
      if (nodeError.code === 'EXDEV') {
        // 跨裝置移動，使用複製+刪除
        await this.copyFile(srcPath, destPath);
        await this.deleteFile(srcPath);
        return;
      }
      if (nodeError.code === 'ENOENT') {
        throw new FileNotFoundError(srcPath, nodeError);
      }
      if (nodeError.code === 'EACCES') {
        throw new PermissionError(nodeError.path || srcPath, nodeError);
      }
      throw error;
    }
  }

  /**
   * Glob 搜尋檔案
   */
  async glob(pattern: string, options: GlobOptions = {}): Promise<string[]> {
    const globbyOptions: GlobbyOptions = {
      cwd: options.cwd,
      ignore: options.ignore,
      dot: options.dot,
      absolute: options.absolute,
      nodir: options.onlyFiles,
    };

    if (options.followSymlinks) {
      globbyOptions.follow = options.followSymlinks;
    }

    const results = (await globby(pattern, globbyOptions)) as string[];
    if (!options.onlyDirectories) {
      return results.sort();
    }

    const cwd = options.cwd ?? process.cwd();
    const directories = await Promise.all(results.map(async result => {
      const absolutePath = options.absolute ? result : path.resolve(cwd, result);
      return await this.isDirectory(absolutePath) ? result : undefined;
    }));

    return directories.filter((result): result is string => result !== undefined).sort();
  }
}
