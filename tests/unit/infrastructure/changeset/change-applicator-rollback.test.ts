/**
 * ChangeApplicator 回滾 regression 測試
 * 拆分自 change-applicator.test.ts（避免單檔超過 800 行上限）
 *
 * H1: createBackups 對 FileOperationType.Create 一律備份
 * originalContent: null（型別為 BackupType.Create，回滾時直接刪除該路徑），
 * 未檢查 targetPath 是否本已存在既有檔案。當 Create 操作覆寫既存檔、
 * 後續操作又失敗觸發回滾時，回滾會把這個「本來就存在」的檔案直接刪除，
 * 而非還原成回滾前的原始內容，造成資料遺失。
 */

import { describe, it, expect } from 'vitest';
import { ChangeApplicator } from '@infrastructure/changeset/change-applicator.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { ChangesetCommand, FileOperationType, type Changeset } from '@infrastructure/changeset/types.js';

describe('ChangeApplicator 回滾（H1）', () => {
  const createChangeset = (overrides: Partial<Changeset> = {}): Changeset => ({
    textChanges: [],
    fileOperations: [],
    description: 'test',
    command: ChangesetCommand.Rename,
    success: true,
    ...overrides
  });

  it('Create 操作覆寫既存檔後回滾，既存檔應保留（內容為原始值），不得被刪除', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({ '/p/target.ts': 'old' });

    const applicator = new ChangeApplicator(fileSystem);

    const changeset = createChangeset({
      fileOperations: [
        {
          // 覆寫既存檔 /p/target.ts
          type: FileOperationType.Create,
          sourcePath: '/p/target.ts',
          targetPath: '/p/target.ts',
          content: 'new'
        },
        {
          // 無 targetPath，套用時必定拋錯以觸發 rollbackOnError
          type: FileOperationType.Create,
          sourcePath: '/p/invalid.ts'
        }
      ]
    });

    const result = await applicator.apply(changeset, { rollbackOnError: true });

    expect(result.success).toBe(false);

    // 正確契約：回滾後既存檔案應仍存在且內容為回滾前的原始值 'old'
    const stillExists = await fileSystem.exists('/p/target.ts');
    expect(stillExists).toBe(true);

    const content = await fileSystem.readFile('/p/target.ts', 'utf-8');
    expect(content).toBe('old');
  });
});
