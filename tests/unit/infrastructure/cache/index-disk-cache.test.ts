/**
 * IndexDiskCache 단元測試
 * 用 temp dir 驗磁碟讀寫行為（不用 MemFileSystem）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { IndexDiskCache } from '@infrastructure/cache/index-disk-cache.js';
import { packageVersion } from '@infrastructure/package-info.js';
import { CACHE_VERSION } from '@core/foundations/indexing/index-cache-serializer.js';
import type { SerializedIndexData } from '@core/foundations/indexing/index-cache-serializer.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';

let tmpCacheDir: string;

beforeEach(async () => {
  tmpCacheDir = await mkdtemp(join(tmpdir(), 'agent-ide-disk-cache-test-'));
});

afterEach(async () => {
  await rm(tmpCacheDir, { recursive: true, force: true });
});

// ── helpers ──

function makeMinimalSerializedData(cacheKey: string): SerializedIndexData {
  return {
    version: CACHE_VERSION,
    cacheKey,
    fileEntries: [],
    timestamp: new Date().toISOString()
  };
}

async function writeRawJson(cachePath: string, data: unknown): Promise<void> {
  const { mkdir } = await import('fs/promises');
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(data), 'utf-8');
}

// ── tests ──

describe('IndexDiskCache', () => {
  describe('getCachePath', () => {
    it('cacheDir override가 있으면 해당 경로 사용', () => {
      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      expect(dirname(dirname(dirname(dirname(cache.getCachePath()))))).toBe(tmpCacheDir);
      expect(cache.getCachePath().endsWith(join('default', packageVersion, 'index.json'))).toBe(true);
    });

    it('cacheDir override 下仍用 configKey 隔離路徑', () => {
      const cache1 = new IndexDiskCache('/proj', 'config-a', tmpCacheDir);
      const cache2 = new IndexDiskCache('/proj', 'config-b', tmpCacheDir);

      expect(cache1.getCachePath().endsWith(join('config-a', packageVersion, 'index.json'))).toBe(true);
      expect(cache2.getCachePath().endsWith(join('config-b', packageVersion, 'index.json'))).toBe(true);
      expect(cache1.getCachePath()).not.toBe(cache2.getCachePath());
    });

    it('同一個 cacheDir 下不同 projectPath 仍隔離路徑', () => {
      const cache1 = new IndexDiskCache('/proj/a', 'default', tmpCacheDir);
      const cache2 = new IndexDiskCache('/proj/b', 'default', tmpCacheDir);

      expect(cache1.getCachePath()).not.toBe(cache2.getCachePath());
    });
  });

  describe('computeCacheKey', () => {
    it('같은 입력 → 같은 hash', async () => {
      const memfs = new MemFileSystem();
      await memfs.writeFile('/proj/src/a.ts', 'export const a = 1;');
      await memfs.writeFile('/proj/src/b.ts', 'export const b = 2;');

      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      const key1 = await cache.computeCacheKey('/proj', memfs);
      const key2 = await cache.computeCacheKey('/proj', memfs);
      expect(key1).toBe(key2);
    });

    it('파일 추가 → hash 변경', async () => {
      const memfs = new MemFileSystem();
      await memfs.writeFile('/proj/src/a.ts', 'export const a = 1;');

      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      const key1 = await cache.computeCacheKey('/proj', memfs);

      // 파일 추가
      await memfs.writeFile('/proj/src/b.ts', 'export const b = 2;');
      const key2 = await cache.computeCacheKey('/proj', memfs);

      expect(key1).not.toBe(key2);
    });

    it('빈 프로젝트 → 결정론적 hash', async () => {
      const memfs = new MemFileSystem();
      const cache = new IndexDiskCache('/empty', 'default', tmpCacheDir);
      const key1 = await cache.computeCacheKey('/empty', memfs);
      const key2 = await cache.computeCacheKey('/empty', memfs);
      expect(key1).toBe(key2);
      expect(typeof key1).toBe('string');
      expect(key1.length).toBeGreaterThan(0);
    });

    // 受控 fake fs：精確控制每個檔案的 mtime / size，computeCacheKey 用 glob + getStats + readFile。
    // content 由 size 推導（同 size 給同 content），維持既有測試只關注 size/mtime 維度的意圖。
    function makeFakeFs(files: ReadonlyArray<{ path: string; mtimeMs: number; size: number }>): IFileSystem {
      return {
        async glob() { return files.map(f => f.path); },
        async getStats(filePath: string) {
          const f = files.find(x => x.path === filePath);
          if (!f) { throw new Error(`no stat: ${filePath}`); }
          return { size: f.size, modifiedTime: new Date(f.mtimeMs) };
        },
        async readFile(filePath: string) {
          const f = files.find(x => x.path === filePath);
          if (!f) { throw new Error(`no content: ${filePath}`); }
          return `content-of-size-${f.size}`;
        }
      } as unknown as IFileSystem;
    }

    // 受控 fake fs：額外帶 content，模擬 computeCacheKey 讀檔算 checksum 的路徑
    function makeFakeFsWithContent(
      files: ReadonlyArray<{ path: string; mtimeMs: number; size: number; content: string }>
    ): IFileSystem {
      return {
        async glob() { return files.map(f => f.path); },
        async getStats(filePath: string) {
          const f = files.find(x => x.path === filePath);
          if (!f) { throw new Error(`no stat: ${filePath}`); }
          return { size: f.size, modifiedTime: new Date(f.mtimeMs) };
        },
        async readFile(filePath: string) {
          const f = files.find(x => x.path === filePath);
          if (!f) { throw new Error(`no content: ${filePath}`); }
          return f.content;
        }
      } as unknown as IFileSystem;
    }

    it('同 size + 同 mtime(毫秒) 但內容不同時須產生不同 key (P2: 防 false cache hit)', async () => {
      // 重現手法：快速檔案系統或 CI 中，替換檔案內容剛好落在同一 size 且同一 mtime 毫秒內，
      // 若 cache key 只看 size+mtime 會誤判為未變更，回傳 stale 的舊符號/依賴資料。
      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      const same = { path: '/proj/src/a.ts', mtimeMs: 1_700_000_000_000, size: 5 };
      const before = makeFakeFsWithContent([{ ...same, content: 'aaaaa' }]);
      const after = makeFakeFsWithContent([{ ...same, content: 'bbbbb' }]);

      const keyBefore = await cache.computeCacheKey('/proj', before);
      const keyAfter = await cache.computeCacheKey('/proj', after);

      expect(keyBefore).not.toBeNull();
      expect(keyAfter).not.toBeNull();
      expect(keyBefore).not.toBe(keyAfter);
    });

    it('內容變更但 mtime 不變(size 改變)須產生不同 key (P-B: 防 stale cache)', async () => {
      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      // 同路徑、同 mtime,但內容變了(size 不同)——例如 git checkout/cp -p 保留 mtime
      const before = makeFakeFs([{ path: '/proj/src/a.ts', mtimeMs: 1_700_000_000_000, size: 100 }]);
      const after = makeFakeFs([{ path: '/proj/src/a.ts', mtimeMs: 1_700_000_000_000, size: 250 }]);

      const keyBefore = await cache.computeCacheKey('/proj', before);
      const keyAfter = await cache.computeCacheKey('/proj', after);

      expect(keyBefore).not.toBe(keyAfter);
    });

    it('glob 失敗時不得回穩定 sentinel(避免 false cache hit) (P-F)', async () => {
      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      const throwingFs = {
        async glob() { throw new Error('glob exploded'); },
        async getStats() { throw new Error('unreachable'); }
      } as unknown as IFileSystem;

      const key = await cache.computeCacheKey('/proj', throwingFs);
      // 不能是會在下次同樣失敗時命中的穩定字串;null 代表「無法計算 key → 不要信任快取」
      expect(key).toBeNull();
    });

    it('任一檔案 stat 失敗時應回傳 null，避免用不完整檔案集合命中舊快取', async () => {
      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      const partialStatsFs = {
        async glob() { return ['/proj/src/a.ts', '/proj/src/b.ts']; },
        async getStats(filePath: string) {
          if (filePath.endsWith('/b.ts')) {
            throw new Error('stat failed');
          }
          return { size: 100, modifiedTime: new Date(1_700_000_000_000) };
        }
      } as unknown as IFileSystem;

      await expect(cache.computeCacheKey('/proj', partialStatsFs)).resolves.toBeNull();
    });
  });

  describe('load', () => {
    it('파일 없으면 null 반환', async () => {
      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      const result = await cache.load();
      expect(result).toBeNull();
    });

    it('유효한 JSON 로드 성공', async () => {
      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      const data = makeMinimalSerializedData('abc123');
      await writeRawJson(cache.getCachePath(), data);

      const loaded = await cache.load();
      expect(loaded).not.toBeNull();
      expect(loaded!.cacheKey).toBe('abc123');
      expect(loaded!.version).toBe(CACHE_VERSION);
    });

    it('버전 불일치 → null 반환', async () => {
      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      const data = { ...makeMinimalSerializedData('k'), version: '99.99.99' };
      await writeRawJson(cache.getCachePath(), data);

      const loaded = await cache.load();
      expect(loaded).toBeNull();
    });

    it('corrupt JSON → null 반환 (throw 없음)', async () => {
      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      const { mkdir } = await import('fs/promises');
      await mkdir(dirname(cache.getCachePath()), { recursive: true });
      await writeFile(cache.getCachePath(), 'NOT_VALID_JSON{{{', 'utf-8');

      const loaded = await cache.load();
      expect(loaded).toBeNull();
    });

    it('null JSON → null 반환', async () => {
      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      await writeRawJson(cache.getCachePath(), null);

      const loaded = await cache.load();
      expect(loaded).toBeNull();
    });
  });

  describe('save + load roundtrip', () => {
    it('save 후 load 하면 cacheKey 일치', async () => {
      // IndexEngine mock: snapshot() returns empty map
      const mockEngine = {
        snapshot: () => ({ fileEntries: new Map() })
      };

      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      await cache.save(mockEngine as never, 'roundtrip-key');

      const loaded = await cache.load();
      expect(loaded).not.toBeNull();
      expect(loaded!.cacheKey).toBe('roundtrip-key');
      expect(loaded!.version).toBe(CACHE_VERSION);
    });

    it('캐시 파일이 atomic하게 쓰여진다 (tmp 파일 남지 않음)', async () => {
      const mockEngine = {
        snapshot: () => ({ fileEntries: new Map() })
      };
      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      await cache.save(mockEngine as never, 'atom-key');

      // tmp 파일이 남지 않아야 함
      const cacheDir = dirname(cache.getCachePath());
      const { readdir } = await import('fs/promises');
      const files = await readdir(cacheDir);
      expect(files.filter(f => f.endsWith('.tmp'))).toHaveLength(0);

      // 실제 파일 존재
      const raw = await readFile(cache.getCachePath(), 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('rename 失敗（如目標路徑是目錄）時不得留下孤兒 tmp 檔 (P3 regression)', async () => {
      // 重現手法：讓最終路徑 index.json 預先建成一個目錄，rename(tmp, index.json)
      // 會因 EISDIR 失敗；此時已寫入的 tmp 檔案若無 cleanup 會永久殘留在快取目錄。
      const mockEngine = {
        snapshot: () => ({ fileEntries: new Map() })
      };
      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      const cachePath = cache.getCachePath();
      const { mkdir, readdir } = await import('fs/promises');
      await mkdir(cachePath, { recursive: true }); // index.json 預先是目錄，rename 必失敗

      await cache.save(mockEngine as never, 'orphan-key'); // 靜默降級，不應拋錯

      const cacheDir = dirname(cachePath);
      const files = await readdir(cacheDir);
      expect(files.filter(f => f.includes('.tmp'))).toHaveLength(0);
    });
  });

  describe('hydrateEngine', () => {
    it('유효한 data → 성공 반환, engine.hydrate 호출', () => {
      const data = makeMinimalSerializedData('h-key');
      let hydratedWith: Map<string, unknown> | null = null;

      const mockEngine = {
        hydrate: (entries: Map<string, unknown>) => { hydratedWith = entries; }
      };

      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      const result = cache.hydrateEngine(mockEngine as never, data);

      expect(result).toBe(true);
      expect(hydratedWith).not.toBeNull();
    });

    it('version 불일치 data → 실패 반환 (throw 없음)', () => {
      const badData = { ...makeMinimalSerializedData('k'), version: '0.0.0' };
      const mockEngine = { hydrate: () => undefined };

      const cache = new IndexDiskCache('/proj', 'default', tmpCacheDir);
      const result = cache.hydrateEngine(mockEngine as never, badData as SerializedIndexData);
      expect(result).toBe(false);
    });
  });
});
