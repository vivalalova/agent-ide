/**
 * F15 P3 — Create 預覽 originalContent 為空（reproduction，先紅後綠）
 *
 * convertFileOperation 對 FileOperationType.Create 一律 originalContent: ''。
 * 目標檔已存在時，preview 應顯示將被覆蓋的原文（讓使用者在 dry-run 看到 diff），
 * 而非空字串假裝「新建到空白檔」。
 */

import { describe, it, expect, vi } from 'vitest';
import { convertChangesetToPreviewInput } from '@infrastructure/changeset/changeset-converter.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { ChangesetCommand, FileOperationType, type Changeset } from '@infrastructure/changeset/types.js';

describe('F15：Create 預覽在目標已存在時應帶原文', () => {
  it('目標檔已存在時 originalContent 應為現有內容，非空字串', async () => {
    const existing = [
      'export function old() {',
      "  return 'will-be-overwritten';",
      '}',
      ''
    ].join('\n');

    const mockFileSystem: IFileSystem = {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue(existing),
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
    };

    const newContent = "export function next() { return 1; }\n";
    const changeset: Changeset = {
      textChanges: [],
      fileOperations: [
        {
          type: FileOperationType.Create,
          sourcePath: '/project/src/target-f15.ts',
          targetPath: '/project/src/target-f15.ts',
          content: newContent
        }
      ],
      description: 'create overwrite existing',
      command: ChangesetCommand.Move,
      success: true
    };

    const preview = await convertChangesetToPreviewInput(changeset, mockFileSystem);
    const file = preview.fileChanges.find(f => f.filePath.includes('target-f15'));
    expect(file).toBeDefined();

    // Bug：目前 Create 固定 originalContent: ''，已存在檔的原文被抹成空白
    expect(file!.originalContent).toBe(existing);
    expect(file!.originalContent).not.toBe('');
    expect(file!.originalContent).toContain('will-be-overwritten');
  });
});
