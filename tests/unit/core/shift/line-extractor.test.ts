import { describe, it, expect } from 'vitest';
import { LineExtractor } from '@core/shift/line-extractor';

describe('LineExtractor', () => {
  let extractor: LineExtractor;

  beforeEach(() => {
    extractor = new LineExtractor();
  });

  describe('extractLines', () => {
    it('應該提取單行', () => {
      const content = 'line1\nline2\nline3\nline4';
      const result = extractor.extractLines(content, 2, 2);

      expect(result.extractedLines).toEqual(['line2']);
      expect(result.linesCount).toBe(1);
      expect(result.remainingContent).toBe('line1\nline3\nline4');
    });

    it('應該提取多行', () => {
      const content = 'line1\nline2\nline3\nline4';
      const result = extractor.extractLines(content, 2, 3);

      expect(result.extractedLines).toEqual(['line2', 'line3']);
      expect(result.linesCount).toBe(2);
      expect(result.remainingContent).toBe('line1\nline4');
    });

    it('應該提取第一行', () => {
      const content = 'line1\nline2\nline3';
      const result = extractor.extractLines(content, 1, 1);

      expect(result.extractedLines).toEqual(['line1']);
      expect(result.remainingContent).toBe('line2\nline3');
    });

    it('應該提取最後一行', () => {
      const content = 'line1\nline2\nline3';
      const result = extractor.extractLines(content, 3, 3);

      expect(result.extractedLines).toEqual(['line3']);
      expect(result.remainingContent).toBe('line1\nline2');
    });

    it('應該提取所有行', () => {
      const content = 'line1\nline2\nline3';
      const result = extractor.extractLines(content, 1, 3);

      expect(result.extractedLines).toEqual(['line1', 'line2', 'line3']);
      expect(result.linesCount).toBe(3);
      expect(result.remainingContent).toBe('');
    });

    it('應該拋出錯誤當起始行號小於 1', () => {
      const content = 'line1\nline2';
      expect(() => {
        extractor.extractLines(content, 0, 1);
      }).toThrow('起始行號必須 >= 1');
    });

    it('應該拋出錯誤當結束行號小於起始行號', () => {
      const content = 'line1\nline2\nline3';
      expect(() => {
        extractor.extractLines(content, 3, 2);
      }).toThrow('結束行號 (2) 不可小於起始行號 (3)');
    });

    it('應該拋出錯誤當起始行號超出範圍', () => {
      const content = 'line1\nline2';
      expect(() => {
        extractor.extractLines(content, 5, 5);
      }).toThrow('起始行號 (5) 超出檔案總行數 (2)');
    });

    it('應該拋出錯誤當結束行號超出範圍', () => {
      const content = 'line1\nline2';
      expect(() => {
        extractor.extractLines(content, 1, 5);
      }).toThrow('結束行號 (5) 超出檔案總行數 (2)');
    });

    it('應該處理空內容', () => {
      const content = '';
      const result = extractor.extractLines(content, 1, 1);

      expect(result.extractedLines).toEqual(['']);
      expect(result.linesCount).toBe(1);
    });

    it('應該處理包含空行的內容', () => {
      const content = 'line1\n\nline3';
      const result = extractor.extractLines(content, 2, 2);

      expect(result.extractedLines).toEqual(['']);
      expect(result.remainingContent).toBe('line1\nline3');
    });
  });

  describe('insertLines', () => {
    it('應該在開頭插入行', () => {
      const content = 'line1\nline2\nline3';
      const result = extractor.insertLines(content, ['newline'], 1);

      expect(result.content).toBe('newline\nline1\nline2\nline3');
      expect(result.insertedAt).toBe(1);
      expect(result.linesCount).toBe(1);
    });

    it('應該在中間插入行', () => {
      const content = 'line1\nline2\nline3';
      const result = extractor.insertLines(content, ['newline'], 2);

      expect(result.content).toBe('line1\nnewline\nline2\nline3');
      expect(result.insertedAt).toBe(2);
    });

    it('應該在末尾插入行', () => {
      const content = 'line1\nline2';
      const result = extractor.insertLines(content, ['newline'], 3);

      expect(result.content).toBe('line1\nline2\nnewline');
      expect(result.insertedAt).toBe(3);
    });

    it('應該插入多行', () => {
      const content = 'line1\nline2';
      const result = extractor.insertLines(content, ['new1', 'new2', 'new3'], 2);

      expect(result.content).toBe('line1\nnew1\nnew2\nnew3\nline2');
      expect(result.linesCount).toBe(3);
    });

    it('應該允許在檔案末尾後插入', () => {
      const content = 'line1\nline2';
      const result = extractor.insertLines(content, ['newline'], 3);

      expect(result.content).toBe('line1\nline2\nnewline');
    });

    it('應該拋出錯誤當插入位置小於 1', () => {
      const content = 'line1\nline2';
      expect(() => {
        extractor.insertLines(content, ['newline'], 0);
      }).toThrow('插入位置必須 >= 1');
    });

    it('應該拋出錯誤當插入位置超出範圍', () => {
      const content = 'line1\nline2';
      expect(() => {
        extractor.insertLines(content, ['newline'], 5);
      }).toThrow('插入位置 (5) 超出有效範圍');
    });

    it('應該處理空行數組', () => {
      const content = 'line1\nline2';
      const result = extractor.insertLines(content, [], 2);

      expect(result.content).toBe('line1\nline2');
      expect(result.linesCount).toBe(0);
    });

    it('應該處理空內容', () => {
      const content = '';
      const result = extractor.insertLines(content, ['newline'], 1);

      expect(result.content).toBe('newline\n');
    });
  });
});
