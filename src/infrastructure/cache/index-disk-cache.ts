/**
 * IndexDiskCache
 * 管理索引的磁碟持久化，所有 disk errors 靜默降級
 * 使用 Node.js native fs/promises 讀寫快取（跨程序共享，不走 IFileSystem）
 */

import { homedir } from 'os';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { readFile, writeFile, mkdir, rename as fsRename, access, unlink } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { createUniqueTempPath, type IFileSystem } from '@infrastructure/storage/index.js';
import type { IndexEngine } from '@core/foundations/indexing/index-engine.js';
import { CLI_INDEX_DEFAULTS } from '@core/foundations/indexing/types.js';
import { SOURCE_FILE_EXTENSIONS } from '@shared/types/index.js';
import { computeContentHash } from '@shared/content-hash.js';
import {
  IndexCacheSerializer,
  CACHE_VERSION,
  type SerializedIndexData
} from '@core/foundations/indexing/index-cache-serializer.js';
import { packageVersion } from '@infrastructure/package-info.js';

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
   * sha256(sorted paths + sorted mtimes + sizes + content hash)
   *
   * 含每個檔案的內容 checksum（非僅 size+mtime）：mtime 只有毫秒精度，
   * 快檔案系統或 CI 環境下，同一毫秒內把檔案換成「同 size 不同內容」的新版本
   * 時有可能發生，若只看 size+mtime 會誤判成未變更、回傳 stale 的舊符號/依賴資料。
   *
   * @returns 成功時回傳 hash；無法可靠計算 key（如 glob 拋錯）時回傳 null，
   *   代表「不要信任快取」——caller 應跳過讀寫快取，避免 false cache hit。
   */
  async computeCacheKey(
    projectPath: string,
    projectFileSystem: IFileSystem,
    includeExtensions: readonly string[] = SOURCE_FILE_EXTENSIONS,
    // caller 未傳入時的向後相容值：與 CLI 索引實際使用的預設值同一來源（SSOT）
    excludePatterns: readonly string[] = CLI_INDEX_DEFAULTS.excludePatterns
  ): Promise<string | null> {
    try {
      const extensions = includeExtensions.map(extension => `**/*${extension}`);

      const allFiles: string[] = [];
      for (const pattern of extensions) {
        const files = await projectFileSystem.glob(pattern, {
          cwd: projectPath,
          ignore: [...excludePatterns],
          absolute: true
        });
        allFiles.push(...files);
      }

      // 排序並去重
      const uniqueFiles = [...new Set(allFiles)].sort();

      // 取得每個檔案的 mtime、size 與內容 checksum：
      // size 變幾乎必抓到內容變更（防 mtime 保留型操作如 git checkout / cp -p 造成 stale cache），
      // 但 mtime 只有毫秒精度、size 相同時仍可能漏抓「同毫秒內容被換成同大小的新版本」，
      // 因此另加內容 checksum 堵住這個漏洞
      const fileStats = await Promise.all(
        uniqueFiles.map(async (filePath) => {
          const stat = await projectFileSystem.getStats(filePath);
          const content = await projectFileSystem.readFile(filePath, 'utf-8');
          const contentHash = computeContentHash(
            typeof content === 'string' ? content : content.toString('utf-8')
          );
          return { path: filePath, mtime: stat.modifiedTime.getTime(), size: stat.size, contentHash };
        })
      );

      // 按路徑排序（已是排序狀態，但 Promise.all 不保序）
      fileStats.sort((a, b) => a.path.localeCompare(b.path));

      // 計算 hash
      const hashInput = fileStats
        .map(p => `${p.path}:${p.mtime}:${p.size}:${p.contentHash}`)
        .join('\n');

      return createHash('sha256').update(hashInput).digest('hex');
    } catch {
      // 無法可靠計算 key（如 glob 拋錯）→ 回 null 代表「不要信任快取」，
      // 避免回穩定 sentinel 造成兩次失敗 key 相等的 false cache hit
      return null;
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
      // 唯一 tmp 路徑（pid + 隨機字串）：避免併發冷啟時兩個程序互踩同一個 tmp 檔（torn write）
      const tmpPath = createUniqueTempPath(cachePath, '.tmp');

      // Atomic write: write to tmp, then rename
      await writeFile(tmpPath, json, 'utf-8');
      try {
        await fsRename(tmpPath, cachePath);
      } catch (renameError) {
        // rename 失敗（如 index.json 目前是目錄，或被鎖）：tmp 已寫入但改名失敗，
        // 清掉孤兒 tmp 檔避免快取目錄無限累積 .tmp；清理本身失敗也不掩蓋原始錯誤
        await unlink(tmpPath).catch(() => {});
        throw renameError;
      }
    } catch (error) {
      // 靜默降級：快取儲存失敗不影響命令執行
      process.stderr.write(`[agent-ide] cache save warning: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  /**
   * 取得快取檔案路徑
   *
   * 路徑包含 package.json 的 version（程式版本，SSOT 見 @infrastructure/package-info.js）：
   * 程式改版時自動切到新目錄，不再依賴人工手動 bump CACHE_VERSION 才能讓舊快取失效。
   * CACHE_VERSION（見 index-cache-serializer.ts）語意不同，是序列化 schema 版本，
   * 用於同一程式版本內、序列化格式變更但版本號未變的情況，兩者都需檢查、缺一不可。
   */
  getCachePath(): string {
    const baseDir = this.cacheDir
      ? join(this.cacheDir, hashProjectPath(this.projectPath), this.configKey, packageVersion)
      : join(homedir(), '.cache', 'agent-ide', hashProjectPath(this.projectPath), this.configKey, packageVersion);
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
