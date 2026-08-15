/**
 * FileSystem atomicWrite 併發測試
 * 拆分自 file-system.test.ts（避免單檔超過 800 行上限）
 *
 * G2: atomicWrite 的暫存檔名固定為 filePath + '.tmp'（見
 * src/infrastructure/storage/file-system.ts 的 tempSuffix/atomicWrite），
 * 兩個並發寫入同一目標檔案的原子寫入會共用同一個暫存檔，
 * 導致其中一方 rename 時 ENOENT 或內容互相覆蓋、混雜。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileSystem } from '@infrastructure/storage/file-system.js';

describe('FileSystem atomicWrite 併發', () => {
  let fileSystem: FileSystem;
  let tempDir: string;

  beforeEach(async () => {
    // eslint-disable-next-line custom/no-new-filesystem -- 測試檔案允許直接實例化
    fileSystem = new FileSystem();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-ide-fs-atomic-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理錯誤
    }
  });

  it('並發原子寫入同一目標檔案不應共用暫存檔名而互踩（G2）', async () => {
    const filePath = path.join(tempDir, 'concurrent-atomic.txt');
    const contentA = 'A'.repeat(2000);
    const contentB = 'B'.repeat(2000);

    for (let i = 0; i < 20; i++) {
      await fs.rm(filePath, { force: true });

      const results = await Promise.allSettled([
        fileSystem.writeFile(filePath, contentA, { fsync: true }),
        fileSystem.writeFile(filePath, contentB, { fsync: true }),
      ]);

      for (const result of results) {
        expect(result.status).toBe('fulfilled');
      }

      const finalContent = await fs.readFile(filePath, 'utf-8');
      expect([contentA, contentB]).toContain(finalContent);
    }
  });
});
