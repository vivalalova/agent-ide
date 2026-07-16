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
      return indexEngine;
    }
    // hydrate 失敗 → fallthrough 重新 index
    logger.verbose('cache', 'Cache hydrate failed, re-indexing');
  } else {
    logger.verbose('cache', 'Cache MISS — full index');
  }

  // cache miss 或 hydrate 失敗 → 完整索引 + 儲存快取
  await indexEngine.indexProject(projectPath);

  // index 後重算 key：禁止 pre-index key 綁 post-index body（TOCTOU）
  // 若 index 期間檔案內容變更，舊 key 會讓之後以新內容重算 key 時誤命中舊 snapshot
  const keyAfterIndex = await diskCache.computeCacheKey(
    projectPath,
    fileSystem,
    engineConfig.includeExtensions,
    indexEngine.getEffectiveExcludePatterns()
  );
  if (keyAfterIndex === null) {
    logger.verbose('cache', 'Cache key unavailable after index — skip save');
    return indexEngine;
  }
  await diskCache.save(indexEngine, keyAfterIndex);
  logger.verbose('cache', 'Cache saved');

  return indexEngine;
}
