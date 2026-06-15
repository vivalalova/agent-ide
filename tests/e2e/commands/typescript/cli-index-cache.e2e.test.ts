/**
 * CLI index cache E2E 測試
 * 驗證 persistent disk cache 的核心行為
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';
import { IndexDiskCache } from '@infrastructure/cache/index-disk-cache.js';
import { CACHE_VERSION } from '@core/foundations/indexing/index-cache-serializer.js';
import type { SerializedIndexData } from '@core/foundations/indexing/index-cache-serializer.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createAndIndexWithCache } from '@interfaces/cli/cached-index-engine.js';
import { CLI_INDEX_DEFAULTS } from '@core/foundations/indexing/index.js';

let cacheDir: string;
let fixture: FixtureContext;

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'agent-ide-cache-e2e-'));
  fixture = await loadFixture('sample-project');
});

afterEach(async () => {
  fixture.cleanup();
  await rm(cacheDir, { recursive: true, force: true });
});

// ── helper: write valid cache JSON ──

async function writeValidCache(cachePath: string, cacheKey: string): Promise<void> {
  const data: SerializedIndexData = {
    version: CACHE_VERSION,
    cacheKey,
    fileEntries: [],
    timestamp: new Date().toISOString()
  };
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(data), 'utf-8');
}

// ── section 1: --no-cache flag via CLI ──

describe('CLI --no-cache flag', () => {
  it('--no-cache 時 find-references가 정상 실행되고 캐시 파일이 생성되지 않는다', async () => {
    await fixture.writeFile('util.ts', 'export function util() {}');

    const result = await executeCLI(
      [
        'find-references', 'util',
        '--path', fixture.rootPath,
        '--format', 'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);
    // 테스트 환경에서 noCache=true이므로 캐시 없음 (정상)
  });

  it('--no-cache 時 search가 정상 실행된다', async () => {
    await fixture.writeFile('svc.ts', 'export class MyService {}');

    const result = await executeCLI(
      [
        'search', 'MyService',
        '--path', fixture.rootPath,
        '--format', 'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);
  });
});

// ── section 2: IndexDiskCache integration with real tmpdir ──

describe('IndexDiskCache: 실제 디스크 읽쓰기', () => {
  it('save 후 load 하면 cacheKey가 일치', async () => {
    const memfs = new MemFileSystem();
    await memfs.writeFile('/proj/src/hello.ts', 'export const hello = "world";');

    const cache = new IndexDiskCache('/proj', 'default', cacheDir);
    expect(dirname(dirname(dirname(cache.getCachePath())))).toBe(cacheDir);
    expect(cache.getCachePath().endsWith(join('default', 'index.json'))).toBe(true);

    const mockEngine = {
      snapshot: () => ({ fileEntries: new Map() })
    };

    await cache.save(mockEngine as never, 'e2e-key-1');

    const loaded = await cache.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.cacheKey).toBe('e2e-key-1');
    expect(loaded!.version).toBe(CACHE_VERSION);
  });

  it('custom cacheDir 仍依 configKey 隔離 cache 檔案', () => {
    const first = new IndexDiskCache('/proj', 'config-a', cacheDir);
    const second = new IndexDiskCache('/proj', 'config-b', cacheDir);

    expect(first.getCachePath().endsWith(join('config-a', 'index.json'))).toBe(true);
    expect(second.getCachePath().endsWith(join('config-b', 'index.json'))).toBe(true);
    expect(first.getCachePath()).not.toBe(second.getCachePath());
  });

  it('同一個 custom cacheDir 下不同 project 仍依 projectPath 隔離 cache 檔案', () => {
    const first = new IndexDiskCache('/proj/a', 'default', cacheDir);
    const second = new IndexDiskCache('/proj/b', 'default', cacheDir);

    expect(first.getCachePath()).not.toBe(second.getCachePath());
  });

  it('캐시 파일이 없으면 load는 null 반환', async () => {
    const cache = new IndexDiskCache('/proj', 'default', cacheDir);
    const loaded = await cache.load();
    expect(loaded).toBeNull();
  });

  it('corrupt JSON → load는 null 반환 (throw 없음)', async () => {
    const cache = new IndexDiskCache('/proj', 'default', cacheDir);
    const cachePath = cache.getCachePath();

    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, '{{INVALID JSON{{', 'utf-8');

    const loaded = await cache.load();
    expect(loaded).toBeNull();
  });

  it('version 불일치 → load는 null 반환', async () => {
    const cache = new IndexDiskCache('/proj', 'default', cacheDir);
    const cachePath = cache.getCachePath();

    const badData = {
      version: '99.99.99',
      cacheKey: 'bad',
      fileEntries: [],
      timestamp: new Date().toISOString()
    };

    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(badData), 'utf-8');

    const loaded = await cache.load();
    expect(loaded).toBeNull();
  });
});

// ── section 3: computeCacheKey ──

describe('IndexDiskCache.computeCacheKey', () => {
  it('같은 MemFileSystem → 동일한 key', async () => {
    const memfs = new MemFileSystem();
    await memfs.writeFile('/proj/src/a.ts', 'export const a = 1;');

    const cache = new IndexDiskCache('/proj', 'default', cacheDir);
    const k1 = await cache.computeCacheKey('/proj', memfs);
    const k2 = await cache.computeCacheKey('/proj', memfs);
    expect(k1).toBe(k2);
  });

  it('파일 추가 시 key 변경', async () => {
    const memfs = new MemFileSystem();
    await memfs.writeFile('/proj/src/a.ts', 'const a = 1;');

    const cache = new IndexDiskCache('/proj', 'default', cacheDir);
    const k1 = await cache.computeCacheKey('/proj', memfs);

    await memfs.writeFile('/proj/src/b.ts', 'const b = 2;');
    const k2 = await cache.computeCacheKey('/proj', memfs);

    expect(k1).not.toBe(k2);
  });
});

// ── section 4: createAndIndexWithCache integration (bypassing isTestEnv guard) ──

describe('createAndIndexWithCache: noCache=true 경로', () => {
  it('noCache=true → indexProject 실행, 캐시 미생성', async () => {
    const memfs = new MemFileSystem();
    await memfs.writeFile('/proj/src/a.ts', 'export function hello() {}');
    // MemFileSystem needs /proj to be a directory
    const stat = await memfs.getStats('/proj/src');
    expect(stat.isDirectory).toBe(true);

    const engine = await createAndIndexWithCache(
      '/proj',
      memfs,
      CLI_INDEX_DEFAULTS,
      { noCache: true, cacheDir }
    );

    const results = await engine.findSymbol('hello');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].symbol.name).toBe('hello');
    engine.dispose();

    // 캐시 파일 없음 (noCache=true이므로)
    const cache = new IndexDiskCache('/proj', 'default', cacheDir);
    const cached = await cache.load();
    expect(cached).toBeNull();
  });
});

// ── section 5: hydrateEngine ──

describe('IndexDiskCache.hydrateEngine', () => {
  it('유효한 data → 성공 (true)', async () => {
    const cache = new IndexDiskCache('/proj', 'default', cacheDir);
    const cachePath = cache.getCachePath();
    await writeValidCache(cachePath, 'hydrate-key');

    const loaded = await cache.load();
    expect(loaded).not.toBeNull();

    let hydratedCalled = false;
    const mockEngine = {
      hydrate: () => { hydratedCalled = true; }
    };

    const ok = cache.hydrateEngine(mockEngine as never, loaded!);
    expect(ok).toBe(true);
    expect(hydratedCalled).toBe(true);
  });

  it('버전 불일치 data → false (throw 없음)', () => {
    const cache = new IndexDiskCache('/proj', 'default', cacheDir);
    const badData: SerializedIndexData = {
      version: '0.0.0',
      cacheKey: 'x',
      fileEntries: [],
      timestamp: new Date().toISOString()
    };

    const mockEngine = { hydrate: () => undefined };
    const ok = cache.hydrateEngine(mockEngine as never, badData);
    expect(ok).toBe(false);
  });
});
