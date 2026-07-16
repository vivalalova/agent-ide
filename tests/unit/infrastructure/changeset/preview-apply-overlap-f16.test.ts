/**
 * F16 P3 — 預覽丟 overlap vs apply throw 語意不一致（reproduction，先紅後綠）
 *
 * applyTextEdits / ChangeApplicator.apply 對跨行重疊 TextEdit 會 throw / fail。
 * convertChangesetToPreviewInput 只做 mergeAdjacent（相鄰融合），不檢查重疊，
 * 可能靜默產出不完整預覽或 success:true 的假 diff。
 *
 * 正確：preview 與 apply 語意一致——都 fail，或都完整呈現同一終態。
 */

import { describe, it, expect, vi } from 'vitest';
import { convertChangesetToPreviewInput } from '@infrastructure/changeset/changeset-converter.js';
import { ChangeApplicator } from '@infrastructure/changeset/change-applicator.js';
import { applyTextEdits } from '@infrastructure/changeset/apply-text-edits.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import {
  ChangesetCommand,
  TextEditOperationType,
  type Changeset,
  type TextEdit
} from '@infrastructure/changeset/types.js';

describe('F16：跨行 overlap 的 preview 與 apply 語意一致', () => {
  const filePath = '/project/src/overlap-f16.ts';
  const originalContent = [
    'line1 alpha',
    'line2 beta',
    'line3 gamma',
    ''
  ].join('\n');

  // 兩筆嚴格重疊的跨行替換（editA 覆蓋 1-2 行，editB 覆蓋 2-3 行，中間行互踩）
  const overlappingEdits: TextEdit[] = [
    {
      range: {
        start: { line: 1, column: 1 },
        end: { line: 2, column: 12 }
      },
      newText: 'REPLACED_A\n'
    },
    {
      range: {
        start: { line: 2, column: 1 },
        end: { line: 3, column: 12 }
      },
      newText: 'REPLACED_B\n'
    }
  ];

  const createMockFs = (): IFileSystem => ({
    exists: vi.fn().mockResolvedValue(true),
    readFile: vi.fn().mockResolvedValue(originalContent),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    moveFile: vi.fn().mockResolvedValue(undefined),
    isDirectory: vi.fn().mockResolvedValue(false),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    readDirectory: vi.fn().mockResolvedValue([]),
    deleteDirectory: vi.fn().mockResolvedValue(undefined),
    getFilePath: vi.fn().mockImplementation((p: string) => p),
    getRelativePath: vi.fn().mockImplementation((p: string) => p),
    isAbsolutePath: vi.fn().mockReturnValue(true),
    joinPath: vi.fn().mockImplementation((...paths: string[]) => paths.join('/'))
  });

  const buildChangeset = (): Changeset => ({
    textChanges: [
      {
        filePath,
        edits: overlappingEdits,
        operationType: TextEditOperationType.Replace
      }
    ],
    fileOperations: [],
    description: 'overlapping edits',
    command: ChangesetCommand.Rename,
    success: true
  });

  it('applyTextEdits 對重疊編輯應 throw（apply 側 fail）', () => {
    expect(() => applyTextEdits(originalContent, overlappingEdits)).toThrow(/重疊|overlap/i);
  });

  it('preview 不得在 apply 會 throw 的 overlap 上 silent success', async () => {
    const fileSystem = createMockFs();
    const changeset = buildChangeset();

    // apply 路徑：明確失敗
    const applicator = new ChangeApplicator(fileSystem);
    const applyResult = await applicator.apply(changeset, { atomic: true, rollbackOnError: true });
    expect(applyResult.success).toBe(false);

    // preview 路徑：必須同樣 fail（success:false 或 throw），不得 success:true 丟殘缺 diff
    // Bug：目前 convertChangesetToPreviewInput 不檢查 overlap，可能回 success:true
    let previewThrew = false;
    let previewSuccess: boolean | undefined;
    try {
      const preview = await convertChangesetToPreviewInput(changeset, fileSystem);
      previewSuccess = preview.success;
    } catch {
      previewThrew = true;
    }

    const previewFailed = previewThrew || previewSuccess === false;
    expect(previewFailed).toBe(true);
  });
});
