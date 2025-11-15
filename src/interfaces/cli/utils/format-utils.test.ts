/**
 * format-utils 單元測試
 */

import { describe, it, expect } from 'vitest';
import { formatFilePath, highlightMatch } from './format-utils.js';

describe('format-utils', () => {
  describe('formatFilePath', () => {
    it('應該返回相對於當前目錄的路徑', () => {
      const absolutePath = process.cwd() + '/src/test.ts';
      const formatted = formatFilePath(absolutePath);

      expect(formatted).toBe('src/test.ts');
    });

    it('應該處理已經是相對路徑的情況', () => {
      const relativePath = 'src/test.ts';
      const formatted = formatFilePath(relativePath);

      expect(formatted).toBe('src/test.ts');
    });

    it('應該處理根目錄的檔案', () => {
      const rootFile = process.cwd() + '/test.ts';
      const formatted = formatFilePath(rootFile);

      expect(formatted).toBe('test.ts');
    });
  });

  describe('highlightMatch', () => {
    it('應該用顏色標記匹配的文字', () => {
      const text = 'Hello World';
      const query = 'World';
      const highlighted = highlightMatch(text, query);

      // 應該包含 ANSI 顏色碼
      expect(highlighted).toContain('\x1b[33m'); // 黃色
      expect(highlighted).toContain('World');
      expect(highlighted).toContain('\x1b[0m'); // 重置
    });

    it('應該處理大小寫不敏感的匹配', () => {
      const text = 'Hello World';
      const query = 'world';
      const highlighted = highlightMatch(text, query);

      expect(highlighted).toContain('\x1b[33m');
      expect(highlighted).toContain('World');
    });

    it('應該處理多個匹配', () => {
      const text = 'foo bar foo';
      const query = 'foo';
      const highlighted = highlightMatch(text, query);

      // 應該有兩個高亮區域
      const colorCodeCount = (highlighted.match(/\x1b\[33m/g) || []).length;
      expect(colorCodeCount).toBe(2);
    });

    it('應該處理沒有匹配的情況', () => {
      const text = 'Hello World';
      const query = 'xyz';
      const highlighted = highlightMatch(text, query);

      // 不應該有顏色碼
      expect(highlighted).not.toContain('\x1b[33m');
      expect(highlighted).toBe(text);
    });

    it('應該處理空查詢', () => {
      const text = 'Hello World';
      const query = '';
      const highlighted = highlightMatch(text, query);

      expect(highlighted).toBe(text);
    });

    it('應該處理特殊正則字符', () => {
      const text = 'test (foo) bar';
      const query = '(foo)';
      const highlighted = highlightMatch(text, query);

      expect(highlighted).toContain('(foo)');
      expect(highlighted).toContain('\x1b[33m');
    });
  });
});
