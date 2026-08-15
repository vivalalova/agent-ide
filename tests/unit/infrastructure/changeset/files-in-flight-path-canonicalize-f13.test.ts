/**
 * F13 P3 — filesInFlight path 未 canonicalize（reproduction，先紅後綠）
 *
 * ChangeApplicator 的 in-process 鎖以 touchedPaths 原始字串為 key，
 * 同 process 對同一檔案以 `./a.ts` 與絕對路徑併發 apply 時，字串不同
 * → 鎖不互斥 → 兩者皆 success（雙成功靜默覆蓋）。
 *
 * 正確行為：路徑 canonicalize 後視為同一檔，須有一方衝突 fail。
 */

import { describe, it, expect } from 'vitest';
import { resolve, normalize } from 'path';
import { ChangeApplicator } from '@infrastructure/changeset/change-applicator.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { ChangesetCommand, FileOperationType, type Changeset } from '@infrastructure/changeset/types.js';

describe('F13：filesInFlight 應 canonicalize 路徑', () => {
  const createChangeset = (overrides: Partial<Changeset> = {}): Changeset => ({
    textChanges: [],
    fileOperations: [],
    description: 'test',
    command: ChangesetCommand.Rename,
    success: true,
    ...overrides
  });

  it('語意同一檔、字串不同的路徑併發 apply 不得兩者皆成功', async () => {
    const fileSystem = new MemFileSystem();
    // 兩種寫法字串不同，但 path.resolve / normalize 後相同
    const pathA = '/project/src/shared-f13.ts';
    const pathB = '/project/src/../src/shared-f13.ts';
    expect(pathA).not.toBe(pathB);
    expect(resolve(pathA)).toBe(resolve(pathB));
    expect(normalize(pathA)).toBe(normalize(pathB));

    const applicator = new ChangeApplicator(fileSystem);

    const changesetA = createChangeset({
      fileOperations: [
        { type: FileOperationType.Create, sourcePath: pathA, targetPath: pathA, content: 'from-a' }
      ]
    });
    const changesetB = createChangeset({
      fileOperations: [
        { type: FileOperationType.Create, sourcePath: pathB, targetPath: pathB, content: 'from-b' }
      ]
    });

    const promiseA = applicator.apply(changesetA);
    const promiseB = applicator.apply(changesetB);
    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    const successes = [resultA, resultB].filter(r => r.success);
    const failures = [resultA, resultB].filter(r => !r.success);

    // Bug：目前字串不同 → 兩把鎖 → 兩者皆 success
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(failures[0].errors?.some(e => /並發|衝突|lock|concurrent/i.test(e))).toBe(true);
  });
});
