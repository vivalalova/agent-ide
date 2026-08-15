/**
 * ChangeApplicator 回滾原子性 regression 測試（Bug A）
 *
 * 背景：rollback() 還原檔案內容時，即使 forward apply 是原子寫入
 * （write-temp-then-rename），回滾寫入原本一律呼叫非原子的直接 writeFile。
 * 若同一 changeset 中較晚的操作失敗觸發回滾，而回滾恢復較早操作的原始內容時
 * 又被 I/O 錯誤（如磁碟已滿）中斷，檔案會被截斷成「半殘留」的損毀狀態——
 * 既非新內容也非原始內容，任何一方都遺失。
 *
 * 修復：rollback 的還原寫入必須沿用與 forward apply 相同的原子寫入原語
 * （{ fsync: atomic }），失敗只會發生在 commit（rename）前，檔案永遠停留在
 * 「回滾前狀態」或「完整還原後的原始內容」其中之一，絕不出現半殘留內容。
 */

import { describe, it, expect } from 'vitest';
import { ChangeApplicator } from '@infrastructure/changeset/change-applicator.js';
import type { IFileSystem, DirectoryEntry, FileStats, GlobOptions } from '@infrastructure/storage/file-system.interface.js';
import type { AtomicWriteOptions } from '@infrastructure/storage/types.js';
import { ChangesetCommand, FileOperationType, type Changeset } from '@infrastructure/changeset/types.js';

/** 損毀標記：模擬非原子直接寫入被中途中斷後，檔案殘留的半寫入內容 */
const CORRUPTED_MARKER = '<<CORRUPTED-PARTIAL-WRITE>>';

/**
 * 可注入寫入故障的假檔案系統。
 *
 * 對指定路徑設定「從第 N 次 writeFile 呼叫起故障」：
 * - 若呼叫時帶 { fsync: true }（原子寫入）：模擬 commit（rename）前失敗，
 *   完全不觸碰既有內容（真實 atomicWrite 是先寫暫存檔、成功才 rename，
 *   失敗時目標檔案原封不動）。
 * - 若呼叫時未帶 fsync（非原子直接寫入）：模擬寫入中途被打斷，
 *   先把內容改成損毀標記、才拋錯（真實直接寫入無暫存檔保護，中途中斷即半殘留）。
 */
class FaultyFileSystem implements IFileSystem {
  private readonly store = new Map<string, string>();
  private readonly writeCounts = new Map<string, number>();
  readonly failFromCallNumber = new Map<string, number>();

  constructor(initial: Record<string, string> = {}) {
    for (const [filePath, content] of Object.entries(initial)) {
      this.store.set(filePath, content);
    }
  }

  getContent(filePath: string): string | undefined {
    return this.store.get(filePath);
  }

  async readFile(filePath: string): Promise<string> {
    if (!this.store.has(filePath)) {
      throw new Error(`ENOENT: ${filePath}`);
    }
    return this.store.get(filePath) as string;
  }

  async writeFile(filePath: string, content: string | Buffer, options?: AtomicWriteOptions): Promise<void> {
    const count = (this.writeCounts.get(filePath) ?? 0) + 1;
    this.writeCounts.set(filePath, count);

    const failFrom = this.failFromCallNumber.get(filePath);
    if (failFrom !== undefined && count >= failFrom) {
      if (options?.fsync) {
        // 原子寫入：失敗發生在 commit 前，目標檔案完全不受影響
        throw new Error('模擬磁碟已滿：原子寫入於 commit（rename）前失敗');
      }
      // 非原子直接寫入：模擬中途被中斷，檔案已被改成半殘留內容才拋錯
      this.store.set(filePath, CORRUPTED_MARKER);
      throw new Error('模擬磁碟已滿：非原子直接寫入中途中斷');
    }

    this.store.set(filePath, content as string);
  }

  async exists(filePath: string): Promise<boolean> {
    return this.store.has(filePath);
  }

  async deleteFile(filePath: string): Promise<void> {
    this.store.delete(filePath);
  }

  async isDirectory(): Promise<boolean> {
    return false;
  }

  async isFile(): Promise<boolean> {
    return true;
  }

  async appendFile(): Promise<void> {
    throw new Error('not implemented in FaultyFileSystem');
  }

  async createDirectory(): Promise<void> {
    // no-op：測試中路徑皆為單層，無需真的建立目錄
  }

  async readDirectory(): Promise<DirectoryEntry[]> {
    return [];
  }

  async deleteDirectory(): Promise<void> {
    throw new Error('not implemented in FaultyFileSystem');
  }

  async getStats(): Promise<FileStats> {
    throw new Error('not implemented in FaultyFileSystem');
  }

  async copyFile(): Promise<void> {
    throw new Error('not implemented in FaultyFileSystem');
  }

  async moveFile(): Promise<void> {
    throw new Error('not implemented in FaultyFileSystem');
  }

  async glob(_pattern: string, _options?: GlobOptions): Promise<string[]> {
    return [];
  }
}

describe('ChangeApplicator 回滾原子性（Bug A regression）', () => {
  const createChangeset = (overrides: Partial<Changeset> = {}): Changeset => ({
    textChanges: [],
    fileOperations: [],
    description: 'test',
    command: ChangesetCommand.Rename,
    success: true,
    ...overrides
  });

  it('回滾寫入中途失敗時，原始檔案不得殘留半寫入（損毀）內容', async () => {
    const fileSystem = new FaultyFileSystem({ '/p/a.ts': 'original-a' });
    const applicator = new ChangeApplicator(fileSystem);

    // 第 1 次對 /p/a.ts 的 writeFile 是 forward apply（覆寫成 'new-a'），必須成功；
    // 第 2 次是 rollback 的還原寫入，設定從第 2 次起才故障
    fileSystem.failFromCallNumber.set('/p/a.ts', 2);

    const changeset = createChangeset({
      fileOperations: [
        // 覆寫既存檔 /p/a.ts（forward apply 成功，觸發備份原始內容 'original-a'）
        {
          type: FileOperationType.Create,
          sourcePath: '/p/a.ts',
          targetPath: '/p/a.ts',
          content: 'new-a'
        },
        // 無 targetPath，套用時必定拋錯，觸發 rollbackOnError
        {
          type: FileOperationType.Create,
          sourcePath: '/p/invalid.ts'
        }
      ]
    });

    const result = await applicator.apply(changeset, { rollbackOnError: true });

    expect(result.success).toBe(false);

    const finalContent = fileSystem.getContent('/p/a.ts');

    // 核心斷言：無論回滾最終是否恢復原始內容，都絕對不能是半殘留的損毀內容
    expect(finalContent).not.toBe(CORRUPTED_MARKER);
    // 允許的終態只有兩種：完整還原的原始內容，或回滾前（forward apply 後）的內容
    expect(['original-a', 'new-a']).toContain(finalContent);
  });

  it('回滾正常成功時，原始內容仍應正確還原（未故障情境下的既有行為不得回歸）', async () => {
    const fileSystem = new FaultyFileSystem({ '/p/b.ts': 'original-b' });
    const applicator = new ChangeApplicator(fileSystem);
    // 不設定 failFromCallNumber，rollback 應正常成功還原

    const changeset = createChangeset({
      fileOperations: [
        {
          type: FileOperationType.Create,
          sourcePath: '/p/b.ts',
          targetPath: '/p/b.ts',
          content: 'new-b'
        },
        {
          type: FileOperationType.Create,
          sourcePath: '/p/invalid.ts'
        }
      ]
    });

    const result = await applicator.apply(changeset, { rollbackOnError: true });

    expect(result.success).toBe(false);
    expect(fileSystem.getContent('/p/b.ts')).toBe('original-b');
  });
});
