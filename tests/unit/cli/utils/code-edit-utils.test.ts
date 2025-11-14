/**
 * code-edit-utils 單元測試
 */

import { describe, it, expect } from 'vitest';
import { positionToOffset, applyEditCorrectly } from '../../../../src/interfaces/cli/utils/code-edit-utils.js';

describe('code-edit-utils', () => {
  describe('positionToOffset', () => {
    it('應該計算正確的偏移量', () => {
      const lines = ['line1', 'line2', 'line3'];
      const position = { line: 2, column: 3 };

      const offset = positionToOffset(lines, position);

      // line1\n (6) + line2\n (6) + 3 = 15
      expect(offset).toBe(15);
    });

    it('應該處理第一行', () => {
      const lines = ['line1', 'line2'];
      const position = { line: 1, column: 0 };

      const offset = positionToOffset(lines, position);

      expect(offset).toBe(0);
    });

    it('應該處理行尾位置', () => {
      const lines = ['hello', 'world'];
      const position = { line: 1, column: 5 };

      const offset = positionToOffset(lines, position);

      // "hello" 的長度是 5
      expect(offset).toBe(5);
    });

    it('應該處理空行', () => {
      const lines = ['line1', '', 'line3'];
      const position = { line: 3, column: 0 };

      const offset = positionToOffset(lines, position);

      // line1\n (6) + \n (1) = 7
      expect(offset).toBe(7);
    });
  });

  describe('applyEditCorrectly', () => {
    it('應該正確應用 replace 編輯', () => {
      const code = 'function foo() {\n  return 42;\n}';
      const edit = {
        type: 'replace' as const,
        range: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 13 }
        },
        newText: 'function bar() {'
      };

      const result = applyEditCorrectly(code, edit);

      expect(result).toContain('function bar() {');
      expect(result).toContain('return 42;');
    });

    it('應該正確應用 insert 編輯', () => {
      const code = 'line1\nline2';
      const edit = {
        type: 'insert' as const,
        position: { line: 1, column: 5 },
        newText: '\ninserted'
      };

      const result = applyEditCorrectly(code, edit);

      expect(result).toContain('line1');
      expect(result).toContain('inserted');
      expect(result).toContain('line2');
    });

    it('應該正確應用 delete 編輯', () => {
      const code = 'function foo() {\n  return 42;\n}';
      const edit = {
        type: 'delete' as const,
        range: {
          start: { line: 2, column: 2 },
          end: { line: 2, column: 13 }
        }
      };

      const result = applyEditCorrectly(code, edit);

      expect(result).toContain('function foo() {');
      expect(result).not.toContain('return 42;');
    });

    it('應該處理多行編輯', () => {
      const code = 'line1\nline2\nline3';
      const edit = {
        type: 'replace' as const,
        range: {
          start: { line: 1, column: 0 },
          end: { line: 2, column: 5 }
        },
        newText: 'replaced'
      };

      const result = applyEditCorrectly(code, edit);

      expect(result).toContain('replaced');
      expect(result).toContain('line3');
      expect(result).not.toContain('line1');
      expect(result).not.toContain('line2');
    });

    it('應該保留未修改的代碼', () => {
      const code = 'const a = 1;\nconst b = 2;\nconst c = 3;';
      const edit = {
        type: 'replace' as const,
        range: {
          start: { line: 2, column: 0 },
          end: { line: 2, column: 11 }
        },
        newText: 'const b = 20;'
      };

      const result = applyEditCorrectly(code, edit);

      expect(result).toContain('const a = 1;');
      expect(result).toContain('const b = 20;');
      expect(result).toContain('const c = 3;');
    });
  });
});
