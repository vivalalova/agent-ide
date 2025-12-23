/**
 * ChangesetBuilder 測試
 */

import { describe, it, expect } from 'vitest';
import { ChangesetBuilder, createChangesetBuilder } from '@infrastructure/changeset/changeset-builder.js';
import type { Changeset } from '@infrastructure/changeset/types.js';

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
      { scenario: 'rename', command: 'rename' },
      { scenario: 'move', command: 'move' },
      { scenario: 'deadcode', command: 'deadcode' },
      { scenario: 'change-signature', command: 'change-signature' },
      { scenario: 'move-member', command: 'move-member' }
    ])('應該設定命令類型為 $scenario', ({ command }) => {
      const changeset = createChangesetBuilder()
        .forCommand(command)
        .build();

      expect(changeset.command).toBe(command);
    });

    it('應該支援鏈式調用', () => {
      const builder = createChangesetBuilder();
      const result = builder.forCommand('rename');

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
        .addTextChange('/file.ts', [], 'rename')
        .build();

      expect(changeset.textChanges[0].operationType).toBe('rename');
    });

    it('合併時新的操作類型應覆蓋舊的', () => {
      const changeset = createChangesetBuilder()
        .addTextChange('/file.ts', [], 'rename')
        .addTextChange('/file.ts', [], 'modify')
        .build();

      expect(changeset.textChanges[0].operationType).toBe('modify');
    });

    it('合併時若未指定操作類型應保留舊的', () => {
      const changeset = createChangesetBuilder()
        .addTextChange('/file.ts', [], 'rename')
        .addTextChange('/file.ts', [])
        .build();

      expect(changeset.textChanges[0].operationType).toBe('rename');
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
  });

  // MARK: - addFileCreate

  describe('addFileCreate', () => {
    it('應該新增檔案建立操作', () => {
      const changeset = createChangesetBuilder()
        .addFileCreate('/new/file.ts', 'console.log("hello");')
        .build();

      expect(changeset.fileOperations).toHaveLength(1);
      expect(changeset.fileOperations[0]).toEqual({
        type: 'create',
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
        type: 'delete',
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
        type: 'move',
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

      expect(changeset.command).toBe('rename');
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
        .forCommand('rename')
        .withDescription('重命名 foo 為 bar')
        .addTextChange('/src/file.ts', [
          { range: createTestRange(1, 1, 1, 4), newText: 'bar' }
        ])
        .addTextChange('/src/other.ts', [
          { range: createTestRange(5, 1, 5, 4), newText: 'bar' }
        ])
        .addWarning('有 10 個引用需要手動檢查')
        .build();

      expect(changeset.command).toBe('rename');
      expect(changeset.description).toBe('重命名 foo 為 bar');
      expect(changeset.textChanges).toHaveLength(2);
      expect(changeset.success).toBe(true);
      expect(changeset.warnings).toHaveLength(1);
    });

    it('應該支援複雜的檔案操作組合', () => {
      const changeset = createChangesetBuilder()
        .forCommand('move')
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
