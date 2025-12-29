/**
 * line-number 工具函數測試
 */

import { describe, it, expect } from 'vitest';
import {
  isSameLine,
  toOneBased,
  toZeroBased
} from '@shared/types/line-number.js';

describe('line-number', () => {
  // MARK: - isSameLine

  describe('isSameLine', () => {
    describe('tolerance=1（預設）', () => {
      interface SameLineTestCase {
        scenario: string;
        line1: number;
        line2: number;
        expected: boolean;
      }

      it.each<SameLineTestCase>([
        { scenario: '相同行號', line1: 5, line2: 5, expected: true },
        { scenario: '相差 1 行', line1: 5, line2: 6, expected: true },
        { scenario: '相差 -1 行', line1: 6, line2: 5, expected: true },
        { scenario: '相差 2 行', line1: 5, line2: 7, expected: false },
        { scenario: '相差 -2 行', line1: 7, line2: 5, expected: false },
        { scenario: '第 0 行和第 1 行', line1: 0, line2: 1, expected: true },
        { scenario: '極大差異', line1: 1, line2: 1000, expected: false }
      ])('$scenario 應為 $expected', ({ line1, line2, expected }) => {
        expect(isSameLine(line1, line2)).toBe(expected);
      });
    });

    describe('tolerance=0（嚴格模式）', () => {
      interface StrictModeTestCase {
        scenario: string;
        line1: number;
        line2: number;
        expected: boolean;
      }

      it.each<StrictModeTestCase>([
        { scenario: '相同行號', line1: 5, line2: 5, expected: true },
        { scenario: '相差 1 行', line1: 5, line2: 6, expected: false },
        { scenario: '相差 -1 行', line1: 6, line2: 5, expected: false },
        { scenario: '第 0 行和第 0 行', line1: 0, line2: 0, expected: true }
      ])('$scenario 應為 $expected', ({ line1, line2, expected }) => {
        expect(isSameLine(line1, line2, 0)).toBe(expected);
      });
    });

    describe('邊界情況', () => {
      it('負數行號應正確處理', () => {
        expect(isSameLine(-1, 0)).toBe(true);
        expect(isSameLine(-1, 1)).toBe(false);
      });

      it('極大行號應正確處理', () => {
        expect(isSameLine(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBe(true);
        expect(isSameLine(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1)).toBe(true);
      });

      it('零和零應為同一行', () => {
        expect(isSameLine(0, 0)).toBe(true);
        expect(isSameLine(0, 0, 0)).toBe(true);
      });
    });
  });

  // MARK: - toOneBased

  describe('toOneBased', () => {
    interface ToOneBasedTestCase {
      scenario: string;
      input: number;
      expected: number;
    }

    it.each<ToOneBasedTestCase>([
      { scenario: '0 轉為 1', input: 0, expected: 1 },
      { scenario: '1 轉為 2', input: 1, expected: 2 },
      { scenario: '99 轉為 100', input: 99, expected: 100 },
      { scenario: '負數仍加 1', input: -1, expected: 0 }
    ])('$scenario', ({ input, expected }) => {
      expect(toOneBased(input)).toBe(expected);
    });

    it('極大值應正確處理', () => {
      expect(toOneBased(Number.MAX_SAFE_INTEGER - 1)).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  // MARK: - toZeroBased

  describe('toZeroBased', () => {
    interface ToZeroBasedTestCase {
      scenario: string;
      input: number;
      expected: number;
    }

    it.each<ToZeroBasedTestCase>([
      { scenario: '1 轉為 0', input: 1, expected: 0 },
      { scenario: '2 轉為 1', input: 2, expected: 1 },
      { scenario: '100 轉為 99', input: 100, expected: 99 },
      { scenario: '0 轉為 -1', input: 0, expected: -1 }
    ])('$scenario', ({ input, expected }) => {
      expect(toZeroBased(input)).toBe(expected);
    });

    it('極大值應正確處理', () => {
      expect(toZeroBased(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER - 1);
    });
  });

  // MARK: - 轉換一致性

  describe('轉換一致性', () => {
    it('toOneBased 和 toZeroBased 應互為反函數', () => {
      const testValues = [0, 1, 10, 100, 999];

      for (const value of testValues) {
        expect(toZeroBased(toOneBased(value))).toBe(value);
        expect(toOneBased(toZeroBased(value + 1))).toBe(value + 1);
      }
    });

    it('多次轉換應產生預期結果', () => {
      const zeroBased = 5;
      const oneBased = toOneBased(zeroBased); // 6
      const backToZero = toZeroBased(oneBased); // 5

      expect(backToZero).toBe(zeroBased);
    });
  });
});
