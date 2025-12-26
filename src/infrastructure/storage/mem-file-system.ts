/**
 * 記憶體檔案系統
 * 基於 mem-vfs 實作 IFileSystem 介面，用於測試
 */

import {
  createVFS,
  type VirtualFileSystem,
  type DirectoryJSON,
  type SnapshotId,
  type SnapshotInfo,
  type FileDiff,
  type WatchOptions as VFSWatchOptions,
  VFSWatcher,
} from '@lova/mem-vfs';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type {
  DirectoryEntry,
  FileStats,
  GlobOptions,
  AtomicWriteOptions,
} from './types.js';

// Re-export types for convenience
export type { SnapshotId, SnapshotInfo, FileDiff, VFSWatchOptions, VFSWatcher };

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

  // ============================================================
  // Symlink 操作
  // ============================================================

  /** 建立符號連結 */
  async createSymlink(target: string, linkPath: string): Promise<void> {
    await this.vfs.createSymlink(target, linkPath);
  }

  /** 讀取符號連結目標 */
  async readSymlink(linkPath: string): Promise<string> {
    return this.vfs.readSymlink(linkPath);
  }

  /** 檢查是否為符號連結 */
  async isSymlink(targetPath: string): Promise<boolean> {
    return this.vfs.isSymlink(targetPath);
  }

  /** 取得符號連結統計（不跟隨連結） */
  async getLinkStats(targetPath: string): Promise<FileStats> {
    const stats = await this.vfs.getLinkStats(targetPath);
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

  // ============================================================
  // Watch 操作
  // ============================================================

  /** 監聽檔案變更 */
  watch(watchPath: string, options?: VFSWatchOptions): VFSWatcher {
    return this.vfs.watch(watchPath, options);
  }

  // ============================================================
  // Snapshot 操作
  // ============================================================

  /** 建立快照 */
  createSnapshot(name?: string): SnapshotId {
    return this.vfs.createSnapshot(name);
  }

  /** 還原快照 */
  restoreSnapshot(id: SnapshotId): void {
    this.vfs.restoreSnapshot(id);
  }

  /** 取得快照資訊 */
  getSnapshotInfo(id: SnapshotId): SnapshotInfo | undefined {
    return this.vfs.getSnapshotInfo(id);
  }

  /** 列出所有快照 */
  listSnapshots(): SnapshotInfo[] {
    return this.vfs.listSnapshots();
  }

  /** 刪除快照 */
  deleteSnapshot(id: SnapshotId): boolean {
    return this.vfs.deleteSnapshot(id);
  }

  /** 計算兩個快照之間的差異 */
  diff(fromId?: SnapshotId, toId?: SnapshotId): FileDiff[] {
    return this.vfs.diff(fromId, toId);
  }
}
