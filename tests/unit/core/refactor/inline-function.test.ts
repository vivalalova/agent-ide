import { describe, it, expect, beforeEach } from 'vitest';
import { FunctionInliner } from '@core/refactor/inline-function';

describe('FunctionInliner', () => {
  let inliner: FunctionInliner;

  beforeEach(() => {
    inliner = new FunctionInliner();
  });

  describe('inline', () => {
    it('應該內聯簡單的函式', async () => {
      const code = `function add(a, b) {
  return a + b;
}
const result = add(x, y);`;

      const result = await inliner.inline(code, 'add');

      expect(result.success).toBe(true);
      expect(result.functionName).toBe('add');
      expect(result.inlinedCallsCount).toBe(1);
      expect(result.edits.length).toBeGreaterThan(0);
    });

    it('應該替換函式呼叫為函式體', async () => {
      const code = `function double(x) {
  return x * 2;
}
const result = double(5);`;

      const result = await inliner.inline(code, 'double');

      expect(result.success).toBe(true);
      expect(result.edits.some(edit => edit.type === 'replace')).toBe(true);
    });

    it('應該移除函式定義（當配置允許時）', async () => {
      const code = `function identity(x) {
  return x;
}
const y = identity(5);`;

      const config = {
        removeFunction: true,
        preserveComments: false,
        validateInlining: true,
        inlineAllCalls: true
      };

      const result = await inliner.inline(code, 'identity', config);

      expect(result.success).toBe(true);
      expect(result.removedFunction).toBe(true);
      expect(result.edits.some(edit => edit.type === 'delete')).toBe(true);
    });

    it('應該保留函式定義（當配置要求時）', async () => {
      const code = `function identity(x) {
  return x;
}
const y = identity(5);`;

      const config = {
        removeFunction: false,
        preserveComments: false,
        validateInlining: true,
        inlineAllCalls: true
      };

      const result = await inliner.inline(code, 'identity', config);

      expect(result.success).toBe(true);
      expect(result.removedFunction).toBe(false);
      expect(result.edits.every(edit => edit.type !== 'delete')).toBe(true);
    });

    it('應該內聯多個呼叫', async () => {
      const code = `function square(n) {
  return n * n;
}
const a = square(2);
const b = square(3);
const c = square(4);`;

      const result = await inliner.inline(code, 'square');

      expect(result.success).toBe(true);
      expect(result.inlinedCallsCount).toBe(3);
    });

    it('應該處理箭頭函式', async () => {
      const code = `const triple = (x) => {
  return x * 3;
}
const result = triple(5);`;

      const result = await inliner.inline(code, 'triple');

      expect(result.success).toBe(true);
      expect(result.inlinedCallsCount).toBe(1);
    });

    it('應該處理帶賦值的呼叫', async () => {
      const code = `function getValue() {
  return 42;
}
const x = getValue();`;

      const result = await inliner.inline(code, 'getValue');

      expect(result.success).toBe(true);
      expect(result.edits.some(edit => edit.newText.includes('x ='))).toBe(true);
    });

    it('應該產生警告當大小顯著增加', async () => {
      const largeBody = 'x'.repeat(600);
      const code = `function large() {
  ${largeBody}
}
const a = large();
const b = large();`;

      const result = await inliner.inline(code, 'large');

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('顯著增加程式碼大小'))).toBe(true);
    });

    it('應該處理異步函式', async () => {
      const code = `async function fetchData() {
  return await fetch("/api");
}
const data = await fetchData();`;

      const result = await inliner.inline(code, 'fetchData');

      expect(result.success).toBe(true);
    });
  });

  describe('preview', () => {
    it('應該產生內聯預覽', async () => {
      const code = `function add(a, b) {
  return a + b;
}
const result = add(1, 2);`;

      const preview = await inliner.preview(code, 'add');

      expect(preview.originalCode).toBe(code);
      expect(preview.modifiedCode).toBeDefined();
      expect(preview.removedFunction).toBeDefined();
      expect(preview.changesCount).toBeGreaterThan(0);
    });

    it('應該在內聯失敗時拋出錯誤', async () => {
      const code = 'const x = 1;'; // 沒有函式定義

      await expect(
        inliner.preview(code, 'nonexistent')
      ).rejects.toThrow();
    });
  });

  describe('inlineMultiple', () => {
    it('應該批次內聯多個函式', async () => {
      const code = `function double(x) {
  return x * 2;
}
function triple(x) {
  return x * 3;
}
const a = double(5);
const b = triple(5);`;

      const result = await inliner.inlineMultiple(code, ['double', 'triple']);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
      expect(result.code).toBeDefined();
    });
  });

  describe('錯誤處理', () => {
    it('應該拋出錯誤當程式碼為空', async () => {
      await expect(
        inliner.inline('', 'test')
      ).rejects.toThrow('程式碼不能為空');
    });

    it('應該拋出錯誤當函式名稱無效', async () => {
      const code = 'const x = 1;';

      await expect(
        inliner.inline(code, '')
      ).rejects.toThrow('函式名稱無效');
    });

    it('應該返回錯誤當找不到函式定義', async () => {
      const code = 'const x = 1;';

      const result = await inliner.inline(code, 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('找不到函式定義: nonexistent');
    });

    it('應該返回錯誤當函式是遞迴的', async () => {
      const code = `function factorial(n) {
  return n === 0 ? 1 : n * factorial(n - 1);
}
const result = factorial(5);`;

      const result = await inliner.inline(code, 'factorial');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('遞迴'))).toBe(true);
    });

    it('應該返回錯誤當函式使用 arguments', async () => {
      const code = `function useArgs() {
  return arguments[0];
}
const result = useArgs(1);`;

      const result = await inliner.inline(code, 'useArgs');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('arguments'))).toBe(true);
    });

    it('應該返回錯誤當函式使用 this', async () => {
      const code = `function useThis() {
  return this.value;
}
const result = useThis();`;

      const result = await inliner.inline(code, 'useThis');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('this'))).toBe(true);
    });

    it('應該返回錯誤當參數數量不匹配', async () => {
      const code = `function add(a, b) {
  return a + b;
}
const result = add(1);`; // 少一個參數

      const result = await inliner.inline(code, 'add');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('參數數量不匹配'))).toBe(true);
    });

    it('應該返回錯誤當異步函式缺少 await', async () => {
      const code = `async function fetchData() {
  return await fetch("/api");
}
const data = fetchData();`; // 缺少 await

      const result = await inliner.inline(code, 'fetchData');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('await'))).toBe(true);
    });
  });

  describe('邊界情況', () => {
    it('應該處理無參數函式', async () => {
      const code = `function getAnswer() {
  return 42;
}
const answer = getAnswer();`;

      const result = await inliner.inline(code, 'getAnswer');

      expect(result.success).toBe(true);
    });

    it('應該處理單行函式體', async () => {
      const code = `function identity(x) {return x;}
const y = identity(5);`;

      const result = await inliner.inline(code, 'identity');

      expect(result.success).toBe(true);
    });

    it('應該處理多行函式體', async () => {
      const code = `function complex(x) {
  const a = x * 2;
  const b = a + 1;
  return b;
}
const result = complex(5);`;

      const result = await inliner.inline(code, 'complex');

      expect(result.success).toBe(true);
    });

    it('應該處理帶註解的函式', async () => {
      const code = `/**
 * Adds two numbers
 */
function add(a, b) {
  return a + b;
}
const sum = add(1, 2);`;

      const result = await inliner.inline(code, 'add');

      expect(result.success).toBe(true);
    });

    it('應該處理嵌套在其他程式碼中的呼叫', async () => {
      const code = `function double(x) {
  return x * 2;
}
const result = double(5) + double(10);`;

      const result = await inliner.inline(code, 'double');

      expect(result.success).toBe(true);
      expect(result.inlinedCallsCount).toBe(2);
    });
  });

  describe('複雜案例', () => {
    it('應該正確替換參數', async () => {
      const code = `function multiply(a, b) {
  return a * b;
}
const result = multiply(x, y);`;

      const result = await inliner.inline(code, 'multiply');

      expect(result.success).toBe(true);
      // 編輯應該將 a 替換為 x，b 替換為 y
    });

    it('應該處理帶條件的函式體', async () => {
      const code = `function max(a, b) {
  if (a > b) {
    return a;
  } else {
    return b;
  }
}
const result = max(x, y);`;

      const result = await inliner.inline(code, 'max');

      expect(result.success).toBe(true);
    });

    it('應該處理帶迴圈的函式體', async () => {
      const code = `function sum(arr) {
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    total += arr[i];
  }
  return total;
}
const result = sum(numbers);`;

      const result = await inliner.inline(code, 'sum');

      expect(result.success).toBe(true);
    });
  });

  describe('配置選項', () => {
    it('應該支援 preserveComments 配置', async () => {
      const code = `function test() {
  return 1;
}
const x = test();`;

      const config = {
        removeFunction: true,
        preserveComments: true,
        validateInlining: true,
        inlineAllCalls: true
      };

      const result = await inliner.inline(code, 'test', config);

      expect(result.success).toBe(true);
    });

    it('應該支援 validateInlining 配置', async () => {
      const code = `function test() {
  return 1;
}
const x = test();`;

      const config = {
        removeFunction: true,
        preserveComments: false,
        validateInlining: false, // 禁用驗證
        inlineAllCalls: true
      };

      const result = await inliner.inline(code, 'test', config);

      expect(result.success).toBe(true);
    });

    it('應該支援 maxComplexity 配置', async () => {
      const code = `function simple() {
  return 1;
}
const x = simple();`;

      const config = {
        removeFunction: true,
        preserveComments: false,
        validateInlining: true,
        inlineAllCalls: true,
        maxComplexity: 10
      };

      const result = await inliner.inline(code, 'simple', config);

      expect(result.success).toBe(true);
    });
  });
});
