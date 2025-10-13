/**
 * Fixture Manager
 * 管理測試 fixture 專案的複製、重置和清理
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(dirname, '../../fixtures');

export class FixtureProject {
  readonly fixtureName: string;
  readonly fixturePath: string;
  readonly tempPath: string;
  private originalFiles: Map<string, string> = new Map();

  constructor(fixtureName: string) {
    this.fixtureName = fixtureName;
    this.fixturePath = path.join(FIXTURES_DIR, fixtureName);
    this.tempPath = path.join(tmpdir(), `agent-ide-fixture-${fixtureName}-${Date.now()}-${Math.random().toString(36).substring(7)}`);
  }

  /**
   * 設定 fixture：複製到臨時目錄
   */
  async setup(): Promise<void> {
    await this.copyDirectory(this.fixturePath, this.tempPath);
    await this.snapshotFiles();
  }

  /**
   * 讀取檔案內容
   */
  async readFile(relativePath: string): Promise<string> {
    const fullPath = path.join(this.tempPath, relativePath);
    return await fs.readFile(fullPath, 'utf-8');
  }

  /**
   * 寫入檔案
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.tempPath, relativePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  /**
   * 檔案是否存在
   */
  async fileExists(relativePath: string): Promise<boolean> {
    const fullPath = path.join(this.tempPath, relativePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 取得檔案絕對路徑
   */
  getFilePath(relativePath: string): string {
    return path.join(this.tempPath, relativePath);
  }

  /**
   * 取得所有修改過的檔案
   */
  async getModifiedFiles(): Promise<string[]> {
    const modifiedFiles: string[] = [];
    const allFiles = await this.listAllFiles(this.tempPath);

    for (const file of allFiles) {
      const relativePath = path.relative(this.tempPath, file);
      const originalContent = this.originalFiles.get(relativePath);

      if (originalContent) {
        const currentContent = await fs.readFile(file, 'utf-8');
        if (currentContent !== originalContent) {
          modifiedFiles.push(relativePath);
        }
      }
    }

    return modifiedFiles;
  }

  /**
   * 驗證檔案包含特定文字
   */
  async assertFileContains(relativePath: string, text: string): Promise<boolean> {
    const content = await this.readFile(relativePath);
    return content.includes(text);
  }

  /**
   * 驗證檔案不包含特定文字
   */
  async assertFileNotContains(relativePath: string, text: string): Promise<boolean> {
    const content = await this.readFile(relativePath);
    return !content.includes(text);
  }

  /**
   * 重置到初始狀態
   */
  async reset(): Promise<void> {
    await this.cleanup();
    await this.setup();
  }

  /**
   * 清理臨時目錄
   */
  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.tempPath, { recursive: true, force: true });
      this.originalFiles.clear();
    } catch (error) {
      console.warn(`清理 fixture 失敗: ${this.tempPath}`, error);
    }
  }

  /**
   * 列出所有檔案
   */
  async listFiles(dir: string = ''): Promise<string[]> {
    const fullPath = path.join(this.tempPath, dir);
    return await this.listAllFiles(fullPath);
  }

  /**
   * 複製目錄
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * 快照所有檔案內容（用於追蹤修改）
   */
  private async snapshotFiles(): Promise<void> {
    const files = await this.listAllFiles(this.tempPath);

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const relativePath = path.relative(this.tempPath, file);
        this.originalFiles.set(relativePath, content);
      } catch {
        // 忽略無法讀取的檔案
      }
    }
  }

  /**
   * 遞迴列出所有檔案
   */
  private async listAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await this.listAllFiles(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }
}

/**
 * 載入 fixture 專案
 */
export async function loadFixture(name: string): Promise<FixtureProject> {
  const fixture = new FixtureProject(name);
  await fixture.setup();
  return fixture;
}
