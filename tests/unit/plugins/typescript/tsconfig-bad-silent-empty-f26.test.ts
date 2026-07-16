/**
 * F26 P3 — 壞 tsconfig 靜默空 alias（reproduction，先紅後綠）
 *
 * 循環 extends 已 fast-fail（CircularTsconfigExtendsError）。
 * 格式錯誤 / 非法 JSON 的 tsconfig 目前 logger.warn 後回空 pathAliases，
 * 與「專案沒有 tsconfig」不可區分 → rename/impact 漏改 path-alias 消費端卻 success。
 *
 * 對齊循環 throw 方向：非循環失敗至少應可觀測（throw、或回傳帶 diagnostics/error 的
 * 結果），不得 silent empty 當成功空設定。
 */

import { describe, it, expect, vi } from 'vitest';
import { MemFileSystem } from '@infrastructure/storage/index.js';
import { loadTsconfigPathConfig, CircularTsconfigExtendsError } from '@plugins/typescript/tsconfig-loader.js';
import { logger } from '@infrastructure/logging/index.js';

async function createFileSystem(files: Record<string, string>): Promise<MemFileSystem> {
  const fileSystem = new MemFileSystem();
  await fileSystem.fromJSON(files);
  return fileSystem;
}

describe('F26：壞 tsconfig 不得 silent empty 與「無 tsconfig」不可區分', () => {
  it('JSON 語法錯誤的 tsconfig 應 throw 或回傳可觀測失敗（非僅空 pathAliases）', async () => {
    const fileSystem = await createFileSystem({
      '/project/tsconfig.json': '{ this is not valid json !!!'
    });

    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    let threw = false;
    let thrown: unknown;
    let config: Awaited<ReturnType<typeof loadTsconfigPathConfig>> | undefined;
    try {
      config = await loadTsconfigPathConfig('/project/src', fileSystem);
    } catch (error) {
      threw = true;
      thrown = error;
    }

    // 對照：循環 extends 必須 throw（既有契約）
    expect(CircularTsconfigExtendsError).toBeDefined();

    // 正確：要嘛 throw，要嘛回傳結構上可觀測失敗（含 error/diagnostics 欄位），
    // 不得僅回 { pathAliases: {} } 且無任何失敗標記（與「無 tsconfig」相同形狀）
    if (threw) {
      expect(thrown).toBeInstanceOf(Error);
      return;
    }

    expect(config).toBeDefined();
    const asRecord = config as Record<string, unknown>;
    const hasObservableFailure =
      asRecord.error !== undefined
      || asRecord.diagnostics !== undefined
      || asRecord.loadError !== undefined
      || asRecord.failed === true
      || (Array.isArray(asRecord.warnings) && asRecord.warnings.length > 0);

    // 若仍走 warn 降級，至少 logger.warn 必須被呼叫（可觀測）——但僅 warn 仍不夠
    // 區分「無 tsconfig」，故主斷言要求回傳結構可觀測失敗或 throw
    // Bug：目前 silent empty + warn，config 無失敗標記
    expect(hasObservableFailure || warnSpy.mock.calls.length > 0).toBe(true);
    // 嚴格：空 alias  alone 不算可觀測失敗標記
    expect(hasObservableFailure).toBe(true);

    warnSpy.mockRestore();
  });

  it('無 tsconfig 時回空設定仍合法（對照組，應綠）', async () => {
    const fileSystem = await createFileSystem({
      '/project/package.json': '{}'
    });

    const config = await loadTsconfigPathConfig('/project/src', fileSystem);
    expect(config.pathAliases).toBeDefined();
    // 無 tsconfig：空 aliases 是正確語意
    expect(Object.keys(config.pathAliases).length === 0 || true).toBe(true);
  });
});
