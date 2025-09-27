/**
 * Refactor 模組邊界條件和異常處理參數化測試
 * 測試重構操作在各種極端條件下的行為
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { withMemoryOptimization } from '../../test-utils/cleanup';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

interface ExtractResult {
  success: boolean;
  newCode?: string;
  extractedFunction?: string;
  error?: string;
}

// 模擬函式提取器
class ExtractFunction {
  async extractFunction(code: string, startLine: number, endLine: number, functionName: string): Promise<ExtractResult> {
    // 參數驗證
    if (typeof code !== 'string') {
      return { success: false, error: '程式碼必須是字串' };
    }

    if (typeof startLine !== 'number' || !Number.isInteger(startLine)) {
      return { success: false, error: '起始行號必須是整數' };
    }

    if (typeof endLine !== 'number' || !Number.isInteger(endLine)) {
      return { success: false, error: '結束行號必須是整數' };
    }

    if (typeof functionName !== 'string') {
      return { success: false, error: '函式名稱必須是字串' };
    }

    if (startLine < 0) {
      return { success: false, error: '起始行號不能為負數' };
    }

    if (endLine < 0) {
      return { success: false, error: '結束行號不能為負數' };
    }

    if (startLine > endLine) {
      return { success: false, error: '起始行號不能大於結束行號' };
    }

    if (functionName.trim().length === 0) {
      return { success: false, error: '函式名稱不能為空' };
    }

    if (!this.isValidFunctionName(functionName)) {
      return { success: false, error: '函式名稱不是有效識別符' };
    }

    try {
      const lines = code.split('\n');

      if (startLine >= lines.length) {
        return { success: false, error: '起始行號超出程式碼範圍' };
      }

      if (endLine >= lines.length) {
        return { success: false, error: '結束行號超出程式碼範圍' };
      }

      // 提取選中的程式碼
      const extractedLines = lines.slice(startLine, endLine + 1);

      if (extractedLines.length === 0) {
        return { success: false, error: '沒有程式碼可供提取' };
      }

      // 檢查是否包含 return 語句
      const hasReturn = extractedLines.some(line => line.includes('return'));
      const returnType = hasReturn ? 'any' : 'void';

      // 生成提取的函式
      const extractedFunction = this.generateExtractedFunction(functionName, extractedLines, returnType);

      // 生成新的程式碼
      const newCode = this.generateNewCode(lines, startLine, endLine, functionName, hasReturn);

      return {
        success: true,
        newCode,
        extractedFunction
      };
    } catch (error) {
      return {
        success: false,
        error: `提取失敗: ${(error as Error).message}`
      };
    }
  }

  private isValidFunctionName(name: string): boolean {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
  }

  private generateExtractedFunction(name: string, lines: string[], returnType: string): string {
    const indent = '  ';
    const functionLines = [
      `function ${name}(): ${returnType} {`,
      ...lines.map(line => indent + line),
      '}'
    ];

    return functionLines.join('\n');
  }

  private generateNewCode(lines: string[], startLine: number, endLine: number, functionName: string, hasReturn: boolean): string {
    const newLines = [...lines];

    // 替換選中的程式碼為函式呼叫
    const callStatement = hasReturn ? `return ${functionName}();` : `${functionName}();`;

    // 移除原有程式碼行
    newLines.splice(startLine, endLine - startLine + 1, callStatement);

    return newLines.join('\n');
  }

  async inlineVariable(code: string, variableName: string): Promise<ExtractResult> {
    if (typeof code !== 'string') {
      return { success: false, error: '程式碼必須是字串' };
    }

    if (typeof variableName !== 'string') {
      return { success: false, error: '變數名稱必須是字串' };
    }

    if (variableName.trim().length === 0) {
      return { success: false, error: '變數名稱不能為空' };
    }

    if (!this.isValidFunctionName(variableName)) {
      return { success: false, error: '變數名稱不是有效識別符' };
    }

    try {
      // 簡化的內聯變數實作
      const lines = code.split('\n');
      let variableValue: string | null = null;
      const newLines: string[] = [];

      // 第一階段：找到變數定義
      for (const line of lines) {
        const match = line.match(new RegExp(`const\\s+${variableName}\\s*=\\s*(.+);`));
        if (match) {
          variableValue = match[1];
          continue; // 跳過變數定義行
        }
        newLines.push(line);
      }

      if (variableValue === null) {
        return { success: false, error: `找不到變數 ${variableName} 的定義` };
      }

      // 第二階段：替換變數使用
      const inlinedLines = newLines.map(line => {
        const regex = new RegExp(`\\b${variableName}\\b`, 'g');
        return line.replace(regex, variableValue!);
      });

      return {
        success: true,
        newCode: inlinedLines.join('\n')
      };
    } catch (error) {
      return {
        success: false,
        error: `內聯失敗: ${(error as Error).message}`
      };
    }
  }
}

describe('Refactor 模組邊界條件測試', () => {
  let testDir: string;
  let extractor: ExtractFunction;

  beforeEach(async () => {
    testDir = join(tmpdir(), `agent-ide-refactor-edge-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    extractor = new ExtractFunction();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理錯誤
    }
  });

  describe('ExtractFunction 參數驗證測試', () => {
    const validCode = 'function test() {\n  console.log("test");\n}';

    it.each([
      // [描述, 程式碼, 起始行, 結束行, 函式名, 預期錯誤]
      ['null 程式碼', null, 0, 1, 'extracted', '程式碼必須是字串'],
      ['undefined 程式碼', undefined, 0, 1, 'extracted', '程式碼必須是字串'],
      ['數字程式碼', 123, 0, 1, 'extracted', '程式碼必須是字串'],
      ['陣列程式碼', ['code'], 0, 1, 'extracted', '程式碼必須是字串'],
      ['null 起始行', validCode, null, 1, 'extracted', '起始行號必須是整數'],
      ['字串起始行', validCode, '0', 1, 'extracted', '起始行號必須是整數'],
      ['浮點起始行', validCode, 0.5, 1, 'extracted', '起始行號必須是整數'],
      ['null 結束行', validCode, 0, null, 'extracted', '結束行號必須是整數'],
      ['字串結束行', validCode, 0, '1', 'extracted', '結束行號必須是整數'],
      ['浮點結束行', validCode, 0, 1.5, 'extracted', '結束行號必須是整數'],
      ['null 函式名', validCode, 0, 1, null, '函式名稱必須是字串'],
      ['undefined 函式名', validCode, 0, 1, undefined, '函式名稱必須是字串'],
      ['數字函式名', validCode, 0, 1, 123, '函式名稱必須是字串'],
    ])('應該驗證參數類型：%s', withMemoryOptimization(async (description, code, startLine, endLine, functionName, expectedError) => {
      const result = await extractor.extractFunction(code as any, startLine as any, endLine as any, functionName as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedError);
    }, { testName: 'extract-param-type-test' }));

    it.each([
      ['負數起始行', validCode, -1, 1, 'extracted', '起始行號不能為負數'],
      ['負數結束行', validCode, 0, -1, 'extracted', '結束行號不能為負數'],
      ['起始行大於結束行', validCode, 5, 2, 'extracted', '起始行號不能大於結束行號'],
      ['空函式名', validCode, 0, 1, '', '函式名稱不能為空'],
      ['僅空白函式名', validCode, 0, 1, '   \t\n  ', '函式名稱不能為空'],
    ])('應該驗證參數範圍：%s', withMemoryOptimization(async (description, code, startLine, endLine, functionName, expectedError) => {
      const result = await extractor.extractFunction(code, startLine, endLine, functionName);

      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedError);
    }, { testName: 'extract-param-range-test' }));

    it.each([
      ['數字開頭', validCode, 0, 1, '1invalidName', '函式名稱不是有效識別符'],
      ['包含空格', validCode, 0, 1, 'invalid name', '函式名稱不是有效識別符'],
      ['包含連字號', validCode, 0, 1, 'invalid-name', '函式名稱不是有效識別符'],
      ['包含中文', validCode, 0, 1, '無效名稱', '函式名稱不是有效識別符'],
      ['包含特殊字符', validCode, 0, 1, 'invalid@name', '函式名稱不是有效識別符'],
    ])('應該驗證函式名格式：%s', withMemoryOptimization(async (description, code, startLine, endLine, functionName, expectedError) => {
      const result = await extractor.extractFunction(code, startLine, endLine, functionName);

      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedError);
    }, { testName: 'extract-name-format-test' }));

    it.each([
      ['單字符', 'a'],
      ['駝峰命名', 'extractedFunction'],
      ['底線分隔', 'extracted_function'],
      ['美元符號', '$extractedFunction'],
      ['數字結尾', 'function1'],
      ['全大寫', 'EXTRACTED_FUNCTION'],
    ])('應該接受有效函式名：%s', withMemoryOptimization(async (description, functionName) => {
      const result = await extractor.extractFunction(validCode, 0, 1, functionName);

      // 不應該因為函式名而失敗
      if (!result.success && result.error?.includes('函式名稱')) {
        throw new Error(`Valid function name rejected: ${functionName}`);
      }

      expect(result.error).not.toContain('函式名稱');
    }, { testName: 'extract-valid-name-test' }));
  });

  describe('ExtractFunction 程式碼範圍測試', () => {
    const testCode = `function example() {
  const x = 1;
  const y = 2;
  console.log(x + y);
  return x * y;
}`;

    it.each([
      ['起始行超出範圍', 10, 11, '起始行號超出程式碼範圍'],
      ['結束行超出範圍', 0, 10, '結束行號超出程式碼範圍'],
      ['兩行都超出範圍', 10, 15, '起始行號超出程式碼範圍'],
    ])('應該檢查行號範圍：%s', withMemoryOptimization(async (description, startLine, endLine, expectedError) => {
      const result = await extractor.extractFunction(testCode, startLine, endLine, 'extracted');

      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedError);
    }, { testName: 'extract-range-check-test' }));

    it('應該處理空程式碼', withMemoryOptimization(async () => {
      const result = await extractor.extractFunction('', 0, 0, 'extracted');

      expect(result.success).toBe(false);
      expect(result.error).toBe('起始行號超出程式碼範圍');
    }, { testName: 'extract-empty-code' }));

    it('應該處理僅空白行的程式碼', withMemoryOptimization(async () => {
      const whitespaceCode = '   \n\t\n   \n';

      const result = await extractor.extractFunction(whitespaceCode, 0, 2, 'extracted');

      expect(result.success).toBe(true);
      expect(result.newCode).toBeDefined();
      expect(result.extractedFunction).toBeDefined();
    }, { testName: 'extract-whitespace-code' }));

    it('應該成功提取有效範圍', withMemoryOptimization(async () => {
      const result = await extractor.extractFunction(testCode, 1, 2, 'extracted');

      expect(result.success).toBe(true);
      expect(result.newCode).toBeDefined();
      expect(result.extractedFunction).toBeDefined();

      // 檢查生成的函式包含提取的程式碼
      expect(result.extractedFunction).toContain('const x = 1;');
      expect(result.extractedFunction).toContain('const y = 2;');

      // 檢查新程式碼包含函式呼叫
      expect(result.newCode).toContain('extracted()');
    }, { testName: 'extract-valid-range' }));

    it('應該處理包含 return 語句的程式碼', withMemoryOptimization(async () => {
      const result = await extractor.extractFunction(testCode, 3, 4, 'extractedWithReturn');

      expect(result.success).toBe(true);
      expect(result.extractedFunction).toContain('return x * y;');
      expect(result.newCode).toContain('return extractedWithReturn()');
    }, { testName: 'extract-with-return' }));
  });

  describe('InlineVariable 邊界條件測試', () => {
    it.each([
      ['null 程式碼', null, 'variable', '程式碼必須是字串'],
      ['undefined 程式碼', undefined, 'variable', '程式碼必須是字串'],
      ['數字程式碼', 123, 'variable', '程式碼必須是字串'],
      ['null 變數名', 'code', null, '變數名稱必須是字串'],
      ['undefined 變數名', 'code', undefined, '變數名稱必須是字串'],
      ['數字變數名', 'code', 123, '變數名稱必須是字串'],
      ['空變數名', 'code', '', '變數名稱不能為空'],
      ['僅空白變數名', 'code', '   ', '變數名稱不能為空'],
    ])('應該驗證 inlineVariable 參數：%s', withMemoryOptimization(async (description, code, variableName, expectedError) => {
      const result = await extractor.inlineVariable(code as any, variableName as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedError);
    }, { testName: 'inline-param-test' }));

    it.each([
      ['數字開頭', '1invalid'],
      ['包含空格', 'invalid variable'],
      ['包含連字號', 'invalid-variable'],
      ['包含特殊字符', 'invalid@variable'],
    ])('應該驗證變數名格式：%s', withMemoryOptimization(async (description, variableName) => {
      const result = await extractor.inlineVariable('const x = 1;', variableName);

      expect(result.success).toBe(false);
      expect(result.error).toBe('變數名稱不是有效識別符');
    }, { testName: 'inline-name-format-test' }));

    it('應該處理找不到變數定義的情況', withMemoryOptimization(async () => {
      const code = 'const otherVariable = 1;\nconsole.log(otherVariable);';

      const result = await extractor.inlineVariable(code, 'nonExistentVariable');

      expect(result.success).toBe(false);
      expect(result.error).toBe('找不到變數 nonExistentVariable 的定義');
    }, { testName: 'inline-variable-not-found' }));

    it('應該成功內聯簡單變數', withMemoryOptimization(async () => {
      const code = `const message = "Hello World";
console.log(message);
return message;`;

      const result = await extractor.inlineVariable(code, 'message');

      expect(result.success).toBe(true);
      expect(result.newCode).toBeDefined();
      expect(result.newCode).toContain('console.log("Hello World");');
      expect(result.newCode).toContain('return "Hello World";');
      expect(result.newCode).not.toContain('const message =');
    }, { testName: 'inline-simple-variable' }));

    it('應該處理複雜表達式變數', withMemoryOptimization(async () => {
      const code = `const result = calculateSum(a, b) + 10;
console.log(result);
return result * 2;`;

      const result = await extractor.inlineVariable(code, 'result');

      expect(result.success).toBe(true);
      expect(result.newCode).toContain('calculateSum(a, b) + 10');
      expect(result.newCode).not.toContain('const result =');
    }, { testName: 'inline-complex-expression' }));
  });

  describe('極端情況測試', () => {
    it('應該處理超大程式碼', withMemoryOptimization(async () => {
      const largeCode = Array.from({ length: 10000 }, (_, i) =>
        `const variable${i} = ${i};`
      ).join('\n');

      const result = await extractor.extractFunction(largeCode, 100, 200, 'extractedLarge');

      expect(result.success).toBe(true);
    }, { testName: 'extract-large-code', timeout: 10000 }));

    it('應該處理深層嵌套程式碼', withMemoryOptimization(async () => {
      let nestedCode = 'function deepNested() {\n';

      for (let i = 0; i < 50; i++) {
        nestedCode += '  '.repeat(i + 1) + `if (condition${i}) {\n`;
      }

      nestedCode += '  '.repeat(51) + 'return true;\n';

      for (let i = 49; i >= 0; i--) {
        nestedCode += '  '.repeat(i + 1) + '}\n';
      }

      nestedCode += '}';

      const result = await extractor.extractFunction(nestedCode, 25, 27, 'extractedDeep');

      expect(result.success).toBe(true);
    }, { testName: 'extract-deep-nested' }));

    it('應該處理包含特殊字符的程式碼', withMemoryOptimization(async () => {
      const specialCode = `function test() {
  const emoji = "🚀 測試 ♠️";
  const unicode = "\\u4e2d\\u6587";
  const symbols = "!@#$%^&*()";
  console.log(emoji, unicode, symbols);
}`;

      const result = await extractor.extractFunction(specialCode, 1, 3, 'extractedSpecial');

      expect(result.success).toBe(true);
      expect(result.extractedFunction).toContain('🚀 測試 ♠️');
      expect(result.extractedFunction).toContain('\\u4e2d\\u6587');
    }, { testName: 'extract-special-characters' }));

    it('應該處理並發重構請求', withMemoryOptimization(async () => {
      const testCode = `function test() {
  const a = 1;
  const b = 2;
  const c = 3;
  return a + b + c;
}`;

      const operations = [
        { start: 1, end: 1, name: 'extracted1' },
        { start: 2, end: 2, name: 'extracted2' },
        { start: 3, end: 3, name: 'extracted3' }
      ];

      const results = await Promise.all(
        operations.map(op => extractor.extractFunction(testCode, op.start, op.end, op.name))
      );

      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    }, { testName: 'extract-concurrent' }));

    it('應該處理邊界情況組合', withMemoryOptimization(async () => {
      // 測試多種邊界情況的組合
      const testCases = [
        { code: '', start: 0, end: 0, name: 'empty', shouldFail: true },
        { code: 'x', start: 0, end: 0, name: 'singleChar', shouldFail: false },
        { code: '\n', start: 0, end: 0, name: 'newlineOnly', shouldFail: false },
        { code: 'a\n\nb\n', start: 0, end: 3, name: 'withEmpty', shouldFail: false }
      ];

      for (const testCase of testCases) {
        const result = await extractor.extractFunction(testCase.code, testCase.start, testCase.end, testCase.name);

        if (testCase.shouldFail) {
          expect(result.success).toBe(false);
        } else {
          // 不應該因為程式碼內容而直接失敗（可能因為行號範圍而失敗）
          if (!result.success && !result.error?.includes('行號')) {
            throw new Error(`Unexpected failure for case ${testCase.name}: ${result.error}`);
          }
        }
      }
    }, { testName: 'extract-boundary-combinations' }));
  });

  describe('錯誤恢復測試', () => {
    it('應該優雅處理語法錯誤的程式碼', withMemoryOptimization(async () => {
      const brokenCode = `function broken(
        console.log("missing closing parenthesis");
        return true
      }`;

      const result = await extractor.extractFunction(brokenCode, 1, 2, 'extractedBroken');

      // 即使程式碼有語法錯誤，提取器也不應該崩潰
      expect(result.success).toBe(true);
      expect(result.newCode).toBeDefined();
      expect(result.extractedFunction).toBeDefined();
    }, { testName: 'extract-syntax-errors' }));

    it('應該處理不完整的程式碼結構', withMemoryOptimization(async () => {
      const incompleteCode = `if (condition) {
  console.log("incomplete if block"`;

      const result = await extractor.extractFunction(incompleteCode, 0, 1, 'extractedIncomplete');

      expect(result.success).toBe(true);
    }, { testName: 'extract-incomplete-structure' }));
  });
});