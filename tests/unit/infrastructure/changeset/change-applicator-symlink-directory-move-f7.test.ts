/**
 * [F7] `move <dir> <target>` 來源目錄含 symlink 時必失敗
 *
 * 根因：ChangeApplicator.moveDirectory（change-applicator.ts）遞迴搬移目錄內容時，
 * 只處理 entry.isDirectory / entry.isFile 兩種型別；symlink 條目兩者皆為 false
 * （Node dirent.isFile()/isDirectory() 反映的是目錄項本身的型別，不追蹤 symlink），
 * 因而在迴圈中被略過（既不搬移也不記錄進 completed），導致來源目錄搬完後仍殘留
 * 該 symlink 條目；後續呼叫的 deleteDirectory(source) 是非遞迴版本（fs.rmdir），
 * 目錄非空即拋 ENOTEMPTY（DirectoryNotEmptyError，訊息含 "Directory not empty"）。
 *
 * 本測試用真實 FileSystem + os tmp 目錄（動 filesystem symlink 語意，MemFileSystem
 * 未必忠實模擬 dirent symlink 型別），驗證下列兩種可接受行為之一：
 * 1) 搬移成功，symlink 在目標路徑存在且 readlink 指向正確；或
 * 2) 明確失敗且錯誤訊息點名 symlink（含 "symlink" 或「符號連結」字樣），且來源目錄完整未動。
 *
 * 目前行為：兩者皆不成立——拋錯訊息只有 "Directory not empty"，來源目錄雖保留但
 * 訊息未點名 symlink（不符合條件 2），測試斷言此處必紅。
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink, readlink, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ChangeApplicator } from '@infrastructure/changeset/change-applicator.js';
import { FileSystem } from '@infrastructure/storage/file-system.js';
import { ChangesetCommand, FileOperationType, type Changeset } from '@infrastructure/changeset/types.js';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'agent-ide-f7-'));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('[F7] ChangeApplicator.moveDirectory 對含 symlink 的來源目錄', () => {
  it('來源目錄含 symlink 時，要嘛搬移成功且 symlink 正確落地，要嘛明確失敗並點名 symlink、來源完整未動', async () => {
    const sourceDir = join(tmpRoot, 'src');
    const targetDir = join(tmpRoot, 'dest');
    const linkTargetFile = join(tmpRoot, 'link-target.txt');

    await mkdir(sourceDir, { recursive: true });
    await writeFile(linkTargetFile, 'hello');
    await writeFile(join(sourceDir, 'regular.txt'), 'regular content');
    await symlink(linkTargetFile, join(sourceDir, 'link.txt'));

    // eslint-disable-next-line custom/no-new-filesystem -- 測試檔案允許直接實例化
    const fileSystem = new FileSystem();
    const applicator = new ChangeApplicator(fileSystem);

    const changeset: Changeset = {
      textChanges: [],
      fileOperations: [
        {
          type: FileOperationType.Move,
          sourcePath: sourceDir,
          targetPath: targetDir
        }
      ],
      description: 'test',
      command: ChangesetCommand.Move,
      success: true
    };

    const result = await applicator.apply(changeset, { rollbackOnError: true });

    if (result.success) {
      // 可接受行為 1：搬移成功，symlink 在目標處存在且指向正確
      const movedLinkPath = join(targetDir, 'link.txt');
      const resolvedTarget = await readlink(movedLinkPath);
      expect(resolvedTarget).toBe(linkTargetFile);
    } else {
      // 可接受行為 2：明確失敗，錯誤訊息點名 symlink，且來源目錄完整未動
      // tmpRoot 路徑本身不得混入比對（避免路徑恰好含 symlink 字樣造成假陽性），
      // 故先從錯誤文字中移除 tmpRoot 路徑片段再比對
      const errorText = (result.errors ?? [])
        .join('\n')
        .split(tmpRoot)
        .join('');
      expect(/symlink|符號連結/i.test(errorText)).toBe(true);

      const remainingEntries = await readdir(sourceDir);
      expect(remainingEntries.sort()).toEqual(['link.txt', 'regular.txt']);
    }
  });
});
