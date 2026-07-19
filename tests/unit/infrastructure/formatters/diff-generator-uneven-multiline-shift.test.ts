/**
 * Regression: expandMultilineChanges 對「刪 N 行＋增 M 行（N≠M）」的多行變更
 * 未做內容比對，僅按相同索引 i 把 old[i]/new[i] 交錯配對。
 *
 * 典型觸發場景：move-member 刪除 2 行宣告，導致其後一整段未變更的
 * class 內容整體上移 2 行。diff-generator 收到的單一 LineChange 為
 * oldContent = 2 行宣告 + 10 行 class（12 行）、
 * newContent = 10 行 class（無宣告，10 行）。
 *
 * expandMultilineChanges 依 index 而非內容配對 old/new 子行，
 * 造成 10 行完全沒變的 class 內容全部被標成 -/+（誤判為變更），
 * 增減行數統計膨脹到遠超實際變更的 2 行。
 *
 * 正確語意：內容相同的行不應同時出現在同一份 diff 的 +/- 輸出中；
 * 增減行數統計應反映實際變更（此案例應為刪除 2 行、新增 0 行，
 * 而非把 12 行都標刪除、10 行都標新增）。
 */

import { describe, it, expect } from 'vitest';
import { generatePreviewResult } from '@infrastructure/formatters/diff-generator.js';
import {
  PreviewCommand,
  ChangeLineType,
  type PreviewInput,
  type FileChangeInput,
  type LineChange
} from '@infrastructure/formatters/types.js';

describe('DiffGenerator - expandMultilineChanges 非等長多行變更', () => {
  it('刪除標頭 2 行造成後續未變 class 整段上移時，class 內容不應出現在 -/+ 輸出中', () => {
    const declLine1 = 'const removedA = 1;';
    const declLine2 = 'const removedB = 2;';
    // 10 行內容互不相同的「未變」class 本體
    const classLines = Array.from({ length: 10 }, (_, i) => `  classBodyLine${i};`);

    const oldContent = [declLine1, declLine2, ...classLines].join('\n'); // 12 行
    const newContent = classLines.join('\n'); // 10 行（宣告被刪除，class 上移 2 行）

    const changes: LineChange[] = [
      { line: 1, oldContent, newContent }
    ];

    const fileChange: FileChangeInput = {
      filePath: 'src/moved.ts',
      originalContent: oldContent,
      changes
    };

    const input: PreviewInput = {
      command: PreviewCommand.Move,
      success: true,
      fileChanges: [fileChange]
    };

    const result = generatePreviewResult(input, 3);
    const hunk = result.files[0].hunks[0];

    const addedContents = hunk.lines
      .filter(l => l.type === ChangeLineType.Add)
      .map(l => l.content);
    const deletedContents = hunk.lines
      .filter(l => l.type === ChangeLineType.Delete)
      .map(l => l.content);

    // class 本體內容完全未變，不應該以「新增」身分出現在 diff 中
    // （目前的 bug：class 內容因 index 錯位配對被誤標成新增）
    for (const classLine of classLines) {
      expect(addedContents).not.toContain(classLine);
    }

    // class 本體內容也不應該被標成刪除（真正被刪除的只有 2 行宣告）
    for (const classLine of classLines) {
      expect(deletedContents).not.toContain(classLine);
    }

    // 實際變更只有「刪除 2 行宣告、新增 0 行」，增減行數統計不應膨脹
    expect(result.summary.deletions).toBeLessThanOrEqual(2);
    expect(result.summary.additions).toBe(0);
  });

  it('對照組：逐行內容真正改寫（無行數位移）時，仍應正確標記為刪除+新增', () => {
    const oldLine1 = 'const a = 1;';
    const oldLine2 = 'const b = 2;';
    const newLine1 = 'const a = 100;';
    const newLine2 = 'const b = 200;';

    const oldContent = [oldLine1, oldLine2].join('\n');
    const newContent = [newLine1, newLine2].join('\n');

    const changes: LineChange[] = [
      { line: 1, oldContent, newContent }
    ];

    const fileChange: FileChangeInput = {
      filePath: 'src/rewritten.ts',
      originalContent: oldContent,
      changes
    };

    const input: PreviewInput = {
      command: PreviewCommand.Refactor,
      success: true,
      fileChanges: [fileChange]
    };

    const result = generatePreviewResult(input, 3);
    const hunk = result.files[0].hunks[0];

    const addedContents = hunk.lines
      .filter(l => l.type === ChangeLineType.Add)
      .map(l => l.content);
    const deletedContents = hunk.lines
      .filter(l => l.type === ChangeLineType.Delete)
      .map(l => l.content);

    expect(deletedContents).toEqual([oldLine1, oldLine2]);
    expect(addedContents).toEqual([newLine1, newLine2]);
    expect(result.summary.deletions).toBe(2);
    expect(result.summary.additions).toBe(2);
  });
});
