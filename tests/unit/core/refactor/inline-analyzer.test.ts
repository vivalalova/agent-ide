import { describe, it, expect, beforeEach } from 'vitest';
import { InlineAnalyzer, type FunctionDefinition, type FunctionCall } from '@core/refactor/inline-function';

describe('InlineAnalyzer', () => {
  let analyzer: InlineAnalyzer;

  beforeEach(() => {
    analyzer = new InlineAnalyzer();
  });

  describe('analyze', () => {
    it('應該分析簡單的函式內聯', () => {
      const functionDef: FunctionDefinition = {
        name: 'add',
        parameters: ['a', 'b'],
        body: 'return a + b;',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 30 }
        },
        isArrow: false,
        isAsync: false
      };

      const calls: FunctionCall[] = [
        {
          name: 'add',
          arguments: ['x', 'y'],
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 10 }
          },
          isAwait: false
        }
      ];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.canInline).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.callsCount).toBe(1);
      expect(result.complexity).toBeGreaterThan(0);
    });

    it('應該拒絕無效的函式定義', () => {
      const functionDef: FunctionDefinition = {
        name: 'test',
        parameters: [],
        body: '',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 10 }
        },
        isArrow: false,
        isAsync: false
      };

      const calls: FunctionCall[] = [];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.canInline).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('應該拒絕沒有呼叫的函式', () => {
      const functionDef: FunctionDefinition = {
        name: 'unused',
        parameters: [],
        body: 'return 1;',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 20 }
        },
        isArrow: false,
        isAsync: false
      };

      const calls: FunctionCall[] = [];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.canInline).toBe(false);
      expect(result.issues).toContain('沒有找到函式呼叫');
    });

    it('應該計算函式複雜度', () => {
      const simpleFunctionDef: FunctionDefinition = {
        name: 'simple',
        parameters: [],
        body: 'return 1;',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 20 }
        },
        isArrow: false,
        isAsync: false
      };

      const complexFunctionDef: FunctionDefinition = {
        name: 'complex',
        parameters: [],
        body: 'if (x) { if (y) { for (let i = 0; i < 10; i++) { return i; } } }',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 70 }
        },
        isArrow: false,
        isAsync: false
      };

      const calls: FunctionCall[] = [
        {
          name: 'test',
          arguments: [],
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 6 }
          },
          isAwait: false
        }
      ];

      const simpleResult = analyzer.analyze(simpleFunctionDef, calls);
      const complexResult = analyzer.analyze(complexFunctionDef, calls);

      expect(complexResult.complexity).toBeGreaterThan(simpleResult.complexity);
    });

    it('應該估算大小增長', () => {
      const functionDef: FunctionDefinition = {
        name: 'test',
        parameters: [],
        body: 'return 1;',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 20 }
        },
        isArrow: false,
        isAsync: false
      };

      const calls: FunctionCall[] = [
        {
          name: 'test',
          arguments: [],
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 6 }
          },
          isAwait: false
        },
        {
          name: 'test',
          arguments: [],
          location: {
            start: { line: 10, column: 0 },
            end: { line: 10, column: 6 }
          },
          isAwait: false
        }
      ];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.estimatedSizeIncrease).toBeGreaterThan(0);
      // 2 次呼叫 - 1 (原函式移除) = 淨增加 1 次函式體
      expect(result.estimatedSizeIncrease).toBe(functionDef.body.length * 1);
    });

    it('應該檢測遞迴函式', () => {
      const functionDef: FunctionDefinition = {
        name: 'factorial',
        parameters: ['n'],
        body: 'return n === 0 ? 1 : n * factorial(n - 1);',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 50 }
        },
        isArrow: false,
        isAsync: false
      };

      const calls: FunctionCall[] = [
        {
          name: 'factorial',
          arguments: ['5'],
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 12 }
          },
          isAwait: false
        }
      ];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.canInline).toBe(false);
      expect(result.issues).toContain('函式包含遞迴調用，無法內聯');
    });

    it('應該檢測過大的函式', () => {
      const functionDef: FunctionDefinition = {
        name: 'large',
        parameters: [],
        body: 'x'.repeat(250), // 超過 200 字元
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 260 }
        },
        isArrow: false,
        isAsync: false
      };

      const calls: FunctionCall[] = [
        {
          name: 'large',
          arguments: [],
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 7 }
          },
          isAwait: false
        }
      ];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.canInline).toBe(false);
      expect(result.issues).toContain('函式過大，內聯可能降低可讀性');
    });

    it('應該檢測使用 arguments 的函式', () => {
      const functionDef: FunctionDefinition = {
        name: 'useArgs',
        parameters: [],
        body: 'return arguments[0];',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 30 }
        },
        isArrow: false,
        isAsync: false
      };

      const calls: FunctionCall[] = [
        {
          name: 'useArgs',
          arguments: ['x'],
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 10 }
          },
          isAwait: false
        }
      ];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.canInline).toBe(false);
      expect(result.issues).toContain('函式使用 arguments 對象，內聯可能有問題');
    });

    it('應該檢測使用 this 的函式', () => {
      const functionDef: FunctionDefinition = {
        name: 'useThis',
        parameters: [],
        body: 'return this.value;',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 30 }
        },
        isArrow: false,
        isAsync: false
      };

      const calls: FunctionCall[] = [
        {
          name: 'useThis',
          arguments: [],
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 9 }
          },
          isAwait: false
        }
      ];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.canInline).toBe(false);
      expect(result.issues).toContain('函式使用 this，內聯可能改變上下文');
    });

    it('應該檢查參數數量匹配', () => {
      const functionDef: FunctionDefinition = {
        name: 'add',
        parameters: ['a', 'b'],
        body: 'return a + b;',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 30 }
        },
        isArrow: false,
        isAsync: false
      };

      const calls: FunctionCall[] = [
        {
          name: 'add',
          arguments: ['x'], // 只有一個參數，應該要兩個
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 6 }
          },
          isAwait: false
        }
      ];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.canInline).toBe(false);
      expect(result.issues.some(issue => issue.includes('參數數量不匹配'))).toBe(true);
    });

    it('應該檢查異步函式的 await', () => {
      const functionDef: FunctionDefinition = {
        name: 'fetchData',
        parameters: [],
        body: 'return await fetch("/api");',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 40 }
        },
        isArrow: false,
        isAsync: true
      };

      const calls: FunctionCall[] = [
        {
          name: 'fetchData',
          arguments: [],
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 11 }
          },
          isAwait: false // 缺少 await
        }
      ];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.canInline).toBe(false);
      expect(result.issues).toContain('異步函式呼叫缺少 await');
    });

    it('應該允許異步函式內聯（修正後的行為）', () => {
      const functionDef: FunctionDefinition = {
        name: 'fetchData',
        parameters: [],
        body: 'return await fetch("/api");',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 40 }
        },
        isArrow: false,
        isAsync: true
      };

      const calls: FunctionCall[] = [
        {
          name: 'fetchData',
          arguments: [],
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 16 }
          },
          isAwait: true // 有 await
        }
      ];

      const result = analyzer.analyze(functionDef, calls);

      // 異步函式可以內聯，只要有正確的 await
      expect(result.canInline).toBe(true);
    });
  });

  describe('複雜度計算', () => {
    it('應該計算 if 語句的複雜度', () => {
      const functionDef: FunctionDefinition = {
        name: 'test',
        parameters: [],
        body: 'if (x) { return 1; }',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 30 }
        },
        isArrow: false,
        isAsync: false
      };

      const calls: FunctionCall[] = [
        {
          name: 'test',
          arguments: [],
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 6 }
          },
          isAwait: false
        }
      ];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.complexity).toBeGreaterThan(1); // 基礎 1 + if 1
    });

    it('應該計算迴圈的複雜度', () => {
      const functionDef: FunctionDefinition = {
        name: 'test',
        parameters: [],
        body: 'for (let i = 0; i < 10; i++) { } while (x) { }',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 50 }
        },
        isArrow: false,
        isAsync: false
      };

      const calls: FunctionCall[] = [
        {
          name: 'test',
          arguments: [],
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 6 }
          },
          isAwait: false
        }
      ];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.complexity).toBeGreaterThan(2); // 基礎 1 + for 1 + while 1
    });

    it('應該計算邏輯運算子的複雜度', () => {
      const functionDef: FunctionDefinition = {
        name: 'test',
        parameters: [],
        body: 'return x && y || z;',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 30 }
        },
        isArrow: false,
        isAsync: false
      };

      const calls: FunctionCall[] = [
        {
          name: 'test',
          arguments: [],
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 6 }
          },
          isAwait: false
        }
      ];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.complexity).toBeGreaterThan(1); // 基礎 1 + && 1 + || 1
    });
  });

  describe('邊界情況', () => {
    it('應該處理空函式體', () => {
      const functionDef: FunctionDefinition = {
        name: 'empty',
        parameters: [],
        body: '',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 10 }
        },
        isArrow: false,
        isAsync: false
      };

      const calls: FunctionCall[] = [
        {
          name: 'empty',
          arguments: [],
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 7 }
          },
          isAwait: false
        }
      ];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.canInline).toBe(false);
    });

    it('應該處理箭頭函式', () => {
      const functionDef: FunctionDefinition = {
        name: 'arrow',
        parameters: ['x'],
        body: 'return x * 2;',
        location: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 30 }
        },
        isArrow: true,
        isAsync: false
      };

      const calls: FunctionCall[] = [
        {
          name: 'arrow',
          arguments: ['5'],
          location: {
            start: { line: 5, column: 0 },
            end: { line: 5, column: 8 }
          },
          isAwait: false
        }
      ];

      const result = analyzer.analyze(functionDef, calls);

      expect(result.canInline).toBe(true);
    });
  });
});
