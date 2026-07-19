/**
 * createAndIndexWithCache
 * 建立 IndexEngine 並嘗試從磁碟快取載入（hit 時跳過 indexProject）
 */

import { createHash } from 'crypto';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import {
  IndexEngine,
  createIndexConfig,
  type IndexConfig
} from '@core/foundations/indexing/index.js';
import { IndexDiskCache } from '@infrastructure/cache/index-disk-cache.js';
import { logger } from '@infrastructure/logging/index.js';

/** createAndIndexWithCache 選項 */
export interface CacheOptions {
  /** 是否停用快取（不讀不寫） */
  noCache: boolean;
  /** 覆寫快取目錄（預設 ~/.cache/agent-ide/<hash>） */
  cacheDir?: string;
}

/**
 * 建立並索引 IndexEngine，支援磁碟持久化快取
 *
 * 流程：
 * 1. 建立 IndexEngine
 * 2. noCache → 直接 indexProject
 * 3. 計算 cache key → 嘗試載入快取
 * 4. hit → hydrate（跳過 indexProject）
 * 5. miss → indexProject → save cache
 */
export async function createAndIndexWithCache(
  projectPath: string,
  fileSystem: IFileSystem,
  configDefaults: Partial<IndexConfig>,
  options: CacheOptions
): Promise<IndexEngine> {
  const indexConfig = createIndexConfig(projectPath, configDefaults);
  const indexEngine = new IndexEngine(indexConfig, fileSystem);
  await indexEngine.initializeConfiguredParserModules();

  // 測試環境自動 noCache（避免污染 ~/.cache）
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const effectiveNoCache = options.noCache || isTestEnv;

  if (effectiveNoCache) {
    logger.verbose('cache', `Cache disabled, indexing ${projectPath}`);
    await indexEngine.indexProject(projectPath);
    return indexEngine;
  }

  // configDefaults hash（前 8 碼），不同命令設定不同快取目錄隔離
  const configKey = createHash('sha256')
    .update(JSON.stringify(Object.fromEntries(Object.entries(configDefaults).sort())))
    .digest('hex')
    .slice(0, 8);

  const diskCache = new IndexDiskCache(projectPath, configKey, options.cacheDir);

  // 計算當前 cache key（exclude 清單改用索引實際生效的排除集合，即 config + parser 預設，
  // 維持 SSoT——避免 cache key 只看 config.excludePatterns、比索引實際排除的還窄，造成過度失效）
  const engineConfig = indexEngine.getConfig();
  const currentKey = await diskCache.computeCacheKey(
    projectPath,
    fileSystem,
    engineConfig.includeExtensions,
    indexEngine.getEffectiveExcludePatterns()
  );

  // 無法可靠計算 key → 不信任快取（不讀不寫），直接完整索引
  if (currentKey === null) {
    logger.verbose('cache', 'Cache key unavailable — skipping cache, full index');
    await indexEngine.indexProject(projectPath);
    return indexEngine;
  }

  // 嘗試載入快取
  const cached = await diskCache.load();

  if (cached && cached.cacheKey === currentKey) {
    // cache hit → hydrate（跳過 indexProject）
    const hydrated = diskCache.hydrateEngine(indexEngine, cached);
    if (hydrated) {
      logger.verbose('cache', 'Cache HIT — hydrating index');
      // 失敗狀態不得當永久 hit 阻重試：hydrate 後對 parseErrors 且未成功索引的檔重 parse
      const reparsed = await reparseFailedHydratedFiles(indexEngine);
      if (reparsed > 0) {
        // 重 parse 有推進（成功或仍失敗都會更新 entry）；以同一 key 回寫避免 sticky 舊 snapshot
        await diskCache.save(indexEngine, currentKey);
        logger.verbose('cache', `Re-parsed ${reparsed} previously-failed file(s) after cache hit`);
      }
      return indexEngine;
    }
    // hydrate 失敗 → fallthrough 重新 index
    logger.verbose('cache', 'Cache hydrate failed, re-indexing');
  } else {
    logger.verbose('cache', 'Cache MISS — full index');
  }

  // cache miss 或 hydrate 失敗 → 完整索引 + 儲存快取
  await indexEngine.indexProject(projectPath);

  // 不再對 post-index 專案重新 glob+readFile 全部檔案算 key：
  // save() 內部一律優先以 snapshot 各檔已算好的 checksum 導出 key（deriveCacheKeyFromSnapshot），
  // 天生對齊 index 後的實際內容（禁止 pre-index key 綁 post-index body / TOCTOU），
  // 不需要也不應該再重讀一次全專案檔案。currentKey 僅在 snapshot 為空（無檔可索引）時
  // 作為 fallback，此時內容集合視同未變，沿用 pre-index key 語意仍正確。
  await diskCache.save(indexEngine, currentKey);
  logger.verbose('cache', 'Cache saved');

  return indexEngine;
}

/**
 * cache hit hydrate 後，對「有 parseErrors 且 isIndexed false」的檔重新 indexFile。
 * 避免把完全未成功索引的失敗狀態當永久成功 hit，阻塞之後的重試。
 * @returns 嘗試重 parse 的檔案數
 */
async function reparseFailedHydratedFiles(indexEngine: IndexEngine): Promise<number> {
  const { fileEntries } = indexEngine.snapshot();
  const failedPaths: string[] = [];
  for (const [filePath, entry] of fileEntries) {
    if (!entry.isIndexed && entry.parseErrors.length > 0) {
      failedPaths.push(filePath);
    }
  }

  for (const filePath of failedPaths) {
    try {
      await indexEngine.indexFile(filePath);
    } catch {
      // 仍失敗則保留失敗狀態，下次 hit 會再試；不得讓單檔阻斷其餘
    }
  }

  return failedPaths.length;
}
