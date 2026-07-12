/**
 * ChangeApplicator 測試
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeApplicator } from '@infrastructure/changeset/change-applicator.js';
import type { IFileSystem, DirectoryEntry } from '@infrastructure/storage/file-system.interface.js';
import { ChangesetCommand, FileOperationType, type Changeset } from '@infrastructure/changeset/types.js';

describe('ChangeApplicator', () => {
  // MARK: - Test Fixtures

  let mockFileSystem: IFileSystem;
  let sut: ChangeApplicator;

  const createMockFileSystem = (): IFileSystem => ({
    exists: vi.fn().mockResolvedValue(true),
    readFile: vi.fn().mockResolvedValue('original content'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    moveFile: vi.fn().mockResolvedValue(undefined),
    isDirectory: vi.fn().mockResolvedValue(false),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    readDirectory: vi.fn().mockResolvedValue([]),
    deleteDirectory: vi.fn().mockResolvedValue(undefined),
    getFilePath: vi.fn().mockImplementation((p) => p),
    getRelativePath: vi.fn().mockImplementation((p) => p),
    isAbsolutePath: vi.fn().mockReturnValue(true),
    joinPath: vi.fn().mockImplementation((...paths) => paths.join('/'))
  });

  const createTestRange = (startLine: number, startCol: number, endLine: number, endCol: number) => ({
    start: { line: startLine, column: startCol },
    end: { line: endLine, column: endCol }
  });

  const createChangeset = (overrides: Partial<Changeset> = {}): Changeset => ({
    textChanges: [],
    fileOperations: [],
    description: 'test',
    command: ChangesetCommand.Rename,
    success: true,
    ...overrides
  });

  beforeEach(() => {
    mockFileSystem = createMockFileSystem();
    sut = new ChangeApplicator(mockFileSystem);
  });

  // MARK: - Dry Run

  describe('dry-run 模式', () => {
    it('應該不實際寫入檔案', async () => {
      const changeset = createChangeset({
        textChanges: [{ filePath: '/file.ts', edits: [] }]
      });

      const result = await sut.apply(changeset, { dryRun: true });

      expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('應該正確回報將被修改的檔案', async () => {
      const changeset = createChangeset({
        textChanges: [
          { filePath: '/file1.ts', edits: [] },
          { filePath: '/file2.ts', edits: [] }
        ]
      });

      const result = await sut.apply(changeset, { dryRun: true });

      expect(result.modifiedFiles).toEqual(['/file1.ts', '/file2.ts']);
    });

    it('應該正確回報將被建立的檔案', async () => {
      const changeset = createChangeset({
        fileOperations: [
          { type: FileOperationType.Create, sourcePath: '/new.ts', targetPath: '/new.ts', content: '' }
        ]
      });

      const result = await sut.apply(changeset, { dryRun: true });

      expect(result.createdFiles).toEqual(['/new.ts']);
    });

    it('應該正確回報將被刪除的檔案', async () => {
      const changeset = createChangeset({
        fileOperations: [
          { type: FileOperationType.Delete, sourcePath: '/old.ts' }
        ]
      });

      const result = await sut.apply(changeset, { dryRun: true });

      expect(result.deletedFiles).toEqual(['/old.ts']);
    });

    it('應該正確回報將被移動的檔案', async () => {
      const changeset = createChangeset({
        fileOperations: [
          { type: FileOperationType.Move, sourcePath: '/old.ts', targetPath: '/new.ts' }
        ]
      });

      const result = await sut.apply(changeset, { dryRun: true });

      expect(result.movedFiles).toEqual([{ from: '/old.ts', to: '/new.ts' }]);
    });
  });

  // MARK: - 文字變更

  describe('文字變更', () => {
    it('應該讀取檔案並應用編輯', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('const foo = 1;');

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/file.ts',
          edits: [{ range: createTestRange(1, 7, 1, 10), newText: 'bar' }]
        }]
      });

      await sut.apply(changeset);

      expect(mockFileSystem.readFile).toHaveBeenCalledWith('/file.ts', 'utf-8');
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/file.ts',
        'const bar = 1;',
        { fsync: true }
      );
    });

    it('空編輯列表應保持原內容', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('original');

      const changeset = createChangeset({
        textChanges: [{ filePath: '/file.ts', edits: [] }]
      });

      await sut.apply(changeset);

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/file.ts',
        'original',
        { fsync: true }
      );
    });

    it('應該處理多行內容的編輯', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('line1\nline2\nline3');

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/file.ts',
          edits: [{ range: createTestRange(2, 1, 2, 6), newText: 'modified' }]
        }]
      });

      await sut.apply(changeset);

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/file.ts',
        'line1\nmodified\nline3',
        { fsync: true }
      );
    });

    it('應該從後往前應用多個編輯避免偏移', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('aaa bbb ccc');

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/file.ts',
          edits: [
            { range: createTestRange(1, 1, 1, 4), newText: 'xxx' },
            { range: createTestRange(1, 9, 1, 12), newText: 'zzz' }
          ]
        }]
      });

      await sut.apply(changeset);

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/file.ts',
        'xxx bbb zzz',
        { fsync: true }
      );
    });

    it('空內容檔案應正確處理', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('');

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/file.ts',
          edits: [{ range: createTestRange(1, 1, 1, 1), newText: 'new content' }]
        }]
      });

      await sut.apply(changeset);

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/file.ts',
        'new content',
        { fsync: true }
      );
    });
  });

  // MARK: - 檔案操作

  describe('檔案操作', () => {
    describe('create', () => {
      it('應該建立新檔案', async () => {
        const changeset = createChangeset({
          fileOperations: [{
            type: FileOperationType.Create,
            sourcePath: '/new.ts',
            targetPath: '/new.ts',
            content: 'new file content'
          }]
        });

        await sut.apply(changeset);

        expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
          '/new.ts',
          'new file content',
          { fsync: true }
        );
      });

      it('無 content 時應建立空檔案', async () => {
        const changeset = createChangeset({
          fileOperations: [{
            type: FileOperationType.Create,
            sourcePath: '/new.ts',
            targetPath: '/new.ts'
          }]
        });

        await sut.apply(changeset);

        expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
          '/new.ts',
          '',
          { fsync: true }
        );
      });

      it('無 targetPath 時應拋出錯誤', async () => {
        const changeset = createChangeset({
          fileOperations: [{
            type: FileOperationType.Create,
            sourcePath: '/new.ts'
          }]
        });

        const result = await sut.apply(changeset);

        expect(result.success).toBe(false);
        expect(result.errors?.[0]).toContain('CREATE 操作需要 targetPath');
      });
    });

    describe('delete', () => {
      it('應該刪除檔案', async () => {
        const changeset = createChangeset({
          fileOperations: [{ type: FileOperationType.Delete, sourcePath: '/old.ts' }]
        });

        await sut.apply(changeset);

        expect(mockFileSystem.deleteFile).toHaveBeenCalledWith('/old.ts');
      });
    });

    describe('move', () => {
      it('應該移動檔案', async () => {
        vi.mocked(mockFileSystem.isDirectory).mockResolvedValue(false);

        const changeset = createChangeset({
          fileOperations: [{
            type: FileOperationType.Move,
            sourcePath: '/old.ts',
            targetPath: '/new.ts'
          }]
        });

        await sut.apply(changeset);

        expect(mockFileSystem.moveFile).toHaveBeenCalledWith('/old.ts', '/new.ts');
      });

      it('無 targetPath 時應拋出錯誤', async () => {
        const changeset = createChangeset({
          fileOperations: [{
            type: FileOperationType.Move,
            sourcePath: '/old.ts'
          }]
        });

        const result = await sut.apply(changeset);

        expect(result.success).toBe(false);
        expect(result.errors?.[0]).toContain('MOVE 操作需要 targetPath');
      });

      it('目錄移動應遞迴處理', async () => {
        vi.mocked(mockFileSystem.isDirectory).mockResolvedValue(true);
        vi.mocked(mockFileSystem.readDirectory).mockResolvedValue([
          { path: '/old/file.ts', name: 'file.ts', isFile: true, isDirectory: false }
        ] as DirectoryEntry[]);

        const changeset = createChangeset({
          fileOperations: [{
            type: FileOperationType.Move,
            sourcePath: '/old',
            targetPath: '/new'
          }]
        });

        await sut.apply(changeset);

        expect(mockFileSystem.createDirectory).toHaveBeenCalledWith('/new', true);
        expect(mockFileSystem.moveFile).toHaveBeenCalledWith('/old/file.ts', '/new/file.ts');
        expect(mockFileSystem.deleteDirectory).toHaveBeenCalledWith('/old');
      });
    });
  });

  // MARK: - 備份與回滾

  describe('備份與回滾', () => {
    it('文字變更失敗時應回滾', async () => {
      vi.mocked(mockFileSystem.readFile)
        .mockResolvedValueOnce('backup content')
        .mockRejectedValueOnce(new Error('讀取失敗'));

      const changeset = createChangeset({
        textChanges: [
          { filePath: '/file1.ts', edits: [] },
          { filePath: '/file2.ts', edits: [] }
        ]
      });

      const result = await sut.apply(changeset, { rollbackOnError: true });

      expect(result.success).toBe(false);
      // 應該嘗試回滾 file1.ts
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith('/file1.ts', 'backup content');
    });

    it('rollbackOnError=false 時不應回滾', async () => {
      vi.mocked(mockFileSystem.readFile)
        .mockResolvedValueOnce('content1')
        .mockRejectedValueOnce(new Error('讀取失敗'));

      const changeset = createChangeset({
        textChanges: [
          { filePath: '/file1.ts', edits: [] },
          { filePath: '/file2.ts', edits: [] }
        ]
      });

      const result = await sut.apply(changeset, { rollbackOnError: false });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      // 只應該有第一個檔案的寫入，不應有回滾的寫入
    });

    it('後續檔案操作失敗時應刪除已建立的檔案', async () => {
      vi.mocked(mockFileSystem.exists).mockResolvedValue(true);

      const changeset = createChangeset({
        fileOperations: [
          {
            type: FileOperationType.Create,
            sourcePath: '/created.ts',
            targetPath: '/created.ts',
            content: 'new content'
          },
          {
            type: FileOperationType.Create,
            sourcePath: '/invalid.ts'
          }
        ]
      });

      const result = await sut.apply(changeset, { rollbackOnError: true });

      expect(result.success).toBe(false);
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/created.ts',
        'new content',
        { fsync: true }
      );
      expect(mockFileSystem.deleteFile).toHaveBeenCalledWith('/created.ts');
      expect(result.createdFiles).toEqual([]);
    });

    it('後續檔案操作失敗時應還原已移動的檔案', async () => {
      vi.mocked(mockFileSystem.exists).mockResolvedValue(true);
      vi.mocked(mockFileSystem.isDirectory).mockResolvedValue(false);
      vi.mocked(mockFileSystem.readFile).mockImplementation(async (filePath) => {
        if (filePath === '/old.ts') {
          return 'old content';
        }
        return '';
      });

      const changeset = createChangeset({
        fileOperations: [
          {
            type: FileOperationType.Move,
            sourcePath: '/old.ts',
            targetPath: '/new.ts'
          },
          {
            type: FileOperationType.Move,
            sourcePath: '/invalid.ts'
          }
        ]
      });

      const result = await sut.apply(changeset, { rollbackOnError: true });

      expect(result.success).toBe(false);
      expect(mockFileSystem.moveFile).toHaveBeenCalledWith('/old.ts', '/new.ts');
      expect(mockFileSystem.deleteFile).toHaveBeenCalledWith('/new.ts');
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith('/old.ts', 'old content');
      expect(result.movedFiles).toEqual([]);
    });

    it('後續檔案操作失敗時應同時還原文字變更與檔案移動', async () => {
      vi.mocked(mockFileSystem.exists).mockResolvedValue(true);
      vi.mocked(mockFileSystem.isDirectory).mockResolvedValue(false);
      vi.mocked(mockFileSystem.readFile).mockImplementation(async (filePath) => {
        if (filePath === '/consumer.ts') {
          return 'import { value } from \'./old\';\n';
        }
        if (filePath === '/old.ts') {
          return 'export const value = 1;\n';
        }
        return '';
      });

      const changeset = createChangeset({
        textChanges: [
          {
            filePath: '/consumer.ts',
            edits: [
              {
                range: createTestRange(1, 24, 1, 29),
                newText: './new'
              }
            ]
          }
        ],
        fileOperations: [
          {
            type: FileOperationType.Move,
            sourcePath: '/old.ts',
            targetPath: '/new.ts'
          },
          {
            type: FileOperationType.Create,
            sourcePath: '/invalid.ts'
          }
        ]
      });

      const result = await sut.apply(changeset, { rollbackOnError: true });

      expect(result.success).toBe(false);
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/consumer.ts',
        'import { value } from \'./new\';\n',
        { fsync: true }
      );
      expect(mockFileSystem.deleteFile).toHaveBeenCalledWith('/new.ts');
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/old.ts',
        'export const value = 1;\n'
      );
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/consumer.ts',
        'import { value } from \'./old\';\n'
      );
      expect(result.modifiedFiles).toEqual([]);
      expect(result.movedFiles).toEqual([]);
    });
  });

  // MARK: - 結果回報

  describe('結果回報', () => {
    it('成功時應回報所有修改的檔案', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('content');

      const changeset = createChangeset({
        textChanges: [
          { filePath: '/file1.ts', edits: [] },
          { filePath: '/file2.ts', edits: [] }
        ]
      });

      const result = await sut.apply(changeset);

      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toEqual(['/file1.ts', '/file2.ts']);
    });

    it('成功時應回報所有建立的檔案', async () => {
      const changeset = createChangeset({
        fileOperations: [
          { type: FileOperationType.Create, sourcePath: '/new1.ts', targetPath: '/new1.ts', content: '' },
          { type: FileOperationType.Create, sourcePath: '/new2.ts', targetPath: '/new2.ts', content: '' }
        ]
      });

      const result = await sut.apply(changeset);

      expect(result.createdFiles).toEqual(['/new1.ts', '/new2.ts']);
    });

    it('成功時應回報所有刪除的檔案', async () => {
      const changeset = createChangeset({
        fileOperations: [
          { type: FileOperationType.Delete, sourcePath: '/old1.ts' },
          { type: FileOperationType.Delete, sourcePath: '/old2.ts' }
        ]
      });

      const result = await sut.apply(changeset);

      expect(result.deletedFiles).toEqual(['/old1.ts', '/old2.ts']);
    });

    it('成功時應回報所有移動的檔案', async () => {
      vi.mocked(mockFileSystem.isDirectory).mockResolvedValue(false);

      const changeset = createChangeset({
        fileOperations: [
          { type: FileOperationType.Move, sourcePath: '/a.ts', targetPath: '/b.ts' },
          { type: FileOperationType.Move, sourcePath: '/c.ts', targetPath: '/d.ts' }
        ]
      });

      const result = await sut.apply(changeset);

      expect(result.movedFiles).toEqual([
        { from: '/a.ts', to: '/b.ts' },
        { from: '/c.ts', to: '/d.ts' }
      ]);
    });
  });

  // MARK: - atomic 選項

  describe('atomic 選項', () => {
    it('atomic=true 時應使用 fsync', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('content');

      const changeset = createChangeset({
        textChanges: [{ filePath: '/file.ts', edits: [] }]
      });

      await sut.apply(changeset, { atomic: true });

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/file.ts',
        'content',
        { fsync: true }
      );
    });

    it('atomic=false 時不應使用 fsync', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('content');

      const changeset = createChangeset({
        textChanges: [{ filePath: '/file.ts', edits: [] }]
      });

      await sut.apply(changeset, { atomic: false });

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/file.ts',
        'content',
        { fsync: false }
      );
    });
  });

  // MARK: - 重疊 TextEdit 偵測（CA-1 regression）

  describe('重疊 TextEdit 偵測（CA-1）', () => {
    it('範圍部分重疊、內容不同的 edits 不應靜默毀損內容', async () => {
      // content: 'abcdefghij'
      // edit1: col3-6 (0-based offset [2,5)) "cde" -> "X"
      // edit2: col5-8 (0-based offset [4,7)) "efg" -> "Y"
      // 兩者在 offset [4,5)（字元 'e'）重疊，屬衝突編輯
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('abcdefghij');

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/overlap.ts',
          edits: [
            { range: createTestRange(1, 3, 1, 6), newText: 'X' },
            { range: createTestRange(1, 5, 1, 8), newText: 'Y' }
          ]
        }]
      });

      const result = await sut.apply(changeset);

      const writtenContent = vi.mocked(mockFileSystem.writeFile).mock.calls
        .find(call => call[0] === '/overlap.ts')?.[1];

      if (result.success) {
        // 若回報成功，寫入內容不得是重疊編輯互相踩踏產生的毀損結果
        expect(writtenContent).not.toBe('abXhij');
      } else {
        // 至少要明確回報失敗原因，不能默默吞掉
        expect(result.errors?.length ?? 0).toBeGreaterThan(0);
      }
    });

    it('完全相同範圍、相同新文字的重複編輯：不得靜默毀損（要嘛正確 dedupe，要嘛明確報錯）', async () => {
      // content: 'abcdefghij'
      // 兩筆完全相同的 edit：col3-6 "cde" -> "X"
      // 正確結果只能是二選一：
      //   (a) dedupe 後只套用一次 -> 'abXfghij'
      //   (b) 明確回報失敗（success:false + errors）
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('abcdefghij');

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/dup.ts',
          edits: [
            { range: createTestRange(1, 3, 1, 6), newText: 'X' },
            { range: createTestRange(1, 3, 1, 6), newText: 'X' }
          ]
        }]
      });

      const result = await sut.apply(changeset);

      const writtenContent = vi.mocked(mockFileSystem.writeFile).mock.calls
        .find(call => call[0] === '/dup.ts')?.[1];

      if (result.success) {
        expect(writtenContent).toBe('abXfghij');
      } else {
        expect(result.errors?.length ?? 0).toBeGreaterThan(0);
      }
    });
  });

  // MARK: - 空內容快速路徑繞過 dedupe regression（C4）

  describe('空內容快速路徑繞過 dedupe（C4）', () => {
    it('空內容時完全相同的重複零寬插入編輯應 dedupe 為一筆，而非各自套用', async () => {
      // applyEdits 對空內容（content === ''）有獨立快速路徑（直接 join 所有 newText），
      // 繞過 dedupeIdenticalEdits：完全相同的重複編輯在非空內容路徑會被 dedupe 為冪等的一筆，
      // 但空內容路徑目前會把兩筆完全相同的編輯都套用，導致內容重複
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('');

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/empty.ts',
          edits: [
            { range: createTestRange(1, 1, 1, 1), newText: 'x' },
            { range: createTestRange(1, 1, 1, 1), newText: 'x' }
          ]
        }]
      });

      await sut.apply(changeset);

      // 正確行為：與非空內容路徑一致，完全相同的重複編輯視為冪等操作，dedupe 後只套用一次
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/empty.ts',
        'x',
        { fsync: true }
      );
    });
  });

  // MARK: - 排序缺 tiebreak regression（C5）

  describe('applyEdits 排序缺 tiebreak（C5）', () => {
    it('輸入順序為 [零寬插入, 整段替換] 時，同起點編輯結果不應依賴輸入順序', async () => {
      // 排序只比較 range.start（第 312-319 行），同起點時無 tiebreak，
      // 依賴 Array.prototype.sort 的穩定排序保留輸入順序 —— 但這會讓「從後往前套用」
      // 在同起點時把先出現的零寬插入誤置於後套用的整段替換之後，導致插入內容被替換蓋掉、
      // 甚至吃掉不該吃的字元
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('abc');

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/tie1.ts',
          edits: [
            { range: createTestRange(1, 1, 1, 1), newText: 'I' },
            { range: createTestRange(1, 1, 1, 4), newText: 'X' }
          ]
        }]
      });

      await sut.apply(changeset);

      // 正確行為：同起點時零寬插入須保留在整段替換結果之前，輸出應為 'IX'
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/tie1.ts',
        'IX',
        { fsync: true }
      );
    });

    it('輸入順序為 [整段替換, 零寬插入] 時，同起點編輯結果不應依賴輸入順序', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('abc');

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/tie2.ts',
          edits: [
            { range: createTestRange(1, 1, 1, 4), newText: 'X' },
            { range: createTestRange(1, 1, 1, 1), newText: 'I' }
          ]
        }]
      });

      await sut.apply(changeset);

      // 兩種輸入順序都必須得到相同結果 'IX'，不得因輸入順序不同而改變輸出
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/tie2.ts',
        'IX',
        { fsync: true }
      );
    });
  });

  // MARK: - 邊界情況

  describe('邊界情況', () => {
    it('空 changeset 應成功', async () => {
      const changeset = createChangeset();

      const result = await sut.apply(changeset);

      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toEqual([]);
      expect(result.createdFiles).toEqual([]);
      expect(result.deletedFiles).toEqual([]);
      expect(result.movedFiles).toEqual([]);
    });

    it('檔案不存在時備份應處理', async () => {
      vi.mocked(mockFileSystem.exists).mockResolvedValue(false);
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('');

      const changeset = createChangeset({
        textChanges: [{ filePath: '/new.ts', edits: [] }]
      });

      const result = await sut.apply(changeset);

      expect(result.success).toBe(true);
    });
  });
});
