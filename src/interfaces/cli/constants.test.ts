/**
 * constants 單元測試
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_VALUES, FORMAT, OUTPUT_FORMATS, createSeparator } from './constants.js';

describe('constants', () => {
  describe('DEFAULT_VALUES', () => {
    it('應該包含所有必要的默認值', () => {
      expect(DEFAULT_VALUES.SEARCH_LIMIT).toBe(50);
      expect(DEFAULT_VALUES.TOP_SHIT_COUNT).toBe(10);
      expect(DEFAULT_VALUES.HIGH_COMPLEXITY_THRESHOLD).toBe(10);
    });

    it('應該是唯讀常量', () => {
      expect(() => {
        // @ts-expect-error - 測試唯讀屬性
        DEFAULT_VALUES.SEARCH_LIMIT = 100;
      }).toThrow();
    });
  });

  describe('FORMAT', () => {
    it('應該包含格式化常量', () => {
      expect(FORMAT.SEPARATOR_LENGTH).toBe(50);
      expect(FORMAT.MAX_SCORE).toBe(100);
      expect(FORMAT.PERCENTAGE_MULTIPLIER).toBe(100);
    });

    it('應該是唯讀常量', () => {
      expect(() => {
        // @ts-expect-error - 測試唯讀屬性
        FORMAT.SEPARATOR_LENGTH = 60;
      }).toThrow();
    });
  });

  describe('OUTPUT_FORMATS', () => {
    it('應該包含所有輸出格式', () => {
      expect(OUTPUT_FORMATS.JSON).toBe('json');
      expect(OUTPUT_FORMATS.MINIMAL).toBe('minimal');
      expect(OUTPUT_FORMATS.SUMMARY).toBe('summary');
    });
  });

  describe('createSeparator', () => {
    it('應該創建默認分隔線', () => {
      const separator = createSeparator();

      expect(separator).toBe('='.repeat(50));
      expect(separator.length).toBe(FORMAT.SEPARATOR_LENGTH);
    });

    it('應該創建自定義字符的分隔線', () => {
      const separator = createSeparator('-');

      expect(separator).toBe('-'.repeat(50));
      expect(separator.length).toBe(FORMAT.SEPARATOR_LENGTH);
    });

    it('應該處理多字符字符串', () => {
      const separator = createSeparator('=-');

      expect(separator.length).toBe(FORMAT.SEPARATOR_LENGTH * 2);
    });

    it('應該處理空字符串', () => {
      const separator = createSeparator('');

      expect(separator).toBe('');
    });
  });
});
