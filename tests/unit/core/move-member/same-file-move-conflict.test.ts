/**
 * Regression: 同檔案內移動成員（source file === target file）不應觸發
 * ChangesetBuilder 的「衝突的 TextEdit」錯誤。
 *
 * 根因：buildChangeset 對 sourceFileChange 與 targetFileChange 各自產生一筆
 * 涵蓋整份檔案的整檔替換 TextEdit；當來源檔與目標檔是同一個檔案時，兩筆
 * range 完全相同但 newText 不同（一筆是移除後的內容、一筆是插入後的內容），
 * ChangesetBuilder.addTextChange 合併同檔變更時偵測到同 range 不同內容即視為
 * 衝突並拋錯，導致同檔內移動成員必然失敗。
 */

import { describe, expect, it } from 'vitest';
import { MoveMemberEngine } from '@core/move-member/move-member-engine.js';
import { MoveTargetType } from '@core/move-member/types.js';
import type { MoveMemberOptions } from '@core/move-member/types.js';
import { createMockFileSystem, createMockParserRegistry } from '../_helpers/mock-factories.js';

describe('MoveMemberEngine - 同檔案內移動成員', () => {
  const sourceCode = [
    'export function alpha() {',
    '  return 1;',
    '}',
    '',
    'export function beta() {',
    '  return 2;',
    '}',
    ''
  ].join('\n');

  function makeOptions(overrides?: Partial<MoveMemberOptions>): MoveMemberOptions {
    return {
      sourceFile: '/src/a.ts',
      memberName: 'alpha',
      target: {
        type: MoveTargetType.ExistingFile,
        filePath: '/src/a.ts'
      },
      projectRoot: '/src',
      preview: true,
      ...overrides
    };
  }

  it('generateChangeset 應成功產生單一、無衝突的整檔變更，而非拋出衝突的 TextEdit 錯誤', async () => {
    const mockFs = createMockFileSystem({ '/src/a.ts': sourceCode });
    const engine = new MoveMemberEngine(createMockParserRegistry(), mockFs);

    const changeset = await engine.generateChangeset(makeOptions());

    expect(changeset.success).toBe(true);
    expect(changeset.errors).toBeUndefined();

    // 同一個檔案只應該有一筆 FileTextChange（source/target 合併），而非兩筆
    // 互相衝突或重複套用到同一個檔案的變更。
    const changesForFile = changeset.textChanges.filter(change => change.filePath === '/src/a.ts');
    expect(changesForFile).toHaveLength(1);

    const [fileChange] = changesForFile;
    expect(fileChange.edits).toHaveLength(1);

    const finalContent = fileChange.edits[0].newText;

    // alpha 被移動、beta 維持原位：搬移後的內容必須「各自恰好出現一次」，
    // 不能因為兩筆整檔編輯衝突合併而遺失或重複任何一個成員。
    expect(finalContent.match(/function alpha\(\)/g)).toHaveLength(1);
    expect(finalContent.match(/function beta\(\)/g)).toHaveLength(1);

    // 預設插入位置是檔案結尾（沒有指定 insertPosition），所以 beta 應該在
    // alpha 之前 —— alpha 從檔案開頭被搬到檔案結尾。
    expect(finalContent.indexOf('function beta')).toBeLessThan(finalContent.indexOf('function alpha'));
  });

  it('moveMember 實際執行（preview: false）不應拋出例外，且寫入的內容正確', async () => {
    const mockFs = createMockFileSystem({ '/src/a.ts': sourceCode });
    const engine = new MoveMemberEngine(createMockParserRegistry(), mockFs);

    const result = await engine.moveMember(makeOptions({ preview: false }));

    expect(result.success).toBe(true);
    if (!result.success) {return;}
    expect(result.executed).toBe(true);

    const writeFileMock = mockFs.writeFile as unknown as { mock: { calls: unknown[][] } };
    const writeCallsForFile = writeFileMock.mock.calls.filter(call => call[0] === '/src/a.ts');
    expect(writeCallsForFile).toHaveLength(1);

    const writtenContent = writeCallsForFile[0][1] as string;
    expect(writtenContent.match(/function alpha\(\)/g)).toHaveLength(1);
    expect(writtenContent.match(/function beta\(\)/g)).toHaveLength(1);
    expect(writtenContent.indexOf('function beta')).toBeLessThan(writtenContent.indexOf('function alpha'));
  });
});
