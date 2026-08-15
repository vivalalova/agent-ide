/**
 * MemFileSystem 遞迴 glob regression 測試
 *
 * H5：底層 mem-vfs 的 glob pattern-to-regex 轉換把 `**` 轉成 `.*`，pattern
 * `** + /*.ts` 因此變成需要一個字面 `/` 分隔目錄與檔名的正規表示式，導致
 * 根層檔案（前面沒有任何目錄、relativePath 不含 `/`）永遠無法匹配該
 * pattern，遞迴 glob 會漏掉根層檔案。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';

describe('MemFileSystem.glob 遞迴 pattern 漏根層檔案 regression（H5）', () => {
  let fs: MemFileSystem;

  beforeEach(() => {
    fs = new MemFileSystem();
  });

  it('**/*.ts 應包含根層檔案，不應只匹配至少一層子目錄下的檔案', async () => {
    await fs.fromJSON({
      '/project/app.ts': 'export const rootOnly = 1;'
    });

    const results = await fs.glob('**/*.ts', {
      cwd: '/project',
      absolute: true,
      onlyFiles: true
    });

    // 正確行為：根層檔案 /project/app.ts 應被 **/*.ts 匹配到
    expect(results).toEqual(['/project/app.ts']);
  });
});
