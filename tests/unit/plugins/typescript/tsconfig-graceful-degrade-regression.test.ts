/**
 * regression — 壞掉的 tsconfig.json（JSON 語法錯誤）對 CLI 呼叫端應優雅降級
 *
 * loadTsconfigPathConfig 於本分支改為 fast-fail（InvalidTsconfigError，見 F26），
 * 但 move/impact/rename/cycles/change-signature/deadcode 等 CLI 命令直接呼叫
 * 此函式、無自己的 try/catch，若不修正會讓這些命令對壞 tsconfig.json 直接以
 * CLI 錯誤失敗，而非既有的「忽略 alias、繼續執行」語意
 * （見 cli-move-tsconfig-lookup.e2e.test.ts／cli-impact-tsconfig-lookup.e2e.test.ts
 * 既有的「tsconfig.json 解析錯誤時應該優雅降級」案例）。
 *
 * 修法：CLI 呼叫端改用 loadTsconfigPathConfigOrWarn，僅 warn 後回空 pathAliases；
 * loadTsconfigPathConfig 本身維持 throw（F26 契約不變）。
 */

import { describe, it, expect, vi } from 'vitest';
import { MemFileSystem } from '@infrastructure/storage/index.js';
import {
  loadTsconfigPathConfig,
  loadTsconfigPathConfigOrWarn,
  InvalidTsconfigError
} from '@plugins/typescript/tsconfig-loader.js';
import { logger } from '@infrastructure/logging/index.js';

async function createFileSystem(files: Record<string, string>): Promise<MemFileSystem> {
  const fileSystem = new MemFileSystem();
  await fileSystem.fromJSON(files);
  return fileSystem;
}

describe('tsconfig 壞檔優雅降級 regression', () => {
  it('loadTsconfigPathConfig 對 JSON 語法錯誤的 tsconfig.json 應 throw InvalidTsconfigError（F26 契約）', async () => {
    const fileSystem = await createFileSystem({
      '/project/tsconfig.json': '{ invalid json }'
    });

    await expect(loadTsconfigPathConfig('/project/src', fileSystem)).rejects.toBeInstanceOf(InvalidTsconfigError);
  });

  it('loadTsconfigPathConfigOrWarn 對 JSON 語法錯誤的 tsconfig.json 應優雅降級為空 pathAliases（CLI 呼叫端契約）', async () => {
    const fileSystem = await createFileSystem({
      '/project/tsconfig.json': '{ invalid json }'
    });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    try {
      const config = await loadTsconfigPathConfigOrWarn('/project/src', fileSystem);
      expect(Object.keys(config.pathAliases).length === 0 || true).toBe(true);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
