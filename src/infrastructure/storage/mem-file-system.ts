/**
 * 記憶體檔案系統
 * 基於 memfs 實作 IFileSystem 介面，用於測試
 */

import { Volume, type DirectoryJSON, type IFs } from 'memfs';
import * as pathModule from 'path';
import { minimatch } from 'minimatch';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type {
  DirectoryEntry,
  FileStats,
  GlobOptions,
  AtomicWriteOptions,
} from './types.js';
import {
  FileNotFoundError,
  DirectoryNotFoundError,
  PermissionError,
  DirectoryNotEmptyError,
} from './types.js';

/**
 * 記憶體檔案系統
 * 用於測試環境，完全在記憶體中運作
 */
export class MemFileSystem implements IFileSystem {
  private vol: InstanceType<typeof Volume>;
  private fs: IFs;

  constructor() {
    this.vol = new Volume();
    this.fs = this.vol as unknown as IFs;
  }

  /**
   * 從 JSON 結構初始化檔案系統
   */
  fromJSON(structure: DirectoryJSON, cwd = '/'): void {
    this.vol.fromJSON(structure, cwd);
  }

  /**
   * 匯出當前檔案系統為 JSON
   */
  toJSON(): DirectoryJSON {
    return this.vol.toJSON() as DirectoryJSON;
  }

  /**
   * 重設檔案系統
   */
  reset(): void {
    this.vol.reset();
  }

  async readFile(filePath: string, encoding?: BufferEncoding): Promise<string | Buffer> {
    try {
      const content = this.fs.readFileSync(filePath);
      if (encoding) {
        return content.toString(encoding);
      }
      return Buffer.from(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new FileNotFoundError(filePath, error);
      }
      if (error.code === 'EACCES') {
        throw new PermissionError(filePath, error);
      }
      throw error;
    }
  }

  async writeFile(filePath: string, content: string | Buffer, options?: AtomicWriteOptions): Promise<void> {
    try {
      const dir = pathModule.dirname(filePath);
      await this.createDirectory(dir, true);
      this.fs.writeFileSync(filePath, content, { encoding: options?.encoding });
    } catch (error: any) {
      if (error.code === 'EACCES') {
        throw new PermissionError(filePath, error);
      }
      throw error;
    }
  }

  async appendFile(filePath: string, content: string | Buffer): Promise<void> {
    try {
      this.fs.appendFileSync(filePath, content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new FileNotFoundError(filePath, error);
      }
      if (error.code === 'EACCES') {
        throw new PermissionError(filePath, error);
      }
      throw error;
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      this.fs.unlinkSync(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new FileNotFoundError(filePath, error);
      }
      if (error.code === 'EACCES') {
        throw new PermissionError(filePath, error);
      }
      throw error;
    }
  }

  async createDirectory(dirPath: string, recursive = false): Promise<void> {
    try {
      this.fs.mkdirSync(dirPath, { recursive });
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        return;
      }
      if (error.code === 'EACCES') {
        throw new PermissionError(dirPath, error);
      }
      throw error;
    }
  }

  async readDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    try {
      const entries = this.fs.readdirSync(dirPath, { withFileTypes: true }) as any[];
      const result: DirectoryEntry[] = [];

      for (const entry of entries) {
        const entryPath = pathModule.join(dirPath, entry.name);
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
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new DirectoryNotFoundError(dirPath, error);
      }
      if (error.code === 'EACCES') {
        throw new PermissionError(dirPath, error);
      }
      throw error;
    }
  }

  async deleteDirectory(dirPath: string, recursive = false): Promise<void> {
    try {
      if (recursive) {
        this.fs.rmSync(dirPath, { recursive: true, force: false });
      } else {
        this.fs.rmdirSync(dirPath);
      }
    } catch (error: any) {
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

  async exists(targetPath: string): Promise<boolean> {
    try {
      this.fs.accessSync(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  async getStats(targetPath: string): Promise<FileStats> {
    try {
      const stats = this.fs.statSync(targetPath);
      return {
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size as number,
        createdTime: stats.birthtime as Date,
        modifiedTime: stats.mtime as Date,
        accessedTime: stats.atime as Date,
        mode: stats.mode as number,
        uid: stats.uid as number,
        gid: stats.gid as number,
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new FileNotFoundError(targetPath, error);
      }
      if (error.code === 'EACCES') {
        throw new PermissionError(targetPath, error);
      }
      throw error;
    }
  }

  private async safeGetStats(targetPath: string): Promise<FileStats | null> {
    try {
      return await this.getStats(targetPath);
    } catch {
      return null;
    }
  }

  async isFile(targetPath: string): Promise<boolean> {
    try {
      const stats = await this.getStats(targetPath);
      return stats.isFile;
    } catch {
      return false;
    }
  }

  async isDirectory(targetPath: string): Promise<boolean> {
    try {
      const stats = await this.getStats(targetPath);
      return stats.isDirectory;
    } catch {
      return false;
    }
  }

  async copyFile(srcPath: string, destPath: string): Promise<void> {
    try {
      const destDir = pathModule.dirname(destPath);
      await this.createDirectory(destDir, true);
      const content = this.fs.readFileSync(srcPath);
      this.fs.writeFileSync(destPath, content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new FileNotFoundError(srcPath, error);
      }
      if (error.code === 'EACCES') {
        throw new PermissionError(error.path || srcPath, error);
      }
      throw error;
    }
  }

  async moveFile(srcPath: string, destPath: string): Promise<void> {
    await this.copyFile(srcPath, destPath);
    await this.deleteFile(srcPath);
  }

  async glob(pattern: string, options: GlobOptions = {}): Promise<string[]> {
    const cwd = options.cwd || '/';
    const results: string[] = [];

    const walkDir = (dir: string): void => {
      try {
        const entries = this.fs.readdirSync(dir, { withFileTypes: true }) as any[];
        for (const entry of entries) {
          const fullPath = pathModule.join(dir, entry.name);
          const relativePath = pathModule.relative(cwd, fullPath);

          if (entry.isDirectory()) {
            if (!options.onlyFiles) {
              if (this.matchGlob(relativePath, pattern, options)) {
                results.push(options.absolute ? fullPath : relativePath);
              }
            }
            walkDir(fullPath);
          } else if (entry.isFile()) {
            if (!options.onlyDirectories) {
              if (this.matchGlob(relativePath, pattern, options)) {
                results.push(options.absolute ? fullPath : relativePath);
              }
            }
          }
        }
      } catch {
        // 忽略無法存取的目錄
      }
    };

    walkDir(cwd);
    return results
      .filter((p) => !this.isIgnored(p, options.ignore))
      .sort();
  }

  private matchGlob(path: string, pattern: string, options: GlobOptions): boolean {
    return minimatch(path, pattern, { dot: options.dot });
  }

  private isIgnored(path: string, ignorePatterns?: string[]): boolean {
    if (!ignorePatterns || ignorePatterns.length === 0) {
      return false;
    }
    return ignorePatterns.some((ignorePattern) => minimatch(path, ignorePattern));
  }
}
