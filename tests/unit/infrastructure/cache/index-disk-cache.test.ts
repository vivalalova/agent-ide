/**
 * IndexDiskCache 단元測試
 * 用 temp dir 驗磁碟讀寫行為（不用 MemFileSystem）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { IndexDiskCache } from '@infrastructure/cache/index-disk-cache.js';
import { CACHE_VERSION } from '@core/foundations/indexing/index-cache-serializer.js';
import type { SerializedIndexData } from '@core/foundations/indexing/index-cache-serializer.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';

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
      expect(dirname(dirname(dirname(cache.getCachePath())))).toBe(tmpCacheDir);
      expect(cache.getCachePath().endsWith(join('default', 'index.json'))).toBe(true);
    });

    it('cacheDir override 下仍用 configKey 隔離路徑', () => {
      const cache1 = new IndexDiskCache('/proj', 'config-a', tmpCacheDir);
      const cache2 = new IndexDiskCache('/proj', 'config-b', tmpCacheDir);

      expect(cache1.getCachePath().endsWith(join('config-a', 'index.json'))).toBe(true);
      expect(cache2.getCachePath().endsWith(join('config-b', 'index.json'))).toBe(true);
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
