/**
 * Changeset Converter 測試
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { convertChangesetToPreviewInput } from '@infrastructure/changeset/changeset-converter.js';
import { PreviewCommand } from '@infrastructure/formatters/types.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { ChangesetCommand, FileOperationType, type Changeset } from '@infrastructure/changeset/types.js';

describe('convertChangesetToPreviewInput', () => {
  // MARK: - Test Fixtures

  let mockFileSystem: IFileSystem;

  const createMockFileSystem = (): IFileSystem => ({
    exists: vi.fn().mockResolvedValue(true),
    readFile: vi.fn().mockResolvedValue(''),
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
  });

  // MARK: - 命令類型映射

  describe('命令類型映射', () => {
    interface CommandMappingTestCase {
      scenario: string;
      command: Changeset['command'];
      expected: PreviewCommand;
    }

    it.each<CommandMappingTestCase>([
      { scenario: 'rename', command: ChangesetCommand.Rename, expected: PreviewCommand.Rename },
      { scenario: 'move', command: ChangesetCommand.Move, expected: PreviewCommand.Move },
      { scenario: 'move-member', command: ChangesetCommand.MoveMember, expected: PreviewCommand.Move },
      { scenario: 'deadcode', command: ChangesetCommand.Deadcode, expected: PreviewCommand.DeadCodeRemoval },
      { scenario: 'change-signature', command: ChangesetCommand.ChangeSignature, expected: PreviewCommand.Refactor }
    ])('應該將 $scenario 映射為 $expected', async ({ command, expected }) => {
      const changeset = createChangeset({ command });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.command).toBe(expected);
    });
  });

  // MARK: - 基本轉換

  describe('基本轉換', () => {
    it('應該保留 success 狀態', async () => {
      const changeset = createChangeset({ success: true });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.success).toBe(true);
    });

    it('應該保留 operationDescription', async () => {
      const changeset = createChangeset({ description: '重命名 foo 為 bar' });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.operationDescription).toBe('重命名 foo 為 bar');
    });

    it('應該轉換 errors', async () => {
      const changeset = createChangeset({
        success: false,
        errors: ['錯誤 1', '錯誤 2']
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.errors).toEqual(['錯誤 1', '錯誤 2']);
    });

    it('無錯誤時 errors 應為 undefined', async () => {
      const changeset = createChangeset({ success: true });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.errors).toBeUndefined();
    });

    it('conflicts 應永遠為陣列（不為 undefined）', async () => {
      const changeset = createChangeset();

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.conflicts).toEqual([]);
    });
  });

  // MARK: - 警告轉換

  describe('警告轉換為 conflicts', () => {
    it('應該解析 type:message 格式', async () => {
      const changeset = createChangeset({
        warnings: ['reserved_keyword:function 是保留字']
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toEqual({
        type: 'reserved_keyword',
        message: 'function 是保留字',
        filePath: null,
        line: null
      });
    });

    it('無法解析時應使用 unknown 類型', async () => {
      const changeset = createChangeset({
        warnings: ['這是一個沒有冒號的警告']
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.conflicts[0]).toEqual({
        type: 'unknown',
        message: '這是一個沒有冒號的警告',
        filePath: null,
        line: null
      });
    });

    it('多個警告應全部轉換', async () => {
      const changeset = createChangeset({
        warnings: [
          'type1:訊息 1',
          'type2:訊息 2'
        ]
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.conflicts).toHaveLength(2);
    });
  });

  // MARK: - 文字變更轉換

  describe('文字變更轉換', () => {
    it('應該轉換單行編輯', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('const foo = 1;');

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/file.ts',
          edits: [{ range: createTestRange(1, 7, 1, 10), newText: 'bar' }]
        }]
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.fileChanges).toHaveLength(1);
      expect(result.fileChanges[0].filePath).toBe('/file.ts');
      expect(result.fileChanges[0].changes).toHaveLength(1);
      expect(result.fileChanges[0].changes[0]).toEqual({
        line: 1,
        oldContent: 'const foo = 1;',
        newContent: 'const bar = 1;'
      });
    });

    it('應該跳過無實際變更的編輯', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('const foo = 1;');

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/file.ts',
          edits: [{ range: createTestRange(1, 7, 1, 10), newText: 'foo' }]
        }]
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      // 內容未改變，不應產生 change
      expect(result.fileChanges).toHaveLength(0);
    });

    it('應該處理多行內容', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('line1\nline2\nline3');

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/file.ts',
          edits: [{ range: createTestRange(2, 1, 2, 6), newText: 'modified' }]
        }]
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.fileChanges[0].changes[0]).toEqual({
        line: 2,
        oldContent: 'line2',
        newContent: 'modified'
      });
    });

    it('同一行多個編輯應合併處理', async () => {
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

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.fileChanges[0].changes).toHaveLength(1);
      expect(result.fileChanges[0].changes[0].newContent).toBe('xxx bbb zzz');
    });

    it('檔案不存在時應使用空內容', async () => {
      vi.mocked(mockFileSystem.exists).mockResolvedValue(false);

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/new.ts',
          edits: [{ range: createTestRange(1, 1, 1, 1), newText: 'new content' }]
        }]
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.fileChanges[0].originalContent).toBe('');
    });
  });

  // MARK: - 跨行編輯

  describe('跨行編輯轉換', () => {
    it('應該處理刪除多行', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('line1\nline2\nline3\nline4');

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/file.ts',
          edits: [{
            range: createTestRange(2, 1, 3, 6),
            newText: ''
          }]
        }]
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      // 應該有起始行的修改和結束行的刪除
      expect(result.fileChanges[0].changes.length).toBeGreaterThan(0);
    });

    it('應該處理插入多行內容', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('line1\nline2');

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/file.ts',
          edits: [{
            range: createTestRange(1, 6, 1, 6),
            newText: '\nnew1\nnew2'
          }]
        }]
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.fileChanges[0].changes.length).toBeGreaterThan(0);
    });
  });

  // MARK: - 假變更行 regression（deadcode 整行刪除接續 unchanged 行）

  describe('假變更行 regression：跨行刪除接續 unchanged 行（LSP exclusive end, endCol=1）', () => {
    it('刪除前兩行（函式宣告＋尾隨空行）不應把第三行 unchanged 內容假造成變更', async () => {
      // 模擬 deadcode 刪除 dead() 函式：其後緊接一個空白行，
      // range-expander 會把 range 擴展到吞掉該空行，
      // end 落在下一行（keep() 那行）的 column 1 —— LSP exclusive end，
      // 意即「刪除到此列之前」，keep() 那行本身應維持不變、不出現在任何 change 中。
      const deadLine = 'function dead() { return 1; }';
      const blankLine = '';
      const keepLine = 'export function keep() { return 2; }';
      vi.mocked(mockFileSystem.readFile).mockResolvedValue(
        `${deadLine}\n${blankLine}\n${keepLine}`
      );

      const changeset = createChangeset({
        command: ChangesetCommand.Deadcode,
        textChanges: [{
          filePath: '/a.ts',
          edits: [{ range: createTestRange(1, 1, 3, 1), newText: '' }]
        }]
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);
      const changes = result.fileChanges[0].changes;

      // 正確行為：只有 line1、line2 被刪除，line3（keep，unchanged）不應出現在任何 change 中
      expect(changes).toHaveLength(2);
      expect(
        changes.some(c => c.oldContent === keepLine || c.newContent === keepLine)
      ).toBe(false);
      expect(changes.find(c => c.line === 3)).toBeUndefined();

      // line1 應為純刪除，不應把 line3 內容 reattach 成 newContent（假新增行）
      expect(changes[0]).toEqual({ line: 1, oldContent: deadLine, newContent: null });
      expect(changes[1]).toEqual({ line: 2, oldContent: blankLine, newContent: null });

      // 統計不應虛增：只有 2 筆刪除、0 筆新增
      const deletions = changes.filter(c => c.newContent === null).length;
      const additions = changes.filter(c => c.oldContent === null).length;
      expect(deletions).toBe(2);
      expect(additions).toBe(0);
    });
  });

  // MARK: - 檔案操作轉換

  describe('檔案操作轉換', () => {
    it('create 操作應轉換為全部新增行', async () => {
      const changeset = createChangeset({
        fileOperations: [{
          type: FileOperationType.Create,
          sourcePath: '/new.ts',
          targetPath: '/new.ts',
          content: 'line1\nline2'
        }]
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.fileChanges).toHaveLength(1);
      expect(result.fileChanges[0].changes).toEqual([
        { line: 1, oldContent: null, newContent: 'line1' },
        { line: 2, oldContent: null, newContent: 'line2' }
      ]);
    });

    it('delete 操作應轉換為全部刪除行', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue('line1\nline2');

      const changeset = createChangeset({
        fileOperations: [{
          type: FileOperationType.Delete,
          sourcePath: '/old.ts'
        }]
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.fileChanges).toHaveLength(1);
      expect(result.fileChanges[0].changes).toEqual([
        { line: 1, oldContent: 'line1', newContent: null },
        { line: 2, oldContent: 'line2', newContent: null }
      ]);
    });

    it('move 操作應被忽略（由 CLI 層處理）', async () => {
      const changeset = createChangeset({
        fileOperations: [{
          type: FileOperationType.Move,
          sourcePath: '/old.ts',
          targetPath: '/new.ts'
        }]
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.fileChanges).toHaveLength(0);
    });

    it('空 content 的 create 應建立空檔案', async () => {
      const changeset = createChangeset({
        fileOperations: [{
          type: FileOperationType.Create,
          sourcePath: '/empty.ts',
          targetPath: '/empty.ts',
          content: ''
        }]
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.fileChanges[0].changes).toEqual([
        { line: 1, oldContent: null, newContent: '' }
      ]);
    });
  });

  // MARK: - 邊界情況

  describe('邊界情況', () => {
    it('空 changeset 應正確轉換', async () => {
      const changeset = createChangeset();

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.fileChanges).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });

    it('空編輯列表應不產生 fileChange', async () => {
      const changeset = createChangeset({
        textChanges: [{ filePath: '/file.ts', edits: [] }]
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.fileChanges).toHaveLength(0);
    });

    it('Buffer 內容應正確轉換為字串', async () => {
      vi.mocked(mockFileSystem.readFile).mockResolvedValue(Buffer.from('buffer content'));

      const changeset = createChangeset({
        textChanges: [{
          filePath: '/file.ts',
          edits: [{ range: createTestRange(1, 1, 1, 7), newText: 'changed' }]
        }]
      });

      const result = await convertChangesetToPreviewInput(changeset, mockFileSystem);

      expect(result.fileChanges[0].originalContent).toBe('buffer content');
    });
  });
});
