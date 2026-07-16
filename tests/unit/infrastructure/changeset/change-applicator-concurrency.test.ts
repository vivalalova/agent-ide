/**
 * ChangeApplicator 併發套用 regression 測試（Bug B）
 *
 * 背景：apply() 的 backup→read→write 序列原本沒有任何鎖或 version/mtime 檢查。
 * 兩個併發的 apply() 呼叫若指向同一檔案，各自獨立讀取同一份原始內容、
 * 各自算出不同結果、各自的寫入本身雖是原子的，但誰的 rename 最後落地就
 * 誰贏——另一方的變更被靜默丟棄，且兩者都回報 success: true，呼叫端完全
 * 無法察覺資料遺失。
 *
 * 修復：ChangeApplicator 內建 in-process 檔案鎖（module-level，keyed by 檔案路徑），
 * 對 changeset 觸及的檔案，若已被另一個尚未完成的 apply() 佔用，立即 fast-fail
 * 回報並發衝突，禁止兩者都成功、其中一方的結果被靜默覆蓋。
 */

import { describe, it, expect } from 'vitest';
import { ChangeApplicator } from '@infrastructure/changeset/change-applicator.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { ChangesetCommand, FileOperationType, type Changeset } from '@infrastructure/changeset/types.js';

describe('ChangeApplicator 併發套用（Bug B regression）', () => {
  const createChangeset = (overrides: Partial<Changeset> = {}): Changeset => ({
    textChanges: [],
    fileOperations: [],
    description: 'test',
    command: ChangesetCommand.Rename,
    success: true,
    ...overrides
  });

  it('兩個併發 apply() 指向同一檔案時，須有一方明確失敗，不得兩者皆成功並靜默覆蓋', async () => {
    const fileSystem = new MemFileSystem();
    const applicator = new ChangeApplicator(fileSystem);

    const changesetA = createChangeset({
      fileOperations: [
        { type: FileOperationType.Create, sourcePath: '/p/shared.ts', targetPath: '/p/shared.ts', content: 'result-from-A' }
      ]
    });
    const changesetB = createChangeset({
      fileOperations: [
        { type: FileOperationType.Create, sourcePath: '/p/shared.ts', targetPath: '/p/shared.ts', content: 'result-from-B' }
      ]
    });

    // 關鍵：不 await 個別呼叫，讓兩次 apply() 的鎖檢查落在同一輪同步執行內，
    // 確定性地重現「併發呼叫」而非依賴計時的 flaky 測試
    const promiseA = applicator.apply(changesetA);
    const promiseB = applicator.apply(changesetB);

    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    const results = [resultA, resultB];
    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    // 核心斷言：不得兩者皆成功（沒有任何機制通知「B 的結果蓋掉了 A」）
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // 失敗的一方必須帶出清楚的並發衝突錯誤，而非默默吞掉
    expect(failures[0].errors?.some(e => /並發|衝突|lock|concurrent/i.test(e))).toBe(true);

    // 成功那一方寫入的內容，必須就是最終落地的內容
    const finalContent = await fileSystem.readFile('/p/shared.ts', 'utf-8');
    const winnerContent = resultA.success ? 'result-from-A' : 'result-from-B';
    expect(finalContent).toBe(winnerContent);
  });

  it('併發衝突失敗後，鎖必須釋放，讓後續非併發的 apply() 能正常成功', async () => {
    const fileSystem = new MemFileSystem();
    const applicator = new ChangeApplicator(fileSystem);

    const changesetA = createChangeset({
      fileOperations: [
        { type: FileOperationType.Create, sourcePath: '/p/seq.ts', targetPath: '/p/seq.ts', content: 'first' }
      ]
    });
    const changesetB = createChangeset({
      fileOperations: [
        { type: FileOperationType.Create, sourcePath: '/p/seq.ts', targetPath: '/p/seq.ts', content: 'second' }
      ]
    });

    const promiseA = applicator.apply(changesetA);
    const promiseB = applicator.apply(changesetB);
    await Promise.all([promiseA, promiseB]);

    // 兩次併發呼叫都已結束（無論誰贏），鎖應已釋放；之後對同一檔案的獨立呼叫必須正常成功
    const changesetC = createChangeset({
      fileOperations: [
        { type: FileOperationType.Create, sourcePath: '/p/seq.ts', targetPath: '/p/seq.ts', content: 'third' }
      ]
    });
    const resultC = await applicator.apply(changesetC);

    expect(resultC.success).toBe(true);
    expect(await fileSystem.readFile('/p/seq.ts', 'utf-8')).toBe('third');
  });

  it('不重疊檔案的併發 apply() 彼此不受影響，皆應成功', async () => {
    const fileSystem = new MemFileSystem();
    const applicator = new ChangeApplicator(fileSystem);

    const changesetA = createChangeset({
      fileOperations: [
        { type: FileOperationType.Create, sourcePath: '/p/x.ts', targetPath: '/p/x.ts', content: 'x-content' }
      ]
    });
    const changesetB = createChangeset({
      fileOperations: [
        { type: FileOperationType.Create, sourcePath: '/p/y.ts', targetPath: '/p/y.ts', content: 'y-content' }
      ]
    });

    const [resultA, resultB] = await Promise.all([
      applicator.apply(changesetA),
      applicator.apply(changesetB)
    ]);

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);
    expect(await fileSystem.readFile('/p/x.ts', 'utf-8')).toBe('x-content');
    expect(await fileSystem.readFile('/p/y.ts', 'utf-8')).toBe('y-content');
  });
});
