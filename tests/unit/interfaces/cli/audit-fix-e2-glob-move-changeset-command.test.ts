/**
 * audit-fix E2 regression（先紅後綠）
 *
 * glob multi-file move 合併 changeset 時 command 應為 `move`，不得落成預設 `rename`。
 *
 * 根因：move-glob-command-handler 使用 `new ChangesetBuilder()` 未呼叫
 * `.forCommand(ChangesetCommand.Move)`，而 ChangesetBuilder 預設 command 是 Rename。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChangesetBuilder, ChangesetCommand } from '@infrastructure/changeset/index.js';

describe('audit-fix E2：glob multi-file move changeset.command 應為 move', () => {
  it('glob handler 必須 forCommand(Move)；否則合併結果 command 錯誤為 rename', () => {
    // 重現缺陷形狀：handler 等同未 forCommand 的 builder
    const buggyMerged = new ChangesetBuilder()
      .addFileMove('/src/a.ts', '/dest/a.ts')
      .addFileMove('/src/b.ts', '/dest/b.ts')
      .build();
    // 未設 command 時預設 rename（缺陷成因）
    expect(buggyMerged.command).toBe(ChangesetCommand.Rename);

    // 產品碼必須顯式標記 Move
    const globHandlerPath = join(
      process.cwd(),
      'src/interfaces/cli/commands/move-glob-command-handler.ts'
    );
    const source = readFileSync(globHandlerPath, 'utf-8');

    expect(source).toMatch(/new\s+ChangesetBuilder\s*\(/);

    const setsMoveCommand =
      /forCommand\s*\(\s*ChangesetCommand\.Move\s*\)/.test(source)
      || /forCommand\s*\(\s*['"]move['"]\s*\)/.test(source);

    // 現行缺 forCommand(Move) → 此斷言失敗（紅）
    expect(setsMoveCommand).toBe(true);
  });

  it('正確標記後 multi-file move changeset.command 為 move', () => {
    const correctlyTagged = new ChangesetBuilder()
      .forCommand(ChangesetCommand.Move)
      .addFileMove('/src/a.ts', '/dest/a.ts')
      .addFileMove('/src/b.ts', '/dest/b.ts')
      .build();
    expect(correctlyTagged.command).toBe(ChangesetCommand.Move);
  });
});
