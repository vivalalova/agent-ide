/**
 * diff-utils 單元測試
 */

import { describe, it, expect } from 'vitest';
import { calculateLineChanges, computeLCS } from '@infrastructure/formatters/diff-utils.js';

describe('diff-utils', () => {
  describe('computeLCS', () => {
    it('應該找出兩個陣列的最長共同子序列', () => {
      const a = ['A', 'B', 'C', 'D'];
      const b = ['A', 'C', 'D', 'E'];

      const result = computeLCS(a, b);

      expect(result).toEqual(['A', 'C', 'D']);
    });

    it('應該處理空陣列', () => {
      expect(computeLCS([], [])).toEqual([]);
      expect(computeLCS(['A'], [])).toEqual([]);
      expect(computeLCS([], ['A'])).toEqual([]);
    });

    it('應該處理完全相同的陣列', () => {
      const arr = ['A', 'B', 'C'];
      expect(computeLCS(arr, arr)).toEqual(['A', 'B', 'C']);
    });

    it('應該處理完全不同的陣列', () => {
      expect(computeLCS(['A', 'B'], ['C', 'D'])).toEqual([]);
    });

    it('應該處理單元素陣列', () => {
      expect(computeLCS(['A'], ['A'])).toEqual(['A']);
      expect(computeLCS(['A'], ['B'])).toEqual([]);
    });

    it('應該處理有重複元素的陣列', () => {
      const a = ['A', 'B', 'A', 'C'];
      const b = ['A', 'A', 'B', 'C'];

      const result = computeLCS(a, b);

      // LCS 可能是 ['A', 'A', 'C'] 或 ['A', 'B', 'C']，長度為 3
      expect(result.length).toBe(3);
    });
  });

  describe('calculateLineChanges', () => {
    it('應該計算新增行', () => {
      const original = 'line1\nline2';
      const modified = 'line1\nline2\nline3';

      const changes = calculateLineChanges(original, modified);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        line: 3,
        oldContent: null,
        newContent: 'line3'
      });
    });

    it('應該計算刪除行', () => {
      const original = 'line1\nline2\nline3';
      const modified = 'line1\nline3';

      const changes = calculateLineChanges(original, modified);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        line: 2,
        oldContent: 'line2',
        newContent: null
      });
    });

    it('應該計算替換行', () => {
      const original = 'line1\nold\nline3';
      const modified = 'line1\nnew\nline3';

      const changes = calculateLineChanges(original, modified);

      expect(changes).toHaveLength(2);
      // 第一個變更是刪除 'old'
      expect(changes[0].oldContent).toBe('old');
      expect(changes[0].newContent).toBeNull();
      // 第二個變更是新增 'new'
      expect(changes[1].oldContent).toBeNull();
      expect(changes[1].newContent).toBe('new');
    });

    it('應該處理空字串', () => {
      // 空字串分割後為 ['']，所以比較時視為有一個空行
      const emptyToEmpty = calculateLineChanges('', '');
      expect(emptyToEmpty).toEqual([]);  // 相同內容無變更

      // '' → 'line1'：刪除空行 + 新增 line1
      const emptyToLine = calculateLineChanges('', 'line1');
      expect(emptyToLine.length).toBeGreaterThanOrEqual(1);

      // 'line1' → ''：刪除 line1 + 新增空行
      const lineToEmpty = calculateLineChanges('line1', '');
      expect(lineToEmpty.length).toBeGreaterThanOrEqual(1);
    });

    it('應該處理相同內容', () => {
      const content = 'line1\nline2\nline3';
      expect(calculateLineChanges(content, content)).toEqual([]);
    });

    it('應該處理多行新增', () => {
      const original = 'line1';
      const modified = 'line1\nline2\nline3';

      const changes = calculateLineChanges(original, modified);

      expect(changes).toHaveLength(2);
      expect(changes[0].newContent).toBe('line2');
      expect(changes[1].newContent).toBe('line3');
    });

    it('應該處理多行刪除', () => {
      const original = 'line1\nline2\nline3';
      const modified = 'line1';

      const changes = calculateLineChanges(original, modified);

      expect(changes).toHaveLength(2);
      expect(changes[0].oldContent).toBe('line2');
      expect(changes[1].oldContent).toBe('line3');
    });

    it('應該處理完全不同的內容', () => {
      const original = 'A\nB';
      const modified = 'C\nD';

      const changes = calculateLineChanges(original, modified);

      // 所有行都是變更
      expect(changes.length).toBeGreaterThanOrEqual(2);
    });

    it('應該保留縮排', () => {
      const original = '  line1\n    line2';
      const modified = '  line1\n      line3';

      const changes = calculateLineChanges(original, modified);

      const deleteChange = changes.find(c => c.oldContent !== null);
      const addChange = changes.find(c => c.newContent !== null);

      expect(deleteChange?.oldContent).toBe('    line2');
      expect(addChange?.newContent).toBe('      line3');
    });
  });
});
