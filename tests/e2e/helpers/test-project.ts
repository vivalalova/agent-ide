/**
 * 測試專案產生器
 * 建立臨時測試專案供 E2E 測試使用
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

export interface TestProjectOptions {
  name?: string;
  language: 'typescript' | 'javascript';
  files?: Record<string, string>;
}

export class TestProject {
  readonly projectPath: string;
  private created: boolean = false;

  constructor(private readonly options: TestProjectOptions) {
    const uniqueId = `agent-ide-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    this.projectPath = path.join(tmpdir(), options.name || uniqueId);
  }

  /**
   * 建立測試專案
   */
  async create(): Promise<void> {
    if (this.created) {
      return;
    }

    // 建立專案目錄
    await fs.mkdir(this.projectPath, { recursive: true });

    // 建立 package.json
    await this.createPackageJson();

    // 建立測試檔案
    if (this.options.files) {
      for (const [filePath, content] of Object.entries(this.options.files)) {
        await this.writeFile(filePath, content);
      }
    }

    this.created = true;
  }

  /**
   * 寫入檔案到專案
   */
  async writeFile(relativePath: string, content: string): Promise<string> {
    const fullPath = path.join(this.projectPath, relativePath);
    const dir = path.dirname(fullPath);

    // 確保目錄存在
    await fs.mkdir(dir, { recursive: true });

    // 寫入檔案
    await fs.writeFile(fullPath, content, 'utf-8');

    return fullPath;
  }

  /**
   * 讀取檔案內容
   */
  async readFile(relativePath: string): Promise<string> {
    const fullPath = path.join(this.projectPath, relativePath);
    return await fs.readFile(fullPath, 'utf-8');
  }

  /**
   * 檢查檔案是否存在
   */
  async fileExists(relativePath: string): Promise<boolean> {
    const fullPath = path.join(this.projectPath, relativePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 列出專案中的所有檔案
   */
  async listFiles(dir: string = ''): Promise<string[]> {
    const fullPath = path.join(this.projectPath, dir);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const relativePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.listFiles(relativePath);
        files.push(...subFiles);
      } else {
        files.push(relativePath);
      }
    }

    return files;
  }

  /**
   * 取得檔案的絕對路徑
   */
  getFilePath(relativePath: string): string {
    return path.join(this.projectPath, relativePath);
  }

  /**
   * 清理測試專案
   */
  async cleanup(): Promise<void> {
    if (!this.created) {
      return;
    }

    try {
      await fs.rm(this.projectPath, { recursive: true, force: true });
      this.created = false;
    } catch (error) {
      console.warn(`清理測試專案失敗: ${this.projectPath}`, error);
    }
  }

  /**
   * 建立 package.json
   */
  private async createPackageJson(): Promise<void> {
    const packageJson = {
      name: this.options.name || 'test-project',
      version: '1.0.0',
      type: 'module',
      dependencies: {},
      devDependencies: {}
    };

    await fs.writeFile(
      path.join(this.projectPath, 'package.json'),
      JSON.stringify(packageJson, null, 2),
      'utf-8'
    );
  }
}

/**
 * 建立 TypeScript 測試專案
 */
export async function createTypeScriptProject(files?: Record<string, string>): Promise<TestProject> {
  const project = new TestProject({
    language: 'typescript',
    files
  });

  await project.create();
  return project;
}

/**
 * 建立 JavaScript 測試專案
 */
export async function createJavaScriptProject(files?: Record<string, string>): Promise<TestProject> {
  const project = new TestProject({
    language: 'javascript',
    files
  });

  await project.create();
  return project;
}
