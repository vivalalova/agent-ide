import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SnapshotDiffer } from '@core/snapshot/snapshot-differ';
import { CompressionLevel, FileChangeType } from '@core/snapshot/types';
import type { Snapshot, FileChange, SnapshotOptions } from '@core/snapshot/types';
import * as fs from 'fs/promises';

// Mock file system
vi.mock('fs/promises');

const createMockSnapshot = (files: Record<string, string> = {}): Snapshot => {
  const fileHashes: Record<string, string> = {};
  const code: Record<string, any> = {};

  Object.entries(files).forEach(([path, hash]) => {
    fileHashes[path] = hash;
    code[path] = { m: 'code', ol: 10, cl: 8 };
  });

  return {
    v: '1.0.0',
    p: 'test-project',
    t: Date.now(),
    h: 'project-hash',
    l: CompressionLevel.Full,
    s: {
      d: [],
      m: []
    },
    y: {},
    dp: {
      g: [],
      i: {},
      ex: {}
    },
    c: code,
    q: {
      ss: 50,
      cx: 60,
      mt: 70,
      is: []
    },
    md: {
      fh: fileHashes,
      tf: Object.keys(files).length,
      tl: Object.keys(files).length * 10,
      lg: ['TypeScript']
    }
  };
};

describe('SnapshotDiffer', () => {
  let differ: SnapshotDiffer;

  beforeEach(() => {
    differ = new SnapshotDiffer();
    vi.clearAllMocks();
  });

  describe('diff', () => {
    it('應該檢測新增的檔案', () => {
      const oldSnapshot = createMockSnapshot({
        'file1.ts': 'hash1'
      });

      const newSnapshot = createMockSnapshot({
        'file1.ts': 'hash1',
        'file2.ts': 'hash2'
      });

      const result = differ.diff(oldSnapshot, newSnapshot);

      expect(result.added).toEqual(['file2.ts']);
      expect(result.modified).toEqual([]);
      expect(result.deleted).toEqual([]);
      expect(result.summary.totalChanges).toBe(1);
      expect(result.summary.filesAffected).toBe(1);
    });

    it('應該檢測修改的檔案', () => {
      const oldSnapshot = createMockSnapshot({
        'file1.ts': 'hash1',
        'file2.ts': 'hash2'
      });

      const newSnapshot = createMockSnapshot({
        'file1.ts': 'hash1-modified',
        'file2.ts': 'hash2'
      });

      const result = differ.diff(oldSnapshot, newSnapshot);

      expect(result.added).toEqual([]);
      expect(result.modified).toEqual(['file1.ts']);
      expect(result.deleted).toEqual([]);
      expect(result.summary.totalChanges).toBe(1);
    });

    it('應該檢測刪除的檔案', () => {
      const oldSnapshot = createMockSnapshot({
        'file1.ts': 'hash1',
        'file2.ts': 'hash2'
      });

      const newSnapshot = createMockSnapshot({
        'file1.ts': 'hash1'
      });

      const result = differ.diff(oldSnapshot, newSnapshot);

      expect(result.added).toEqual([]);
      expect(result.modified).toEqual([]);
      expect(result.deleted).toEqual(['file2.ts']);
      expect(result.summary.totalChanges).toBe(1);
    });

    it('應該同時檢測多種變更', () => {
      const oldSnapshot = createMockSnapshot({
        'file1.ts': 'hash1',
        'file2.ts': 'hash2',
        'file3.ts': 'hash3'
      });

      const newSnapshot = createMockSnapshot({
        'file1.ts': 'hash1-modified',
        'file3.ts': 'hash3',
        'file4.ts': 'hash4'
      });

      const result = differ.diff(oldSnapshot, newSnapshot);

      expect(result.added).toEqual(['file4.ts']);
      expect(result.modified).toEqual(['file1.ts']);
      expect(result.deleted).toEqual(['file2.ts']);
      expect(result.summary.totalChanges).toBe(3);
      expect(result.summary.filesAffected).toBe(3);
    });

    it('應該處理空快照', () => {
      const oldSnapshot = createMockSnapshot({});
      const newSnapshot = createMockSnapshot({});

      const result = differ.diff(oldSnapshot, newSnapshot);

      expect(result.added).toEqual([]);
      expect(result.modified).toEqual([]);
      expect(result.deleted).toEqual([]);
      expect(result.summary.totalChanges).toBe(0);
      expect(result.summary.linesChanged).toBe(0);
    });

    it('應該計算變更的行數', () => {
      const oldSnapshot = createMockSnapshot({
        'file1.ts': 'hash1'
      });
      oldSnapshot.c['file1.ts'].ol = 100;

      const newSnapshot = createMockSnapshot({
        'file1.ts': 'hash1-modified'
      });
      newSnapshot.c['file1.ts'].ol = 150;

      const result = differ.diff(oldSnapshot, newSnapshot);

      expect(result.summary.linesChanged).toBe(50);
    });

    it('應該處理相同的快照', () => {
      const snapshot = createMockSnapshot({
        'file1.ts': 'hash1',
        'file2.ts': 'hash2'
      });

      const result = differ.diff(snapshot, snapshot);

      expect(result.added).toEqual([]);
      expect(result.modified).toEqual([]);
      expect(result.deleted).toEqual([]);
      expect(result.summary.totalChanges).toBe(0);
    });
  });

  describe('applyChanges', () => {
    let baseSnapshot: Snapshot;
    let options: SnapshotOptions;

    beforeEach(() => {
      baseSnapshot = createMockSnapshot({
        '/test/project/existing.ts': 'hash1'
      });
      options = {
        projectPath: '/test/project'
      };

      // Mock fs.readFile
      vi.mocked(fs.readFile).mockResolvedValue(`
        export function test() {
          return true;
        }
      `);
    });

    it('應該應用新增檔案變更', async () => {
      const changes: FileChange[] = [
        {
          path: '/test/project/new.ts',
          type: FileChangeType.Added,
          newHash: 'hash2'
        }
      ];

      const result = await differ.applyChanges(baseSnapshot, changes, options);

      expect(result.md.fh['/test/project/new.ts']).toBeDefined();
      expect(result.h).not.toBe(baseSnapshot.h);
    });

    it('應該應用刪除檔案變更', async () => {
      const changes: FileChange[] = [
        {
          path: '/test/project/existing.ts',
          type: FileChangeType.Deleted,
          oldHash: 'hash1'
        }
      ];

      const result = await differ.applyChanges(baseSnapshot, changes, options);

      expect(result.md.fh['/test/project/existing.ts']).toBeUndefined();
    });

    it('應該應用修改檔案變更', async () => {
      const changes: FileChange[] = [
        {
          path: '/test/project/existing.ts',
          type: FileChangeType.Modified,
          oldHash: 'hash1',
          newHash: 'hash1-modified'
        }
      ];

      const result = await differ.applyChanges(baseSnapshot, changes, options);

      // 檔案應該被更新
      expect(result.md.fh['/test/project/existing.ts']).toBeDefined();
    });

    it('應該處理多個混合變更', async () => {
      const changes: FileChange[] = [
        {
          path: '/test/project/new.ts',
          type: FileChangeType.Added,
          newHash: 'hash2'
        },
        {
          path: '/test/project/existing.ts',
          type: FileChangeType.Modified,
          oldHash: 'hash1',
          newHash: 'hash1-modified'
        }
      ];

      const result = await differ.applyChanges(baseSnapshot, changes, options);

      expect(result.md.fh['/test/project/new.ts']).toBeDefined();
      expect(result.md.fh['/test/project/existing.ts']).toBeDefined();
    });

    it('應該更新專案 hash', async () => {
      const changes: FileChange[] = [
        {
          path: '/test/project/new.ts',
          type: FileChangeType.Added,
          newHash: 'hash2'
        }
      ];

      const result = await differ.applyChanges(baseSnapshot, changes, options);

      expect(result.h).not.toBe(baseSnapshot.h);
      expect(result.h).toBeDefined();
      expect(typeof result.h).toBe('string');
    });

    it('應該更新元數據統計', async () => {
      const changes: FileChange[] = [
        {
          path: '/test/project/new.ts',
          type: FileChangeType.Added,
          newHash: 'hash2'
        }
      ];

      const result = await differ.applyChanges(baseSnapshot, changes, options);

      expect(result.md.tf).toBeGreaterThan(baseSnapshot.md.tf);
    });

    it('應該處理空變更列表', async () => {
      const changes: FileChange[] = [];

      const result = await differ.applyChanges(baseSnapshot, changes, options);

      expect(result.md.fh).toEqual(baseSnapshot.md.fh);
    });

    it('應該不修改原始快照', async () => {
      const originalHash = baseSnapshot.h;
      const originalFileCount = Object.keys(baseSnapshot.md.fh).length;
      const changes: FileChange[] = [
        {
          path: '/test/project/new.ts',
          type: FileChangeType.Added,
          newHash: 'hash2'
        }
      ];

      await differ.applyChanges(baseSnapshot, changes, options);

      // 原始快照不應被修改
      expect(baseSnapshot.h).toBe(originalHash);
      expect(Object.keys(baseSnapshot.md.fh).length).toBe(originalFileCount);
    });

    it('應該處理檔案讀取失敗', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Read failed'));

      const changes: FileChange[] = [
        {
          path: '/test/project/failing.ts',
          type: FileChangeType.Added,
          newHash: 'hash2'
        }
      ];

      // 應該忽略錯誤並繼續
      const result = await differ.applyChanges(baseSnapshot, changes, options);
      expect(result).toBeDefined();
    });
  });

  describe('邊界情況', () => {
    it('應該處理檔案路徑包含特殊字元', () => {
      const oldSnapshot = createMockSnapshot({
        'path/to/file-1.ts': 'hash1'
      });

      const newSnapshot = createMockSnapshot({
        'path/to/file-1.ts': 'hash1',
        'path/to/file_2.spec.ts': 'hash2'
      });

      const result = differ.diff(oldSnapshot, newSnapshot);

      expect(result.added).toContain('path/to/file_2.spec.ts');
    });

    it('應該處理大量檔案變更', () => {
      const oldFiles: Record<string, string> = {};
      const newFiles: Record<string, string> = {};

      for (let i = 0; i < 100; i++) {
        oldFiles[`file${i}.ts`] = `hash${i}`;
      }

      for (let i = 50; i < 150; i++) {
        newFiles[`file${i}.ts`] = `hash${i}`;
      }

      const oldSnapshot = createMockSnapshot(oldFiles);
      const newSnapshot = createMockSnapshot(newFiles);

      const result = differ.diff(oldSnapshot, newSnapshot);

      expect(result.deleted.length).toBe(50); // 0-49 被刪除
      expect(result.added.length).toBe(50);   // 100-149 被新增
      expect(result.modified.length).toBe(0);  // 50-99 未改變
    });

    it('應該處理沒有程式碼的檔案', () => {
      const oldSnapshot = createMockSnapshot({
        'file1.ts': 'hash1'
      });
      oldSnapshot.c['file1.ts'].ol = 0;

      const newSnapshot = createMockSnapshot({
        'file1.ts': 'hash2'
      });
      newSnapshot.c['file1.ts'].ol = 0;

      const result = differ.diff(oldSnapshot, newSnapshot);

      expect(result.modified).toContain('file1.ts');
      expect(result.summary.linesChanged).toBe(0);
    });

    it('應該處理檔案 hash 相同但內容可能不同的情況', () => {
      const snapshot1 = createMockSnapshot({
        'file1.ts': 'same-hash'
      });

      const snapshot2 = createMockSnapshot({
        'file1.ts': 'same-hash'
      });

      const result = differ.diff(snapshot1, snapshot2);

      // hash 相同，應該視為未修改
      expect(result.modified).toHaveLength(0);
    });
  });

  describe('統計資訊計算', () => {
    it('應該正確計算總變更數', () => {
      const oldSnapshot = createMockSnapshot({
        'a.ts': 'hash-a',
        'b.ts': 'hash-b'
      });

      const newSnapshot = createMockSnapshot({
        'b.ts': 'hash-b-new',
        'c.ts': 'hash-c'
      });

      const result = differ.diff(oldSnapshot, newSnapshot);

      expect(result.summary.totalChanges).toBe(3); // 1 added + 1 modified + 1 deleted
      expect(result.summary.filesAffected).toBe(3);
    });

    it('應該正確計算新增檔案的行數變更', () => {
      const oldSnapshot = createMockSnapshot({});
      const newSnapshot = createMockSnapshot({
        'new.ts': 'hash1'
      });
      newSnapshot.c['new.ts'].ol = 100;

      const result = differ.diff(oldSnapshot, newSnapshot);

      expect(result.summary.linesChanged).toBe(100);
    });

    it('應該正確計算刪除檔案的行數變更', () => {
      const oldSnapshot = createMockSnapshot({
        'old.ts': 'hash1'
      });
      oldSnapshot.c['old.ts'].ol = 50;
      const newSnapshot = createMockSnapshot({});

      const result = differ.diff(oldSnapshot, newSnapshot);

      expect(result.summary.linesChanged).toBe(50);
    });
  });
});
