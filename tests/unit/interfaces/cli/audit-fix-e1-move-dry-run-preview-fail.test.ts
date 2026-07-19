/**
 * audit-fix E1 regression
 *
 * move 命令在 preview 轉換失敗（previewInput.success === false）時應
 * process.exitCode = 1，不得把失敗 preview 當成功預覽輸出。
 *
 * 架構筆記（重構後更新）：move.command.ts 與 move-glob-command-handler.ts
 * 已把手刻的 convertChangesetToPreviewInput / previewInput.success 檢查
 * 管線收斂進 command-utils.ts 的 executeMutationCommand（單一來源，行為
 * 契約不變）。本檔靜態 grounding 改為：
 *
 * 1. 確認 move.command.ts（單檔移動 + 成員移動路徑）與
 *    move-glob-command-handler.ts（glob 移動路徑）皆 delegate 至
 *    executeMutationCommand，而非各自手刻 convert + 檢查。
 * 2. 確認 executeMutationCommand 本身（新管線位置）實作
 *    previewInput.success 檢查並設 exitCode=1。
 *
 * 此契約的實際行為（呼叫 executeMutationCommand 對重疊 edits 的
 * previewInput.success=false 回 exitCode=1）由
 * tests/unit/interfaces/cli/audit-fix-c6-c7-execute-mutation-preview-fail.test.ts
 * 端對端驗證，本檔僅 grounding 呼叫點確實 delegate 到該共用管線。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readProjectFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8');
}

/** 契約：呼叫點必須 delegate 至共用 executeMutationCommand，而非自行手刻 convert + 檢查 */
function assertDelegatesToExecuteMutationCommand(source: string, minOccurrences = 1): void {
  const matches = source.match(/await\s+executeMutationCommand\s*\(/g);
  expect(matches?.length ?? 0).toBeGreaterThanOrEqual(minOccurrences);
}

describe('audit-fix E1：move dry-run 在 preview 失敗時應 exit != 0', () => {
  it('move.command.ts 單檔移動與成員移動路徑皆 delegate 至 executeMutationCommand', () => {
    const source = readProjectFile('src/interfaces/cli/commands/move.command.ts');
    // 單檔移動（handleMoveCommand）+ 成員移動（handleMoveMemberCommand）各一次呼叫
    assertDelegatesToExecuteMutationCommand(source, 2);
  });

  it('glob move（move-glob-command-handler.ts）同樣 delegate 至 executeMutationCommand', () => {
    const source = readProjectFile('src/interfaces/cli/commands/move-glob-command-handler.ts');
    assertDelegatesToExecuteMutationCommand(source, 1);
  });

  it('共用管線 executeMutationCommand（command-utils.ts）必須檢查 previewInput.success 並 exitCode=1', () => {
    const source = readProjectFile('src/interfaces/cli/command-utils.ts');

    const convertCallRe = /await\s+convertChangesetToPreviewInput\s*\(/;
    const m = convertCallRe.exec(source);
    expect(m, 'expected await convertChangesetToPreviewInput(...) call site in command-utils.ts').not.toBeNull();

    const afterConvert = source.slice(m!.index, m!.index + 800);
    expect(/if\s*\(\s*!previewInput\.success\s*\)/.test(afterConvert)).toBe(true);

    const failureBlock = afterConvert.match(
      /if\s*\(\s*!previewInput\.success\s*\)\s*\{[\s\S]*?\breturn\b/
    );
    expect(failureBlock, 'expected preview failure if-block with return').not.toBeNull();
    expect(failureBlock![0]).toMatch(/process\.exitCode\s*=\s*1/);
  });
});
