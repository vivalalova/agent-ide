/**
 * Regression：兩筆零寬插入落在完全相同位置時，dry-run 預覽與實際 apply 必須產生一致結果
 *
 * Bug（對抗式審查發現）：
 * - changeset-converter.ts 的 mergeAdjacentEdits 會把同位置的零寬插入依輸入順序串接
 *   （insert 'A' 後 insert 'B' → 顯示 "AB"）
 * - apply-text-edits.ts 的 applyTextEdits 對完全相同 range 的編輯，排序 tie-break 全部
 *   打平（回傳 0，stable sort 保留輸入順序），但套用迴圈是「從後往前疊字串」，同一 offset
 *   重複套用時後處理的編輯會疊在前處理的編輯之前，導致實際寫入結果變成輸入順序的反轉
 *   （"BA"）。
 *
 * 使用者看到的 --dry-run 預覽因此與實際 --apply 寫入的檔案內容不一致。
 */

import { describe, it, expect, vi } from 'vitest';
import { convertChangesetToPreviewInput } from '@infrastructure/changeset/changeset-converter.js';
import { applyTextEdits } from '@infrastructure/changeset/apply-text-edits.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import {
  ChangesetCommand,
  TextEditOperationType,
  type Changeset,
  type TextEdit
} from '@infrastructure/changeset/types.js';

describe('preview 與 apply 對「同位置零寬插入」順序一致性', () => {
  const filePath = '/project/file.ts';
  const originalContent = 'XY';

  // 兩筆零寬插入落在完全相同位置（line 1, column 1），輸入順序為先 A 後 B
  const samePositionEdits: TextEdit[] = [
    {
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
      newText: 'A'
    },
    {
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
      newText: 'B'
    }
  ];

  const createMockFileSystem = (content: string): IFileSystem => ({
    exists: vi.fn().mockResolvedValue(true),
    readFile: vi.fn().mockResolvedValue(content),
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
        edits: samePositionEdits,
        operationType: TextEditOperationType.Insert
      }
    ],
    fileOperations: [],
    description: 'test',
    command: ChangesetCommand.Rename,
    success: true
  });

  it('實際 apply 應保留輸入順序（先列出的插入排在前面）', () => {
    const result = applyTextEdits(originalContent, samePositionEdits);
    expect(result).toBe('ABXY');
  });

  it('dry-run 預覽顯示的新內容應與實際 apply 寫入的內容一致', async () => {
    const fileSystem = createMockFileSystem(originalContent);
    const changeset = buildChangeset();

    const previewInput = await convertChangesetToPreviewInput(changeset, fileSystem);
    const fileChange = previewInput.fileChanges.find(fc => fc.filePath === filePath);
    expect(fileChange).toBeDefined();

    // 該行只會有一筆 change（同起點編輯已被合併呈現）
    const lineChange = fileChange?.changes.find(c => c.line === 1);
    expect(lineChange).toBeDefined();
    const previewNewContent = lineChange?.newContent;

    const actualApplied = applyTextEdits(originalContent, samePositionEdits);

    expect(previewNewContent).toBe(actualApplied);
  });
});
