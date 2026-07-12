/**
 * FileSystem glob onlyFiles regression 測試
 *
 * H4：FileSystem.glob() 建構 globby 選項時只帶了 cwd/ignore/dot/absolute（與
 * followSymlinks），未把呼叫端傳入的 onlyFiles / onlyDirectories 轉交給
 * 底層的 glob 套件，導致 onlyFiles: true 完全被忽略，glob 結果會把符合
 * pattern 的目錄也一併列出。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileSystem } from '@infrastructure/storage/file-system.js';

describe('FileSystem.glob onlyFiles regression（H4）', () => {
  let fileSystem: FileSystem;
  let tempDir: string;

  beforeEach(async () => {
    // eslint-disable-next-line custom/no-new-filesystem -- 測試檔案允許直接實例化
    fileSystem = new FileSystem();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-ide-fs-glob-test-'));

    await fs.mkdir(path.join(tempDir, 'src', 'subdir'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'a.ts'), 'export const a = 1;\n');
    await fs.writeFile(path.join(tempDir, 'src', 'subdir', 'b.ts'), 'export const b = 2;\n');
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理錯誤
    }
  });

  it('onlyFiles: true 應排除符合 pattern 的目錄，只回傳檔案', async () => {
    const results = await fileSystem.glob('src/*', {
      cwd: tempDir,
      onlyFiles: true,
      absolute: true
    });

    const normalized = results.map(p => p.replace(/\\/g, '/'));

    // 正確行為：只應包含 src/a.ts，不應包含 src/subdir 目錄
    expect(normalized.some(p => p.endsWith('/src/subdir'))).toBe(false);
    expect(normalized.some(p => p.endsWith('/src/a.ts'))).toBe(true);
  });
});
