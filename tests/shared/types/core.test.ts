import { describe, it, expect } from 'vitest';
import { 
  Position, 
  Range, 
  Location, 
  isPosition, 
  isRange, 
  isLocation,
  createPosition,
  createRange,
  createLocation,
  isPositionBefore,
  isPositionInRange
} from '../../../src/shared/types/core';

describe('核心型別系統', () => {
  describe('Position 型別', () => {
    it('應該能建立有效的 Position', () => {
      const position = createPosition(1, 1);
      expect(position.line).toBe(1);
      expect(position.column).toBe(1);
      expect(position.offset).toBeUndefined();
    });

    it('應該能建立包含 offset 的 Position', () => {
      const position = createPosition(1, 1, 0);
      expect(position.line).toBe(1);
      expect(position.column).toBe(1);
      expect(position.offset).toBe(0);
    });

    it('應該拒絕無效的 line 值（小於 1）', () => {
      expect(() => createPosition(0, 1)).toThrow('Line 必須大於等於 1');
    });

    it('應該拒絕無效的 column 值（小於 1）', () => {
      expect(() => createPosition(1, 0)).toThrow('Column 必須大於等於 1');
    });

    it('應該拒絕無效的 offset 值（小於 0）', () => {
      expect(() => createPosition(1, 1, -1)).toThrow('Offset 必須大於等於 0');
    });

    it('isPosition 型別守衛應該正確驗證', () => {
      const validPosition = { line: 1, column: 1 };
      const invalidPosition = { line: 0, column: 1 };
      const notPosition = { x: 1, y: 1 };

      expect(isPosition(validPosition)).toBe(true);
      expect(isPosition(invalidPosition)).toBe(false);
      expect(isPosition(notPosition)).toBe(false);
      expect(isPosition(null)).toBe(false);
      expect(isPosition(undefined)).toBe(false);
    });
  });

  describe('Range 型別', () => {
    it('應該能建立有效的 Range', () => {
      const start = createPosition(1, 1);
      const end = createPosition(1, 10);
      const range = createRange(start, end);

      expect(range.start).toEqual(start);
      expect(range.end).toEqual(end);
    });

    it('應該拒絕 start 在 end 之後的 Range', () => {
      const start = createPosition(2, 1);
      const end = createPosition(1, 10);

      expect(() => createRange(start, end)).toThrow('Range 的 start 不能在 end 之後');
    });

    it('應該接受 start 和 end 相同的 Range', () => {
      const position = createPosition(1, 5);
      const range = createRange(position, position);

      expect(range.start).toEqual(position);
      expect(range.end).toEqual(position);
    });

    it('isRange 型別守衛應該正確驗證', () => {
      const validRange = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      };
      const invalidRange = {
        start: { line: 0, column: 1 },
        end: { line: 1, column: 10 }
      };
      const notRange = { begin: { line: 1, column: 1 } };

      expect(isRange(validRange)).toBe(true);
      expect(isRange(invalidRange)).toBe(false);
      expect(isRange(notRange)).toBe(false);
    });
  });

  describe('Location 型別', () => {
    it('應該能建立有效的 Location', () => {
      const range = createRange(
        createPosition(1, 1),
        createPosition(1, 10)
      );
      const location = createLocation('/path/to/file.ts', range);

      expect(location.filePath).toBe('/path/to/file.ts');
      expect(location.range).toEqual(range);
    });

    it('應該拒絕空的檔案路徑', () => {
      const range = createRange(
        createPosition(1, 1),
        createPosition(1, 10)
      );

      expect(() => createLocation('', range)).toThrow('檔案路徑不能為空');
    });

    it('isLocation 型別守衛應該正確驗證', () => {
      const validLocation = {
        filePath: '/path/to/file.ts',
        range: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };
      const invalidLocation = {
        filePath: '',
        range: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(isLocation(validLocation)).toBe(true);
      expect(isLocation(invalidLocation)).toBe(false);
    });
  });

  describe('範圍比較功能', () => {
    it('應該能比較兩個 Position 的先後順序', () => {
      const pos1 = createPosition(1, 1);
      const pos2 = createPosition(1, 5);
      const pos3 = createPosition(2, 1);

      expect(isPositionBefore(pos1, pos2)).toBe(true);
      expect(isPositionBefore(pos2, pos1)).toBe(false);
      expect(isPositionBefore(pos1, pos3)).toBe(true);
      expect(isPositionBefore(pos3, pos1)).toBe(false);
      expect(isPositionBefore(pos1, pos1)).toBe(false);
    });

    it('應該能檢查 Position 是否在 Range 內', () => {
      const range = createRange(
        createPosition(1, 5),
        createPosition(2, 10)
      );
      
      const positionInside = createPosition(1, 7);
      const positionBefore = createPosition(1, 3);
      const positionAfter = createPosition(2, 15);
      const positionOnStart = createPosition(1, 5);
      const positionOnEnd = createPosition(2, 10);

      expect(isPositionInRange(positionInside, range)).toBe(true);
      expect(isPositionInRange(positionOnStart, range)).toBe(true);
      expect(isPositionInRange(positionOnEnd, range)).toBe(true);
      expect(isPositionInRange(positionBefore, range)).toBe(false);
      expect(isPositionInRange(positionAfter, range)).toBe(false);
    });
  });
});

