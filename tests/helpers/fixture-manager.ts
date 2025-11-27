/**
 * Fixture 管理器
 * 負責載入測試 fixtures 到 memfs 虛擬檔案系統
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DirectoryJSON } from 'memfs';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';

/** Fixture 上下文，提供測試所需的所有操作 */
export interface FixtureContext {
  /** memfs 實例 */
  memfs: MemFileSystem;
  /** 虛擬根目錄路徑 */
  rootPath: string;
  /** 取得檔案完整路徑 */
  getFilePath(relativePath: string): string;
  /** 讀取檔案內容 */
  readFile(relativePath: string): Promise<string>;
  /** 寫入檔案內容 */
  writeFile(relativePath: string, content: string): Promise<void>;
  /** 檢查檔案是否存在 */
  exists(relativePath: string): Promise<boolean>;
  /** 清理資源 */
  cleanup(): void;
}

/** Fixture 快取，避免重複讀取磁碟 */
const fixtureCache = new Map<string, DirectoryJSON>();

/** Fixtures 根目錄 */
const FIXTURES_ROOT = path.resolve(__dirname, '../fixtures');

/** 虛擬根目錄 */
const VIRTUAL_ROOT = '/test-workspace';

/** 排除的目錄和檔案模式 */
const EXCLUDE_PATTERNS = ['node_modules', 'dist', '.git', '.DS_Store'];

/**
 * 遞迴讀取目錄為 DirectoryJSON 格式
 */
function readDirectoryToJSON(dirPath: string, basePath: string = ''): DirectoryJSON {
  const result: DirectoryJSON = {};
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    // 跳過排除的目錄和檔案
    if (EXCLUDE_PATTERNS.some((pattern) => entry.name === pattern || entry.name.startsWith('.'))) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    const virtualPath = path.posix.join(basePath, entry.name);

    if (entry.isDirectory()) {
      const subDir = readDirectoryToJSON(fullPath, virtualPath);
      Object.assign(result, subDir);
    } else if (entry.isFile()) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        result[virtualPath] = content;
      } catch {
        // 忽略無法讀取的檔案（如二進位檔案）
      }
    }
  }

  return result;
}

/**
 * 載入 fixture 到快取
 */
async function loadFixtureToCache(name: string): Promise<DirectoryJSON> {
  if (fixtureCache.has(name)) {
    return fixtureCache.get(name)!;
  }

  const fixturePath = path.join(FIXTURES_ROOT, name);

  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${name}`);
  }

  const json = readDirectoryToJSON(fixturePath);
  fixtureCache.set(name, json);
  return json;
}

/**
 * 載入 fixture 到 memfs
 * @param name - fixture 名稱（對應 tests/fixtures 下的目錄）
 */
export async function loadFixture(name: string): Promise<FixtureContext> {
  const fixtureJSON = await loadFixtureToCache(name);
  const memfs = new MemFileSystem();
  const rootPath = VIRTUAL_ROOT;

  // 轉換路徑並載入到 memfs
  const convertedJSON: DirectoryJSON = {};
  for (const [relativePath, content] of Object.entries(fixtureJSON)) {
    const virtualPath = path.posix.join(rootPath, relativePath);
    convertedJSON[virtualPath] = content;
  }

  memfs.fromJSON(convertedJSON);

  return {
    memfs,
    rootPath,

    getFilePath(relativePath: string): string {
      return path.posix.join(rootPath, relativePath);
    },

    async readFile(relativePath: string): Promise<string> {
      const filePath = path.posix.join(rootPath, relativePath);
      return (await memfs.readFile(filePath, 'utf-8')) as string;
    },

    async writeFile(relativePath: string, content: string): Promise<void> {
      const filePath = path.posix.join(rootPath, relativePath);
      await memfs.writeFile(filePath, content);
    },

    async exists(relativePath: string): Promise<boolean> {
      const filePath = path.posix.join(rootPath, relativePath);
      return memfs.exists(filePath);
    },

    cleanup(): void {
      memfs.reset();
    },
  };
}

/**
 * 清除 fixture 快取
 */
export function clearFixtureCache(): void {
  fixtureCache.clear();
}

/**
 * 取得可用的 fixture 列表
 */
export function getAvailableFixtures(): string[] {
  if (!fs.existsSync(FIXTURES_ROOT)) {
    return [];
  }

  return fs
    .readdirSync(FIXTURES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}
