/**
 * F27 P2 — CLI query 類命令 --path 未 resolve（reproduction，先紅後綠）
 *
 * search / deadcode / find-references / call-hierarchy 直接採用 options.path 原始字串，
 * 未經 path.resolve。相對 --path 時：
 * 1. 索引/查詢行為可能與絕對 path 不一致
 * 2. IndexDiskCache 以 projectPath 原字串 hash 當 cache 目錄，相對與絕對變成兩套快取
 *
 * 本檔用真實 FileSystem + 真實暫存目錄（同 rename-relative-workspace-path-bugs），
 * 對比「相對 path」與「絕對 path」的成功語意必須一致。
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative, resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentIdeCLI } from '@interfaces/cli/cli.js';
import { Logger } from '@infrastructure/logging/index.js';
import { IndexDiskCache } from '@infrastructure/cache/index-disk-cache.js';

async function runCLIOnRealFs(args: string[]): Promise<{ exitCode: number; stdout: string }> {
  const cli = new AgentIdeCLI();
  const stdout: string[] = [];
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  console.log = (...logArgs: unknown[]) => {
    stdout.push(logArgs.map(String).join(' '));
  };

  let exitCode = 0;
  try {
    await cli.run(['node', 'agent-ide', ...args]);
    if (process.exitCode !== undefined && process.exitCode !== 0) {
      exitCode = process.exitCode;
    }
  } finally {
    console.log = originalLog;
    process.exitCode = originalExitCode;
    Logger.resetInstance();
  }

  return { exitCode, stdout: stdout.join('\n') };
}

describe('F27：query 類 CLI --path 相對 vs 絕對行為一致', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createTempProject(): { dir: string; relativePath: string } {
    const dir = mkdtempSync(join(tmpdir(), 'agent-ide-f27-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'f27', version: '1.0.0' }), 'utf-8');
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2020', module: 'ESNext', strict: true }
    }), 'utf-8');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'src', 'target.ts'),
      [
        'export function fetchLocalF27(): string {',
        "  return 'data';",
        '}',
        '',
        'export function wrapperF27(): string {',
        '  return fetchLocalF27();',
        '}',
        '',
        'function deadOnlyF27(): number {',
        '  return 1;',
        '}',
        ''
      ].join('\n'),
      'utf-8'
    );
    return { dir, relativePath: relative(process.cwd(), dir) };
  }

  it('search：相對 --path 與絕對 --path 皆應找到 fetchLocalF27', async () => {
    const { dir, relativePath } = createTempProject();

    const absResult = await runCLIOnRealFs([
      'search', 'fetchLocalF27', '--path', dir, '--format', 'json', '--no-cache'
    ]);
    const relResult = await runCLIOnRealFs([
      'search', 'fetchLocalF27', '--path', relativePath, '--format', 'json', '--no-cache'
    ]);

    expect(absResult.exitCode).toBe(0);
    expect(relResult.exitCode).toBe(0);

    const absOut = JSON.parse(absResult.stdout);
    const relOut = JSON.parse(relResult.stdout);
    expect(absOut.success).toBe(true);
    expect(relOut.success).toBe(true);

    const absHits = absOut.results?.length ?? absOut.symbols?.length ?? 0;
    const relHits = relOut.results?.length ?? relOut.symbols?.length ?? 0;
    // 絕對 path 基線：必須找得到
    expect(absHits).toBeGreaterThan(0);
    // Bug：相對 path 目前可能 0 命中或 success 語意不一致
    expect(relHits).toBe(absHits);
  });

  it('find-references：相對 --path 與絕對 --path 引用數一致', async () => {
    const { dir, relativePath } = createTempProject();

    const absResult = await runCLIOnRealFs([
      'find-references', 'fetchLocalF27', '--path', dir, '--format', 'json', '--no-cache'
    ]);
    const relResult = await runCLIOnRealFs([
      'find-references', 'fetchLocalF27', '--path', relativePath, '--format', 'json', '--no-cache'
    ]);

    expect(absResult.exitCode).toBe(0);
    expect(relResult.exitCode).toBe(0);

    const absOut = JSON.parse(absResult.stdout);
    const relOut = JSON.parse(relResult.stdout);
    expect(absOut.success).toBe(true);
    expect(relOut.success).toBe(true);

    const absCount = absOut.references?.length ?? 0;
    const relCount = relOut.references?.length ?? 0;
    expect(absCount).toBeGreaterThan(0);
    expect(relCount).toBe(absCount);
  });

  it('call-hierarchy：相對 --path 與絕對 --path 皆應解析出 wrapperF27 的 outgoing', async () => {
    const { dir, relativePath } = createTempProject();

    const absResult = await runCLIOnRealFs([
      'call-hierarchy', 'wrapperF27', '--path', dir, '--format', 'json', '--no-cache'
    ]);
    const relResult = await runCLIOnRealFs([
      'call-hierarchy', 'wrapperF27', '--path', relativePath, '--format', 'json', '--no-cache'
    ]);

    expect(absResult.exitCode).toBe(0);
    expect(relResult.exitCode).toBe(0);

    const absOut = JSON.parse(absResult.stdout);
    const relOut = JSON.parse(relResult.stdout);
    expect(absOut.success).toBe(true);
    expect(relOut.success).toBe(true);

    const absOutgoing = absOut.outgoing?.length ?? absOut.hierarchy?.outgoing?.length ?? 0;
    const relOutgoing = relOut.outgoing?.length ?? relOut.hierarchy?.outgoing?.length ?? 0;
    // 至少應看到對 fetchLocalF27 的呼叫（絕對 path 基線）
    expect(absOutgoing).toBeGreaterThan(0);
    expect(relOutgoing).toBe(absOutgoing);
  });

  it('deadcode：相對 --path 與絕對 --path 皆應偵測 deadOnlyF27', async () => {
    const { dir, relativePath } = createTempProject();

    const absResult = await runCLIOnRealFs([
      'deadcode', '--path', dir, '--dry-run', '--format', 'json', '--no-cache'
    ]);
    const relResult = await runCLIOnRealFs([
      'deadcode', '--path', relativePath, '--dry-run', '--format', 'json', '--no-cache'
    ]);

    expect(absResult.exitCode).toBe(0);
    expect(relResult.exitCode).toBe(0);

    const absOut = JSON.parse(absResult.stdout);
    const relOut = JSON.parse(relResult.stdout);
    expect(absOut.success).toBe(true);
    expect(relOut.success).toBe(true);

    expect(JSON.stringify(absOut)).toMatch(/deadOnlyF27/);
    expect(JSON.stringify(relOut)).toMatch(/deadOnlyF27/);
  });

  it('IndexDiskCache：同一專案相對 path 與絕對 path 應共用同一 cache 路徑', () => {
    const absPath = resolve('/tmp/agent-ide-f27-cache-proj');
    const relPath = relative(process.cwd(), absPath);
    // 前提：字串形式不同（否則測不到 canonicalize 缺口）
    expect(relPath).not.toBe(absPath);

    const base = join(tmpdir(), 'agent-ide-f27-cache-base');
    const absCache = new IndexDiskCache(absPath, 'default', base).getCachePath();
    const relCache = new IndexDiskCache(relPath, 'default', base).getCachePath();

    // Bug：hashProjectPath 吃原字串 → 相對/絕對變成兩套 cache 目錄
    expect(relCache).toBe(absCache);
  });
});
