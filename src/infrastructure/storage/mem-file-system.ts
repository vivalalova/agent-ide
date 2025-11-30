/**
 * 記憶體檔案系統
 * 基於 mem-vfs 實作 IFileSystem 介面，用於測試
 */

import { createVFS, type VirtualFileSystem, type DirectoryJSON } from '@lova/mem-vfs';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type {
  DirectoryEntry,
  FileStats,
  GlobOptions,
  AtomicWriteOptions,
} from './types.js';

/**
 * 記憶體檔案系統
 * 用於測試環境，完全在記憶體中運作
 */
export class MemFileSystem implements IFileSystem {
  private vfs: VirtualFileSystem;

  constructor() {
    this.vfs = createVFS();
  }

  /**
   * 從 JSON 結構初始化檔案系統
   * 支援平面路徑格式：{ '/path/to/file.ts': 'content' }
   * 支援嵌套結構格式：{ 'dir': { 'file.ts': 'content' } }
   */
  async fromJSON(structure: DirectoryJSON, _cwd = '/'): Promise<void> {
    // mem-vfs 的 fromJSON 已經支援平面路徑格式自動偵測
    await this.vfs.fromJSON(structure);
  }

  /**
   * 匯出當前檔案系統為 JSON（平面路徑格式）
   */
  toJSON(): DirectoryJSON {
    return this.vfs.toJSON('/', { flatten: true });
  }

  /**
   * 重設檔案系統
   */
  reset(): void {
    this.vfs.reset();
  }

  async readFile(filePath: string, encoding?: BufferEncoding): Promise<string | Buffer> {
    return this.vfs.readFile(filePath, encoding);
  }

  async writeFile(filePath: string, content: string | Buffer, _options?: AtomicWriteOptions): Promise<void> {
    await this.vfs.writeFile(filePath, content);
  }

  async appendFile(filePath: string, content: string | Buffer): Promise<void> {
    await this.vfs.appendFile(filePath, content);
  }

  async deleteFile(filePath: string): Promise<void> {
    await this.vfs.deleteFile(filePath);
  }

  async createDirectory(dirPath: string, recursive = false): Promise<void> {
    await this.vfs.createDirectory(dirPath, recursive);
  }

  async readDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    const entries = await this.vfs.readDirectory(dirPath);
    return entries.map((entry) => ({
      name: entry.name,
      path: entry.path,
      isFile: entry.isFile,
      isDirectory: entry.isDirectory,
      size: entry.size,
      modifiedTime: entry.modifiedTime,
    }));
  }

  async deleteDirectory(dirPath: string, recursive = false): Promise<void> {
    await this.vfs.deleteDirectory(dirPath, recursive);
  }

  async exists(targetPath: string): Promise<boolean> {
    return this.vfs.exists(targetPath);
  }

  async getStats(targetPath: string): Promise<FileStats> {
    const stats = await this.vfs.getStats(targetPath);
    return {
      isFile: stats.isFile,
      isDirectory: stats.isDirectory,
      size: stats.size,
      createdTime: stats.createdTime,
      modifiedTime: stats.modifiedTime,
      accessedTime: stats.accessedTime,
      mode: stats.mode,
      uid: stats.uid,
      gid: stats.gid,
    };
  }

  async isFile(targetPath: string): Promise<boolean> {
    return this.vfs.isFile(targetPath);
  }

  async isDirectory(targetPath: string): Promise<boolean> {
    return this.vfs.isDirectory(targetPath);
  }

  async copyFile(srcPath: string, destPath: string): Promise<void> {
    await this.vfs.copyFile(srcPath, destPath);
  }

  async moveFile(srcPath: string, destPath: string): Promise<void> {
    await this.vfs.moveFile(srcPath, destPath);
  }

  async glob(pattern: string, options: GlobOptions = {}): Promise<string[]> {
    return this.vfs.glob(pattern, {
      cwd: options.cwd,
      ignore: options.ignore,
      dot: options.dot,
      onlyFiles: options.onlyFiles,
      onlyDirectories: options.onlyDirectories,
      absolute: options.absolute,
    });
  }
}
