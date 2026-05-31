/**
 * IndexDiskCache
 * 管理索引的磁碟持久化，所有 disk errors 靜默降級
 * 使用 Node.js native fs/promises 讀寫快取（跨程序共享，不走 IFileSystem）
 */

import { homedir } from 'os';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { readFile, writeFile, mkdir, rename as fsRename, access } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { IndexEngine } from '@core/foundations/indexing/index-engine.js';
import { SOURCE_FILE_EXTENSIONS } from '@shared/types/index.js';
import {
  IndexCacheSerializer,
  CACHE_VERSION,
  type SerializedIndexData
} from '@core/foundations/indexing/index-cache-serializer.js';

/**
 * 計算 projectPath hash（用於快取目錄名稱）
 */
function hashProjectPath(projectPath: string): string {
  return createHash('sha256').update(projectPath).digest('hex').slice(0, 16);
}

/**
 * IndexDiskCache
 * 負責快取的讀寫，所有 I/O 錯誤靜默降級（不影響命令執行）
 */
export class IndexDiskCache {
  private readonly serializer = new IndexCacheSerializer();

  constructor(
    private readonly projectPath: string,
    /** IndexConfig 的 hash（前 8 碼），不同命令設定不同快取目錄 */
    private readonly configKey: string = 'default',
    private readonly cacheDir?: string,
  ) {}

  /**
   * 計算目前專案的 cache key
   * sha256(sorted paths + sorted mtimes)
   */
  async computeCacheKey(
    projectPath: string,
    projectFileSystem: IFileSystem,
    includeExtensions: readonly string[] = SOURCE_FILE_EXTENSIONS
  ): Promise<string> {
    try {
      const extensions = includeExtensions.map(extension => `**/*${extension}`);
      const excludePatterns = ['node_modules/**', 'dist/**', '.git/**', 'build/**', 'coverage/**'];

      const allFiles: string[] = [];
      for (const pattern of extensions) {
        const files = await projectFileSystem.glob(pattern, {
          cwd: projectPath,
          ignore: excludePatterns,
          absolute: true
        });
        allFiles.push(...files);
      }

      // 排序並去重
      const uniqueFiles = [...new Set(allFiles)].sort();

      // 取得每個檔案的 mtime
      const mtimePairs: Array<{ path: string; mtime: number }> = [];
      await Promise.all(
        uniqueFiles.map(async (filePath) => {
          try {
            const stat = await projectFileSystem.getStats(filePath);
            mtimePairs.push({ path: filePath, mtime: stat.modifiedTime.getTime() });
          } catch {
            // 靜默跳過無法 stat 的檔案
          }
        })
      );

      // 按路徑排序（已是排序狀態，但 Promise.all 不保序）
      mtimePairs.sort((a, b) => a.path.localeCompare(b.path));

      // 計算 hash
      const hashInput = mtimePairs
        .map(p => `${p.path}:${p.mtime}`)
        .join('\n');

      return createHash('sha256').update(hashInput).digest('hex');
    } catch {
      // fallback: 穩定 sentinel，確保 cache miss（不用時間戳避免每次產生新 key）
      return 'cache-key-unavailable';
    }
  }

  /**
   * 載入快取（使用原生 fs）
   * 失敗時靜默 return null
   */
  async load(): Promise<SerializedIndexData | null> {
    try {
      const cachePath = this.getCachePath();

      // 檢查檔案是否存在
      await access(cachePath, fsConstants.F_OK);

      const raw = await readFile(cachePath, 'utf-8');
      const data = JSON.parse(raw) as SerializedIndexData;

      if (!data || typeof data !== 'object') {
        return null;
      }

      if (data.version !== CACHE_VERSION) {
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  /**
   * 儲存快取（使用原生 fs，atomic write via temp+rename）
   * 失敗時靜默 warn（不 throw）
   */
  async save(engine: IndexEngine, cacheKey: string): Promise<void> {
    try {
      const cachePath = this.getCachePath();
      const cacheParentDir = dirname(cachePath);

      // 確保目錄存在
      await mkdir(cacheParentDir, { recursive: true });

      const { fileEntries } = engine.snapshot();
      const partial = this.serializer.serialize(fileEntries);

      const data: SerializedIndexData = {
        ...partial,
        cacheKey
      };

      const json = JSON.stringify(data);
      const tmpPath = `${cachePath}.tmp`;

      // Atomic write: write to tmp, then rename
      await writeFile(tmpPath, json, 'utf-8');
      await fsRename(tmpPath, cachePath);
    } catch (error) {
      // 靜默降級：快取儲存失敗不影響命令執行
      process.stderr.write(`[agent-ide] cache save warning: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  /**
   * 取得快取檔案路徑
   */
  getCachePath(): string {
    const baseDir = this.cacheDir
      ?? join(homedir(), '.cache', 'agent-ide', hashProjectPath(this.projectPath), this.configKey);
    return join(baseDir, 'index.json');
  }

  /**
   * 從載入的快取資料水合 IndexEngine
   */
  hydrateEngine(engine: IndexEngine, data: SerializedIndexData): boolean {
    try {
      const fileEntries = this.serializer.deserialize(data);
      engine.hydrate(fileEntries);
      return true;
    } catch {
      return false;
    }
  }
}
