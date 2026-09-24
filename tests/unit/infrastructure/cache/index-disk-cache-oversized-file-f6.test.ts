/**
 * [F6] 專案含超過 maxFileSize 的檔案時，磁碟索引快取永遠 MISS
 *
 * 根因：
 * - computeCacheKey（index-disk-cache.ts）對所有符合副檔名/排除規則的檔案算 key，
 *   不看 maxFileSize，含超大檔。
 * - save() 優先採用 deriveCacheKeyFromSnapshot，只算「實際進索引」的檔——
 *   index-batch-parser.ts 會跳過超過 maxFileSize 的檔，這些檔不在 snapshot 內。
 * - 兩者對應的檔案集合不同 → 存進磁碟的 cacheKey 與下次啟動時
 *   （cached-index-engine.ts:65-70）重新 computeCacheKey 算出的 key 永遠對不上，
 *   即使專案內容完全沒變，也會被判定 cache MISS。
 *
 * 本測試重現 cached-index-engine.ts 實際使用的流程（pre-index computeCacheKey
 * → indexProject → save → 下次 pre-index computeCacheKey → 與 load 出的 cacheKey 比對），
 * 用真實 IndexEngine + IndexDiskCache + MemFileSystem，maxFileSize 設低以低成本造出超大檔情境。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  IndexEngine,
  createIndexConfig
} from '@core/foundations/indexing/index.js';
import {
  ParserRegistry,
  registerDefaultParserFactory,
  resetDefaultParserFactoriesForTesting
} from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { IndexDiskCache } from '@infrastructure/cache/index-disk-cache.js';
import { createToyParser } from '../../../helpers/toy-parser.js';

let tmpCacheDir: string;

beforeEach(async () => {
  tmpCacheDir = await mkdtemp(join(tmpdir(), 'agent-ide-disk-cache-oversized-test-'));
  ParserRegistry.resetInstance();
  resetDefaultParserFactoriesForTesting();
  registerDefaultParserFactory(() => createToyParser());
});

afterEach(async () => {
  await rm(tmpCacheDir, { recursive: true, force: true });
  resetDefaultParserFactoriesForTesting();
  ParserRegistry.resetInstance();
});

describe('[F6] IndexDiskCache 對含超大檔專案的 cache key 一致性', () => {
  it('專案含超過 maxFileSize 的檔案時，save 後下次計算的 cache key 必須與 load 出的 cacheKey 相等（cache 命中），而非永遠 MISS', async () => {
    const projectPath = '/project';
    const smallFilePath = '/project/src/small.toy';
    const bigFilePath = '/project/src/big.toy';
    const fileSystem = new MemFileSystem();

    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      [smallFilePath]: 'symbol Small\n',
      // maxFileSize 設 64 bytes，這個檔案內容超過此上限
      [bigFilePath]: `symbol Big\n${'x'.repeat(200)}`
    });

    const config = createIndexConfig(projectPath, { enablePersistence: false, maxFileSize: 64 });
    const engine = new IndexEngine(config, fileSystem);
    await engine.initializeConfiguredParserModules();

    const diskCache = new IndexDiskCache(projectPath, 'default', tmpCacheDir);
    const engineConfig = engine.getConfig();

    // 模擬 cached-index-engine.ts 的實際流程：先算 pre-index key（含超大檔）
    const preIndexKey = await diskCache.computeCacheKey(
      projectPath,
      fileSystem,
      engineConfig.includeExtensions,
      engine.getEffectiveExcludePatterns()
    );
    expect(preIndexKey).not.toBeNull();

    await engine.indexProject(projectPath);

    // 驗證超大檔確實被跳過索引（前提條件）
    expect(engine.isIndexed(smallFilePath)).toBe(true);
    expect(engine.isIndexed(bigFilePath)).toBe(false);

    await diskCache.save(engine, preIndexKey as string);
    const cached = await diskCache.load();
    expect(cached).not.toBeNull();

    // 下次啟動（專案內容完全沒變）重新計算 pre-index key，應與 load 出的 cacheKey 相等才算命中
    const nextRunKey = await diskCache.computeCacheKey(
      projectPath,
      fileSystem,
      engineConfig.includeExtensions,
      engine.getEffectiveExcludePatterns()
    );

    expect(cached?.cacheKey).toBe(nextRunKey);
  });
});
