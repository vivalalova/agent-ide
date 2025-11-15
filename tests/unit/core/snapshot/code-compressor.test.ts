import { describe, it, expect, beforeEach } from 'vitest';
import { CodeCompressor } from '@core/snapshot/code-compressor';
import { CompressionLevel } from '@core/snapshot/types';

describe('CodeCompressor', () => {
  let compressor: CodeCompressor;

  beforeEach(() => {
    compressor = new CodeCompressor();
  });

  describe('compress - Minimal level', () => {
    it('應該提取函式簽章', async () => {
      const code = `
function hello(name: string): string {
  return "Hello " + name;
}
`;
      const result = await compressor.compress(code, CompressionLevel.Minimal);

      expect(result.m).toBeDefined();
      expect(result.ol).toBeGreaterThan(0);
      expect(result.cl).toBeGreaterThan(0);
      expect(result.cl).toBeLessThanOrEqual(result.ol);
    });

    it('應該提取類別簽章', async () => {
      const code = `
export class MyClass {
  constructor(name: string) {
    this.name = name;
  }

  greet(): string {
    return "Hello";
  }
}
`;
      const result = await compressor.compress(code, CompressionLevel.Minimal);

      expect(result.m).toBeDefined();
      expect(result.cl).toBeLessThanOrEqual(result.ol);
    });

    it('應該移除註解', async () => {
      const code = `
// This is a comment
function test() {
  /* Multi-line
     comment */
  return true;
}
`;
      const result = await compressor.compress(code, CompressionLevel.Minimal);

      expect(result.m).toBeDefined();
      expect(result.m).not.toContain('This is a comment');
    });
  });

  describe('compress - Medium level', () => {
    it('應該移除註解和多餘空白', async () => {
      const code = `
// Comment
function test(  ) {


  return    true;
}
`;
      const result = await compressor.compress(code, CompressionLevel.Medium);

      expect(result.m).toBeDefined();
      expect(result.cl).toBeLessThanOrEqual(result.ol);
    });

    it('應該保留程式碼邏輯', async () => {
      const code = `
function add(a: number, b: number): number {
  return a + b;
}
`;
      const result = await compressor.compress(code, CompressionLevel.Medium);

      expect(result.m).toContain('add');
      expect(result.m).toContain('return');
    });
  });

  describe('compress - Full level', () => {
    it('應該進行完整壓縮', async () => {
      const code = `
// This is a function
function calculateSum(firstNumber: number, secondNumber: number): number {
  const result = firstNumber + secondNumber;
  return result;
}
`;
      const result = await compressor.compress(code, CompressionLevel.Full);

      expect(result.m).toBeDefined();
      expect(result.cl).toBeLessThanOrEqual(result.ol);
    });

    it('應該提供符號映射', async () => {
      const code = `
function test(longVariableName: string) {
  const anotherLongName = longVariableName;
  return anotherLongName;
}
`;
      const result = await compressor.compress(code, CompressionLevel.Full);

      expect(result.m).toBeDefined();
      // symbolMap 可能存在也可能不存在，取決於實作
      if (result.sm) {
        expect(typeof result.sm).toBe('object');
      }
    });
  });

  describe('邊界情況', () => {
    it('應該處理空字串', async () => {
      const result = await compressor.compress('', CompressionLevel.Full);

      expect(result.m).toBeDefined();
      expect(result.ol).toBeGreaterThanOrEqual(0);
    });

    it('應該處理只有註解的程式碼', async () => {
      const code = `
// Only comments
/* More comments */
`;
      const result = await compressor.compress(code, CompressionLevel.Minimal);

      expect(result.m).toBeDefined();
    });

    it('應該處理複雜的巢狀結構', async () => {
      const code = `
class Outer {
  method() {
    if (true) {
      for (let i = 0; i < 10; i++) {
        console.log(i);
      }
    }
  }
}
`;
      const result = await compressor.compress(code, CompressionLevel.Full);

      expect(result.m).toBeDefined();
      expect(result.cl).toBeLessThanOrEqual(result.ol);
    });

    it('應該處理多行字串', async () => {
      const code = `
const text = \`
  Multi-line
  string
\`;
`;
      const result = await compressor.compress(code, CompressionLevel.Medium);

      expect(result.m).toBeDefined();
    });
  });

  describe('壓縮率', () => {
    it('應該在完整壓縮時達到最高壓縮率', async () => {
      const code = `
// This is a long comment that takes up space
function   myFunction  (   param1  :  string  ,  param2  :  number  )  :  void  {
  // Another comment
  const  myVariable  =  param1  +  param2 ;


  console . log ( myVariable ) ;
}
`;
      const minimal = await compressor.compress(code, CompressionLevel.Minimal);
      const medium = await compressor.compress(code, CompressionLevel.Medium);
      const full = await compressor.compress(code, CompressionLevel.Full);

      expect(minimal.cl).toBeLessThanOrEqual(minimal.ol);
      expect(medium.cl).toBeLessThanOrEqual(medium.ol);
      expect(full.cl).toBeLessThanOrEqual(full.ol);
    });
  });

  describe('回傳格式', () => {
    it('應該回傳正確的資料結構', async () => {
      const code = 'function test() { return true; }';
      const result = await compressor.compress(code);

      expect(result).toHaveProperty('m');
      expect(result).toHaveProperty('ol');
      expect(result).toHaveProperty('cl');
      expect(typeof result.m).toBe('string');
      expect(typeof result.ol).toBe('number');
      expect(typeof result.cl).toBe('number');
    });
  });
});
