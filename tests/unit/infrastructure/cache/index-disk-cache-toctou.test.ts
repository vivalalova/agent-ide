/**
 * F1：disk cache TOCTOU — save 使用的 cacheKey 必須與 snapshot 內容一致
 *
 * 產品路徑（cached-index-engine）：index 前算 key → indexProject → save(同一 key)。
 * 若 index 期間／前後檔案內容變更，snapshot 已是新內容卻寫入舊 key，之後以
 * 舊內容重算 key 會誤命中「新內容 snapshot」。
 *
 * 契約：save 寫入的 cacheKey 必須等於以 save 當下專案檔案重算的 key
 * （index 後重算，或由 snapshot 導出）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { IndexDiskCache } from '@infrastructure/cache/index-disk-cache.js';
import {
  IndexEngine,
  createIndexConfig
} from '@core/foundations/indexing/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import {
  ParserRegistry,
  resetDefaultParserFactoriesForTesting
} from '@infrastructure/parser/index.js';

let tmpCacheDir: string;

beforeEach(async () => {
  tmpCacheDir = await mkdtemp(join(tmpdir(), 'agent-ide-cache-toctou-'));
  ParserRegistry.resetInstance();
  resetDefaultParserFactoriesForTesting();
});

afterEach(async () => {
  await rm(tmpCacheDir, { recursive: true, force: true });
  resetDefaultParserFactoriesForTesting();
  ParserRegistry.resetInstance();
});

describe('IndexDiskCache TOCTOU / key-snapshot consistency (F1)', () => {
  it('index 前算的 key 在內容已變後不得原樣寫入；stored key 須等於現況重算', async () => {
    const projectPath = '/proj';
    const memfs = new MemFileSystem();
    await memfs.fromJSON({
      [`${projectPath}/src/a.ts`]: 'export const a = 1;\n'
    });

    const cache = new IndexDiskCache(projectPath, 'default', tmpCacheDir);

    // 產品步驟 1：index 前算 key
    const keyBefore = await cache.computeCacheKey(projectPath, memfs);
    expect(keyBefore).not.toBeNull();

    // TOCTOU：index 前／期間內容變更
    await memfs.writeFile(`${projectPath}/src/a.ts`, 'export const a = 999;\n');

    const engine = new IndexEngine(
      createIndexConfig(projectPath, { enablePersistence: false }),
      memfs
    );
    await engine.indexProject(projectPath);

    // 產品步驟 2：目前用 index 前的 key 直接 save（缺陷）
    await cache.save(engine, keyBefore!);
    engine.dispose();

    const keyAfter = await cache.computeCacheKey(projectPath, memfs);
    expect(keyAfter).not.toBeNull();
    expect(keyAfter).not.toBe(keyBefore);

    const loaded = await cache.load();
    expect(loaded).not.toBeNull();
    // 正確：stored key 必須對齊 snapshot 對應內容（keyAfter）
    // 目前壞行為：stored === keyBefore（stale）
    expect(loaded!.cacheKey).toBe(keyAfter);
  });
});
