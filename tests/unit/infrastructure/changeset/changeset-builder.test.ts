/**
 * ChangesetBuilder 測試
 */

import { describe, it, expect } from 'vitest';
import { ChangesetBuilder, createChangesetBuilder } from '@infrastructure/changeset/changeset-builder.js';
import { ChangesetCommand, FileOperationType, TextEditOperationType, type Changeset } from '@infrastructure/changeset/types.js';

describe('ChangesetBuilder', () => {
  // MARK: - Test Fixtures

  const createTestRange = (startLine: number, startCol: number, endLine: number, endCol: number) => ({
    start: { line: startLine, column: startCol },
    end: { line: endLine, column: endCol }
  });

  // MARK: - Factory Function

  describe('createChangesetBuilder', () => {
    it('應該建立新的 ChangesetBuilder 實例', () => {
      const builder = createChangesetBuilder();
      expect(builder).toBeInstanceOf(ChangesetBuilder);
    });
  });

  // MARK: - forCommand

  describe('forCommand', () => {
    interface ForCommandTestCase {
      scenario: string;
      command: Changeset['command'];
    }

    it.each<ForCommandTestCase>([
      { scenario: 'rename', command: ChangesetCommand.Rename },
      { scenario: 'move', command: ChangesetCommand.Move },
      { scenario: 'deadcode', command: ChangesetCommand.Deadcode },
      { scenario: 'change-signature', command: ChangesetCommand.ChangeSignature },
      { scenario: 'move-member', command: ChangesetCommand.MoveMember }
    ])('應該設定命令類型為 $scenario', ({ command }) => {
      const changeset = createChangesetBuilder()
        .forCommand(command)
        .build();

      expect(changeset.command).toBe(command);
    });

    it('應該支援鏈式調用', () => {
      const builder = createChangesetBuilder();
      const result = builder.forCommand(ChangesetCommand.Rename);

      expect(result).toBe(builder);
    });
  });

  // MARK: - withDescription

  describe('withDescription', () => {
    it('應該設定變更描述', () => {
      const changeset = createChangesetBuilder()
        .withDescription('重命名 foo 為 bar')
        .build();

      expect(changeset.description).toBe('重命名 foo 為 bar');
    });

    it('空字串描述應被保留', () => {
      const changeset = createChangesetBuilder()
        .withDescription('')
        .build();

      expect(changeset.description).toBe('');
    });

    it('應該支援鏈式調用', () => {
      const builder = createChangesetBuilder();
      const result = builder.withDescription('test');

      expect(result).toBe(builder);
    });
  });

  // MARK: - addTextChange

  describe('addTextChange', () => {
    it('應該新增單一檔案變更', () => {
      const edits = [
        { range: createTestRange(1, 1, 1, 4), newText: 'bar' }
      ];

      const changeset = createChangesetBuilder()
        .addTextChange('/path/to/file.ts', edits)
        .build();

      expect(changeset.textChanges).toHaveLength(1);
      expect(changeset.textChanges[0].filePath).toBe('/path/to/file.ts');
      expect(changeset.textChanges[0].edits).toEqual(edits);
    });

    it('應該合併同一檔案的多次變更', () => {
      const edit1 = { range: createTestRange(1, 1, 1, 4), newText: 'bar' };
      const edit2 = { range: createTestRange(5, 1, 5, 4), newText: 'baz' };

      const changeset = createChangesetBuilder()
        .addTextChange('/path/to/file.ts', [edit1])
        .addTextChange('/path/to/file.ts', [edit2])
        .build();

      expect(changeset.textChanges).toHaveLength(1);
      expect(changeset.textChanges[0].edits).toHaveLength(2);
      expect(changeset.textChanges[0].edits[0]).toEqual(edit1);
      expect(changeset.textChanges[0].edits[1]).toEqual(edit2);
    });

    it('應該保留操作類型', () => {
      const changeset = createChangesetBuilder()
        .addTextChange('/file.ts', [], TextEditOperationType.Rename)
        .build();

      expect(changeset.textChanges[0].operationType).toBe(TextEditOperationType.Rename);
    });

    it('合併時新的操作類型應覆蓋舊的', () => {
      const changeset = createChangesetBuilder()
        .addTextChange('/file.ts', [], TextEditOperationType.Rename)
        .addTextChange('/file.ts', [], TextEditOperationType.Modify)
        .build();

      expect(changeset.textChanges[0].operationType).toBe(TextEditOperationType.Modify);
    });

    it('合併時若未指定操作類型應保留舊的', () => {
      const changeset = createChangesetBuilder()
        .addTextChange('/file.ts', [], TextEditOperationType.Rename)
        .addTextChange('/file.ts', [])
        .build();

      expect(changeset.textChanges[0].operationType).toBe(TextEditOperationType.Rename);
    });

    it('不同檔案應分開存放', () => {
      const changeset = createChangesetBuilder()
        .addTextChange('/file1.ts', [])
        .addTextChange('/file2.ts', [])
        .build();

      expect(changeset.textChanges).toHaveLength(2);
    });

    it('應該支援鏈式調用', () => {
      const builder = createChangesetBuilder();
      const result = builder.addTextChange('/file.ts', []);

      expect(result).toBe(builder);
    });

    // MARK: - Edit 去重

    it('合併時應去除重複的 edit（相同 range）', () => {
      const duplicateRange = createTestRange(1, 1, 1, 10);
      const edit1 = { range: duplicateRange, newText: 'foo', description: 'first' };
      const edit2 = { range: duplicateRange, newText: 'foo', description: 'duplicate' };

      const changeset = createChangesetBuilder()
        .addTextChange('/file.ts', [edit1])
        .addTextChange('/file.ts', [edit2])
        .build();

      // 應該只有一個 edit（第一個），重複的被過濾
      expect(changeset.textChanges[0].edits).toHaveLength(1);
      expect(changeset.textChanges[0].edits[0].description).toBe('first');
    });

    it('不同 range 的 edit 應保留', () => {
      const edit1 = { range: createTestRange(1, 1, 1, 10), newText: 'foo' };
      const edit2 = { range: createTestRange(2, 1, 2, 10), newText: 'bar' };

      const changeset = createChangesetBuilder()
        .addTextChange('/file.ts', [edit1])
        .addTextChange('/file.ts', [edit2])
        .build();

      expect(changeset.textChanges[0].edits).toHaveLength(2);
    });

    it('跨批次添加相同 range 的 edit 應被去重', () => {
      const sameRange = createTestRange(5, 1, 6, 20);
      const edits = [
        { range: sameRange, newText: '', description: 'Remove: first' },
        { range: sameRange, newText: '', description: 'Remove: second' },
        { range: sameRange, newText: '', description: 'Remove: third' },
        { range: sameRange, newText: '', description: 'Remove: fourth' }
      ];

      const changeset = createChangesetBuilder()
        .addTextChange('/file.ts', edits.slice(0, 2))
        .addTextChange('/file.ts', edits.slice(2, 4))
        .build();

      // 去重邏輯說明：
      // - 同一批次內的重複不會被去重（第一批 [0,1] 直接加入，edits = [0,1]）
      // - 跨批次時會檢查已存在的 edits，相同 range 的會被過濾
      // - 第二批 [2,3] 與 edit[0] 的 range 相同，都被過濾
      // 結果：2 個 edit（來自第一批）
      expect(changeset.textChanges[0].edits).toHaveLength(2);
    });

    it('range 的任一欄位不同則不視為重複', () => {
      const edit1 = { range: createTestRange(1, 1, 1, 10), newText: 'a' };
      const edit2 = { range: createTestRange(1, 2, 1, 10), newText: 'b' }; // start.column 不同
      const edit3 = { range: createTestRange(1, 1, 2, 10), newText: 'c' }; // end.line 不同
      const edit4 = { range: createTestRange(1, 1, 1, 11), newText: 'd' }; // end.column 不同

      const changeset = createChangesetBuilder()
        .addTextChange('/file.ts', [edit1])
        .addTextChange('/file.ts', [edit2, edit3, edit4])
        .build();

      expect(changeset.textChanges[0].edits).toHaveLength(4);
    });
  });

  // MARK: - 重複檔案操作警告

  describe('重複檔案操作警告', () => {
    it('addFileCreate 重複操作時應新增警告', () => {
      const changeset = createChangesetBuilder()
        .addFileCreate('/dup/file.ts', 'first')
        .addFileCreate('/dup/file.ts', 'second')
        .build();

      expect(changeset.warnings).toBeDefined();
      expect(changeset.warnings![0]).toContain('/dup/file.ts');
      expect(changeset.fileOperations).toHaveLength(2);
    });

    it('addFileDelete 重複操作時應新增警告', () => {
      const changeset = createChangesetBuilder()
        .addFileDelete('/dup/del.ts')
        .addFileDelete('/dup/del.ts')
        .build();

      expect(changeset.warnings).toBeDefined();
      expect(changeset.warnings![0]).toContain('/dup/del.ts');
    });

    it('addFileMove 重複 sourcePath 時應新增警告', () => {
      const changeset = createChangesetBuilder()
        .addFileMove('/dup/src.ts', '/dest1.ts')
        .addFileMove('/dup/src.ts', '/dest2.ts')
        .build();

      expect(changeset.warnings).toBeDefined();
      expect(changeset.warnings![0]).toContain('/dup/src.ts');
    });
  });

  // MARK: - addFileCreate

  describe('addFileCreate', () => {
    it('應該新增檔案建立操作', () => {
      const changeset = createChangesetBuilder()
        .addFileCreate('/new/file.ts', 'console.log("hello");')
        .build();

      expect(changeset.fileOperations).toHaveLength(1);
      expect(changeset.fileOperations[0]).toEqual({
        type: FileOperationType.Create,
        sourcePath: '/new/file.ts',
        targetPath: '/new/file.ts',
        content: 'console.log("hello");'
      });
    });

    it('空內容應被保留', () => {
      const changeset = createChangesetBuilder()
        .addFileCreate('/empty.ts', '')
        .build();

      expect(changeset.fileOperations[0].content).toBe('');
    });

    it('應該支援鏈式調用', () => {
      const builder = createChangesetBuilder();
      const result = builder.addFileCreate('/file.ts', '');

      expect(result).toBe(builder);
    });
  });

  // MARK: - addFileDelete

  describe('addFileDelete', () => {
    it('應該新增檔案刪除操作', () => {
      const changeset = createChangesetBuilder()
        .addFileDelete('/old/file.ts')
        .build();

      expect(changeset.fileOperations).toHaveLength(1);
      expect(changeset.fileOperations[0]).toEqual({
        type: FileOperationType.Delete,
        sourcePath: '/old/file.ts'
      });
    });

    it('應該支援鏈式調用', () => {
      const builder = createChangesetBuilder();
      const result = builder.addFileDelete('/file.ts');

      expect(result).toBe(builder);
    });
  });

  // MARK: - addFileMove

  describe('addFileMove', () => {
    it('應該新增檔案移動操作', () => {
      const changeset = createChangesetBuilder()
        .addFileMove('/old/path.ts', '/new/path.ts')
        .build();

      expect(changeset.fileOperations).toHaveLength(1);
      expect(changeset.fileOperations[0]).toEqual({
        type: FileOperationType.Move,
        sourcePath: '/old/path.ts',
        targetPath: '/new/path.ts'
      });
    });

    it('應該支援鏈式調用', () => {
      const builder = createChangesetBuilder();
      const result = builder.addFileMove('/a.ts', '/b.ts');

      expect(result).toBe(builder);
    });
  });

  // MARK: - addError

  describe('addError', () => {
    it('應該新增錯誤訊息', () => {
      const changeset = createChangesetBuilder()
        .addError('發生錯誤')
        .build();

      expect(changeset.errors).toEqual(['發生錯誤']);
      expect(changeset.success).toBe(false);
    });

    it('多個錯誤應累積', () => {
      const changeset = createChangesetBuilder()
        .addError('錯誤 1')
        .addError('錯誤 2')
        .build();

      expect(changeset.errors).toEqual(['錯誤 1', '錯誤 2']);
    });

    it('應該支援鏈式調用', () => {
      const builder = createChangesetBuilder();
      const result = builder.addError('error');

      expect(result).toBe(builder);
    });
  });

  // MARK: - addWarning

  describe('addWarning', () => {
    it('應該新增警告訊息', () => {
      const changeset = createChangesetBuilder()
        .addWarning('注意事項')
        .build();

      expect(changeset.warnings).toEqual(['注意事項']);
    });

    it('多個警告應累積', () => {
      const changeset = createChangesetBuilder()
        .addWarning('警告 1')
        .addWarning('警告 2')
        .build();

      expect(changeset.warnings).toEqual(['警告 1', '警告 2']);
    });

    it('警告不影響 success 狀態', () => {
      const changeset = createChangesetBuilder()
        .addWarning('警告')
        .build();

      expect(changeset.success).toBe(true);
    });

    it('應該支援鏈式調用', () => {
      const builder = createChangesetBuilder();
      const result = builder.addWarning('warning');

      expect(result).toBe(builder);
    });
  });

  // MARK: - build

  describe('build', () => {
    it('無錯誤時 success 應為 true', () => {
      const changeset = createChangesetBuilder().build();

      expect(changeset.success).toBe(true);
    });

    it('有錯誤時 success 應為 false', () => {
      const changeset = createChangesetBuilder()
        .addError('error')
        .build();

      expect(changeset.success).toBe(false);
    });

    it('無錯誤時 errors 應為 undefined', () => {
      const changeset = createChangesetBuilder().build();

      expect(changeset.errors).toBeUndefined();
    });

    it('無警告時 warnings 應為 undefined', () => {
      const changeset = createChangesetBuilder().build();

      expect(changeset.warnings).toBeUndefined();
    });

    it('預設命令類型應為 rename', () => {
      const changeset = createChangesetBuilder().build();

      expect(changeset.command).toBe(ChangesetCommand.Rename);
    });

    it('預設描述應為空字串', () => {
      const changeset = createChangesetBuilder().build();

      expect(changeset.description).toBe('');
    });
  });

  // MARK: - 完整流程

  describe('完整流程', () => {
    it('應該支援完整的鏈式建構', () => {
      const changeset = createChangesetBuilder()
        .forCommand(ChangesetCommand.Rename)
        .withDescription('重命名 foo 為 bar')
        .addTextChange('/src/file.ts', [
          { range: createTestRange(1, 1, 1, 4), newText: 'bar' }
        ])
        .addTextChange('/src/other.ts', [
          { range: createTestRange(5, 1, 5, 4), newText: 'bar' }
        ])
        .addWarning('有 10 個引用需要手動檢查')
        .build();

      expect(changeset.command).toBe(ChangesetCommand.Rename);
      expect(changeset.description).toBe('重命名 foo 為 bar');
      expect(changeset.textChanges).toHaveLength(2);
      expect(changeset.success).toBe(true);
      expect(changeset.warnings).toHaveLength(1);
    });

    it('應該支援複雜的檔案操作組合', () => {
      const changeset = createChangesetBuilder()
        .forCommand(ChangesetCommand.Move)
        .withDescription('移動並重構模組')
        .addFileMove('/old/module.ts', '/new/module.ts')
        .addTextChange('/src/consumer.ts', [
          { range: createTestRange(1, 1, 1, 20), newText: 'import { foo } from \'../new/module.js\';' }
        ])
        .addFileCreate('/new/index.ts', 'export * from \'./module.js\';')
        .build();

      expect(changeset.fileOperations).toHaveLength(2);
      expect(changeset.textChanges).toHaveLength(1);
      expect(changeset.success).toBe(true);
    });
  });
});
