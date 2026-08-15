/**
 * filesInFlight 鎖應依 IFileSystem 實例分桶（P3 regression）
 *
 * 背景：filesInFlight 的鎖 key 若只用 path.resolve 後的字串，不含 fileSystem 實例身分，
 * 會誤判：兩個彼此獨立的 fileSystem 實例（各自獨立的 memfs，底層儲存互不相干）
 * 若併發套用到「同一路徑字串」的 changeset，會被誤當成同一檔案的併發衝突而 fail，
 * 即使兩者其實各自寫入互不干擾的獨立儲存。
 *
 * 正確行為：鎖依 fileSystem 實例分桶（WeakMap<IFileSystem, Set<string>>），
 * 不同 fileSystem 實例即使路徑字串相同也不互相干擾，皆應成功。
 */

import { describe, it, expect } from 'vitest';
import { ChangeApplicator } from '@infrastructure/changeset/change-applicator.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { ChangesetCommand, FileOperationType, type Changeset } from '@infrastructure/changeset/types.js';

describe('filesInFlight 鎖依 fileSystem 實例分桶', () => {
  const createChangeset = (overrides: Partial<Changeset> = {}): Changeset => ({
    textChanges: [],
    fileOperations: [],
    description: 'test',
    command: ChangesetCommand.Rename,
    success: true,
    ...overrides
  });

  it('不同 fileSystem 實例、同路徑字串、並發 apply 不互相干擾，皆應成功', async () => {
    const fileSystemA = new MemFileSystem();
    const fileSystemB = new MemFileSystem();
    const applicatorA = new ChangeApplicator(fileSystemA);
    const applicatorB = new ChangeApplicator(fileSystemB);

    // 兩個獨立 fileSystem 實例，撞同一個路徑字串
    const sharedPath = '/p/shared-instance-scope.ts';

    const changesetA = createChangeset({
      fileOperations: [
        { type: FileOperationType.Create, sourcePath: sharedPath, targetPath: sharedPath, content: 'content-A' }
      ]
    });
    const changesetB = createChangeset({
      fileOperations: [
        { type: FileOperationType.Create, sourcePath: sharedPath, targetPath: sharedPath, content: 'content-B' }
      ]
    });

    // 不 await 個別呼叫，讓兩次 apply() 的鎖檢查落在同一輪同步執行內，
    // 確定性地重現「併發呼叫」而非依賴計時的 flaky 測試
    const promiseA = applicatorA.apply(changesetA);
    const promiseB = applicatorB.apply(changesetB);

    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    // 核心斷言：不同 fileSystem 實例之間不互斥，兩者皆須成功
    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);

    // 各自的底層儲存各自落地各自的內容，互不覆蓋
    expect(await fileSystemA.readFile(sharedPath, 'utf-8')).toBe('content-A');
    expect(await fileSystemB.readFile(sharedPath, 'utf-8')).toBe('content-B');
  });
});
