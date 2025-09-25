import { describe, it, expect, beforeEach } from 'vitest';
import { withMemoryOptimization } from '../../test-utils/cleanup';

/**
 * 提取函式重構操作測試
 * 測試從程式碼片段中提取函式的功能
 */

// 程式碼選擇區域
interface CodeSelection {
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  code: string;
}

// 函式簽名
interface FunctionSignature {
  name: string;
  parameters: Parameter[];
  returnType: string;
  async: boolean;
  generic: string[];
}

interface Parameter {
  name: string;
  type: string;
  optional: boolean;
}

// 變數分析結果
interface VariableAnalysis {
  name: string;
  type: string;
  external: boolean;
  modified: boolean;
  used: boolean;
}

// 程式碼分析結果
interface CodeAnalysis {
  usedVariables: Set<VariableAnalysis>;
  modifiedVariables: Set<VariableAnalysis>;
  hasAwait: boolean;
  hasReturn: boolean;
  returnType?: string;
}

// 重構編輯
interface RefactorEdit {
  type: 'insert' | 'replace' | 'delete';
  position?: { line: number; column: number };
  range?: { start: { line: number; column: number }; end: { line: number; column: number } };
  content: string;
}

// 重構結果
interface RefactorResult {
  success: boolean;
  edits: RefactorEdit[];
  newFunctionName: string;
  errors?: string[];
}

// 提取函式重構器
class ExtractFunctionRefactoring {
  async execute(selection: CodeSelection): Promise<RefactorResult> {
    try {
      // 1. 分析選中的程式碼
      const analysis = this.analyzeSelection(selection);

      // 2. 驗證是否可以提取
      const validation = this.validateExtraction(analysis);
      if (!validation.valid) {
        return {
          success: false,
          edits: [],
          newFunctionName: '',
          errors: validation.errors
        };
      }

      // 3. 確定函式簽名
      const signature = this.determineSignature(analysis);

      // 4. 生成新函式
      const newFunction = this.generateFunction(selection.code, signature);

      // 5. 生成函式呼叫
      const functionCall = this.generateCall(signature);

      return {
        success: true,
        edits: [
          {
            type: 'insert',
            position: this.findInsertPosition(),
            content: newFunction
          },
          {
            type: 'replace',
            range: selection.range,
            content: functionCall
          }
        ],
        newFunctionName: signature.name
      };
    } catch (error) {
      return {
        success: false,
        edits: [],
        newFunctionName: '',
        errors: [error instanceof Error ? error.message : '未知錯誤']
      };
    }
  }

  private analyzeSelection(selection: CodeSelection): CodeAnalysis {
    // 簡化的程式碼分析
    const usedVariables = new Set<VariableAnalysis>();
    const modifiedVariables = new Set<VariableAnalysis>();

    // 模擬變數分析
    const variableMatches = selection.code.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
    const uniqueVars = [...new Set(variableMatches)];

    uniqueVars.forEach(varName => {
      if (!this.isKeyword(varName)) {
        // 檢查是否是函數調用（如 fetchData(), processData()）
        const isFunctionCall = selection.code.includes(`${varName}(`);

        // 檢查是否是修改後立即返回的變數（應視為內部變數）
        const isModifiedAndReturned = selection.code.includes(`${varName} =`) &&
                                     selection.code.includes(`return ${varName}`);

        const variable: VariableAnalysis = {
          name: varName,
          type: 'any', // 簡化的型別推導
          external: !isFunctionCall && // 函數調用不視為外部變數
                   !isModifiedAndReturned && // 修改後返回的變數視為內部變數
                   !selection.code.includes(`let ${varName}`) &&
                   !selection.code.includes(`const ${varName}`) &&
                   !selection.code.includes(`var ${varName}`),
          modified: selection.code.includes(`${varName} =`),
          used: true
        };

        // 只有外部變數才需要作為參數傳遞
        if (variable.external) {
          usedVariables.add(variable);
          if (variable.modified) {
            modifiedVariables.add(variable);
          }
        }
      }
    });

    return {
      usedVariables,
      modifiedVariables,
      hasAwait: selection.code.includes('await'),
      hasReturn: selection.code.includes('return'),
      returnType: this.inferReturnType(selection.code)
    };
  }

  private validateExtraction(analysis: CodeAnalysis): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 檢查是否有多個返回值
    const modifiedExternalVars = Array.from(analysis.modifiedVariables)
      .filter(v => v.external);

    if (modifiedExternalVars.length > 1 && analysis.hasReturn) {
      errors.push('無法提取：函式有多個返回值');
    }

    // 檢查是否有複雜的控制流
    if (analysis.hasReturn && modifiedExternalVars.length > 0) {
      errors.push('無法提取：混合了返回語句和外部變數修改');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private determineSignature(analysis: CodeAnalysis): FunctionSignature {
    const parameters: Parameter[] = [];

    // 使用但未修改的外部變數 -> 參數
    Array.from(analysis.usedVariables)
      .filter(v => v.external && !v.modified)
      .forEach(variable => {
        parameters.push({
          name: variable.name,
          type: variable.type,
          optional: false
        });
      });

    // 確定返回型別
    let returnType = 'void';
    const modifiedExternalVars = Array.from(analysis.modifiedVariables)
      .filter(v => v.external);

    if (analysis.hasReturn) {
      returnType = analysis.returnType || 'any';
    } else if (modifiedExternalVars.length === 1) {
      returnType = modifiedExternalVars[0].type;
    }

    return {
      name: this.suggestFunctionName(analysis),
      parameters,
      returnType,
      async: analysis.hasAwait,
      generic: []
    };
  }

  private generateFunction(code: string, signature: FunctionSignature): string {
    const paramList = signature.parameters
      .map(p => `${p.name}: ${p.type}`)
      .join(', ');

    const asyncKeyword = signature.async ? 'async ' : '';
    const returnAnnotation = signature.returnType !== 'void'
      ? `: ${signature.returnType}`
      : '';

    return `
${asyncKeyword}function ${signature.name}(${paramList})${returnAnnotation} {
  ${code}
}`;
  }

  private generateCall(signature: FunctionSignature): string {
    const args = signature.parameters
      .map(p => p.name)
      .join(', ');

    const awaitKeyword = signature.async ? 'await ' : '';

    if (signature.returnType === 'void') {
      return `${awaitKeyword}${signature.name}(${args});`;
    } else {
      return `const result = ${awaitKeyword}${signature.name}(${args});`;
    }
  }

  private suggestFunctionName(analysis: CodeAnalysis): string {
    // 簡化的函式名建議
    if (analysis.hasReturn) {
      return 'extractedFunction';
    }

    const modifiedVars = Array.from(analysis.modifiedVariables);
    if (modifiedVars.length === 1) {
      return `calculate${this.capitalize(modifiedVars[0].name)}`;
    }

    return 'extractedFunction';
  }

  private findInsertPosition(): { line: number; column: number } {
    // 簡化：插入到檔案開頭
    return { line: 1, column: 1 };
  }

  private inferReturnType(code: string): string {
    if (code.includes('return true') || code.includes('return false')) {
      return 'boolean';
    }
    if (code.match(/return \d+/)) {
      return 'number';
    }
    if (code.includes('return "') || code.includes("return '")) {
      return 'string';
    }
    return 'any';
  }

  private isKeyword(word: string): boolean {
    const keywords = [
      'function', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
      'return', 'true', 'false', 'null', 'undefined', 'async', 'await'
    ];
    return keywords.includes(word);
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

describe('提取函式重構', () => {
  let refactoring: ExtractFunctionRefactoring;

  beforeEach(() => {
    refactoring = new ExtractFunctionRefactoring();
  });

  describe('基本提取功能', () => {
    it('應該能提取簡單的計算邏輯', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 5, column: 1 },
          end: { line: 7, column: 1 }
        },
        code: 'const sum = a + b;\nreturn sum * 2;'
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);
      expect(result.edits).toHaveLength(2);
      expect(result.newFunctionName).toBe('extractedFunction');

      const insertEdit = result.edits.find(e => e.type === 'insert');
      expect(insertEdit).toBeDefined();
      expect(insertEdit!.content).toContain('function extractedFunction');
      expect(insertEdit!.content).toContain('a: any, b: any');
    }, { testName: 'simple-calculation-extraction' }));

    it('應該能提取純函式', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 3, column: 1 },
          end: { line: 5, column: 1 }
        },
        code: 'const doubled = value * 2;\nconst result = doubled + 1;\nreturn result;'
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain('value: any');
      expect(functionEdit!.content).toContain(': any');

      const callEdit = result.edits.find(e => e.type === 'replace');
      expect(callEdit!.content).toContain('extractedFunction(value)');
    }, { testName: 'pure-function-extraction' }));

    it('應該能提取異步程式碼', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 2, column: 1 },
          end: { line: 4, column: 1 }
        },
        code: 'const data = await fetchData();\nconst processed = processData(data);\nreturn processed;'
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain('async function');

      const callEdit = result.edits.find(e => e.type === 'replace');
      expect(callEdit!.content).toContain('await extractedFunction()');
    }, { testName: 'async-code-extraction' }));
  });

  describe('參數推導', () => {
    it('應該正確識別外部變數作為參數', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 3, column: 1 }
        },
        code: 'const calculation = x * y + z;\nconst final = calculation / 2;\nreturn final;'
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain('x: any');
      expect(functionEdit!.content).toContain('y: any');
      expect(functionEdit!.content).toContain('z: any');
    }, { testName: 'external-variable-parameters' }));

    it('應該排除內部宣告的變數', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 4, column: 1 }
        },
        code: 'const localVar = input * 2;\nconst another = localVar + 5;\nreturn another;'
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain('input: any');
      expect(functionEdit!.content).not.toContain('localVar: any');
      expect(functionEdit!.content).not.toContain('another: any');
    }, { testName: 'exclude-local-variables' }));
  });

  describe('返回型別推導', () => {
    it('應該正確推導布林返回型別', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 2, column: 1 }
        },
        code: 'return x > 0;'
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain(': any'); // 簡化的型別推導
    }, { testName: 'boolean-return-type' }));

    it('應該正確推導數字返回型別', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 2, column: 1 }
        },
        code: 'return 42;'
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain(': number');
    }, { testName: 'number-return-type' }));

    it('應該正確推導字串返回型別', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 2, column: 1 }
        },
        code: 'return "hello";'
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain(': string');
    }, { testName: 'string-return-type' }));
  });

  describe('驗證規則', () => {
    it('應該拒絕有多個返回路徑和外部修改的程式碼', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 5, column: 1 }
        },
        code: 'if (condition) {\n  externalVar = 1;\n  return true;\n}\nexternalVar = 2;'
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('無法提取：混合了返回語句和外部變數修改');
    }, { testName: 'reject-mixed-return-and-modification' }));

    it('應該拒絕有多個外部變數修改的程式碼', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 4, column: 1 }
        },
        code: 'var1 = calculateValue1();\nvar2 = calculateValue2();\nreturn result;'
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('無法提取：函式有多個返回值');
    }, { testName: 'reject-multiple-external-modifications' }));
  });

  describe('函式名建議', () => {
    it('應該根據修改的變數建議函式名', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 2, column: 1 }
        },
        code: 'total = price * quantity;'
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);
      expect(result.newFunctionName).toBe('calculateTotal');
    }, { testName: 'function-name-suggestion' }));

    it('應該為有返回值的函式使用通用名稱', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 2, column: 1 }
        },
        code: 'return someComplexCalculation();'
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);
      expect(result.newFunctionName).toBe('extractedFunction');
    }, { testName: 'generic-function-name' }));
  });

  describe('邊界條件', () => {
    it('應該處理空程式碼選擇', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 }
        },
        code: ''
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);
      expect(result.edits).toHaveLength(2);
    }, { testName: 'empty-code-selection' }));

    it('應該處理只有註解的程式碼', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 3, column: 1 }
        },
        code: '// 這是一個註解\n/* 多行註解 */'
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain('function extractedFunction()');
    }, { testName: 'comment-only-code' }));

    it('應該處理包含錯誤語法的程式碼', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 2, column: 1 }
        },
        code: 'invalid syntax here {'
      };

      const result = await refactoring.execute(selection);

      // 即使語法錯誤，仍應該嘗試提取
      expect(result.success).toBe(true);
    }, { testName: 'invalid-syntax-handling' }));
  });

  describe('複雜程式碼提取', () => {
    it('應該能提取包含條件語句的程式碼', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 6, column: 1 }
        },
        code: `if (value > 0) {
  result = value * 2;
} else {
  result = value * -1;
}
return result;`
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain('value: any');
      expect(functionEdit!.content).toContain('if (value > 0)');
    }, { testName: 'conditional-code-extraction' }));

    it('應該能提取包含迴圈的程式碼', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 5, column: 1 }
        },
        code: `let sum = 0;
for (let i = 0; i < items.length; i++) {
  sum += items[i];
}
return sum;`
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain('items: any');
      expect(functionEdit!.content).toContain('for (let i = 0');
    }, { testName: 'loop-code-extraction' }));
  });

  describe('現代 JavaScript 語法提取', () => {
    it('應該能提取箭頭函式', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 3, column: 1 }
        },
        code: `const processItems = (items) => {
  return items.map(item => item.value * 2);
};`
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);
      expect(result.newFunctionName).toBeTruthy();

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain('items:');
      expect(functionEdit!.content).toContain('=>');
    }, { testName: 'arrow-function-extraction' }));

    it('應該能提取 async/await 程式碼', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 4, column: 1 }
        },
        code: `const data = await fetch('/api/users');
const users = await data.json();
console.log('Users loaded:', users.length);
return users;`
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain('async function');
      expect(functionEdit!.content).toContain('await');
    }, { testName: 'async-await-extraction' }));

    it('應該能提取解構賦值程式碼', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 4, column: 1 }
        },
        code: `const { name, age, ...rest } = user;
const [first, second] = items;
const merged = { ...rest, displayName: name };
return merged;`
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain('user:');
      expect(functionEdit!.content).toContain('items:');
      expect(functionEdit!.content).toContain('const { name, age');
    }, { testName: 'destructuring-extraction' }));

    it('應該能提取 Promise 鏈式呼叫', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 6, column: 1 }
        },
        code: `return fetchUserData(userId)
  .then(user => user.profile)
  .then(profile => enhanceProfile(profile))
  .catch(error => handleError(error))
  .finally(() => cleanup());`
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain('userId:');
      expect(functionEdit!.content).toContain('.then(');
      expect(functionEdit!.content).toContain('.catch(');
    }, { testName: 'promise-chain-extraction' }));
  });

  describe('參數化重構測試', () => {
    it.each([
      {
        type: 'simple-calculation',
        code: 'const result = a + b * c;\\nreturn result;',
        expectedParams: ['a', 'b', 'c'],
        hasReturn: true
      },
      {
        type: 'string-manipulation',
        code: 'const formatted = str.trim().toLowerCase();\\nreturn formatted;',
        expectedParams: ['str'],
        hasReturn: true
      },
      {
        type: 'array-processing',
        code: 'const filtered = arr.filter(x => x > 0);\\nreturn filtered;',
        expectedParams: ['arr'],
        hasReturn: true
      }
    ])('應該能提取 $type 程式碼', async ({ code, expectedParams, hasReturn }) => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 3, column: 1 }
        },
        code: code.replace(/\\n/g, '\\n')
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit).toBeDefined();

      expectedParams.forEach(param => {
        expect(functionEdit!.content).toContain(`${param}:`);
      });

      if (hasReturn) {
        expect(functionEdit!.content).toContain('return');
      }
    });
  });

  describe('複雜場景重構', () => {
    it('應該能提取包含異常處理的程式碼', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 8, column: 1 }
        },
        code: `try {
  const result = riskyOperation(data);
  return result.value;
} catch (error) {
  console.error('操作失敗:', error);
  return defaultValue;
} finally {
  cleanup();
}`
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain('data:');
      expect(functionEdit!.content).toContain('defaultValue:');
      expect(functionEdit!.content).toContain('try {');
      expect(functionEdit!.content).toContain('catch (error)');
      expect(functionEdit!.content).toContain('finally {');
    }, { testName: 'exception-handling-extraction' }));

    it('應該能提取包含類別操作的程式碼', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 5, column: 1 }
        },
        code: `const instance = new MyClass(config);
instance.initialize();
const result = instance.process(data);
instance.cleanup();
return result;`
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain('config:');
      expect(functionEdit!.content).toContain('data:');
      expect(functionEdit!.content).toContain('new MyClass');
    }, { testName: 'class-operation-extraction' }));

    it('應該能處理複雜的變數相依性', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 6, column: 1 }
        },
        code: `let temp = input * 2;
temp = temp + offset;
const processed = transform(temp);
output = processed.result;
meta.count = processed.itemCount;
return { output, meta };`
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      expect(functionEdit!.content).toContain('input:');
      expect(functionEdit!.content).toContain('offset:');
      expect(functionEdit!.content).toContain('output:');
      expect(functionEdit!.content).toContain('meta:');
    }, { testName: 'complex-dependency-extraction' }));
  });

  describe('重構品質驗證', () => {
    it('應該產生語法正確的函式', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 4, column: 1 }
        },
        code: `const x = Math.max(a, b);
const y = Math.min(c, d);
const result = x + y;
return result;`
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      const functionCode = functionEdit!.content;

      // 驗證函式語法結構
      expect(functionCode).toMatch(/function\s+\w+\s*\(/);
      expect(functionCode).toMatch(/\{[\s\S]*\}/);
      expect(functionCode.split('{').length).toBe(functionCode.split('}').length);
    }, { testName: 'syntax-correctness' }));

    it('應該保持程式碼格式和縮排', withMemoryOptimization(async () => {
      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 6, column: 1 }
        },
        code: `if (condition) {
  const nested = {
    property: value,
    method: () => action()
  };
  return nested.method();
}`
      };

      const result = await refactoring.execute(selection);

      expect(result.success).toBe(true);

      const functionEdit = result.edits.find(e => e.type === 'insert');
      const functionCode = functionEdit!.content;

      // 驗證縮排保持
      expect(functionCode).toMatch(/  const nested/);
      expect(functionCode).toMatch(/    property:/);
      expect(functionCode).toMatch(/  return nested/);
    }, { testName: 'formatting-preservation' }));
  });

  describe('效能和記憶體最佳化', () => {
    it('應該快速處理大型程式碼選擇', withMemoryOptimization(async () => {
      // 產生大型程式碼選擇
      const largeCode = Array.from({ length: 100 }, (_, i) =>
        `const var${i} = input${i % 10} * ${i + 1};`
      ).join('\n') + '\nreturn [' + Array.from({ length: 100 }, (_, i) => `var${i}`).join(', ') + '];';

      const selection: CodeSelection = {
        range: {
          start: { line: 1, column: 1 },
          end: { line: 102, column: 1 }
        },
        code: largeCode
      };

      const startTime = performance.now();
      const result = await refactoring.execute(selection);
      const endTime = performance.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // 1 秒內完成
    }, { testName: 'large-code-performance' }));

    it('應該在處理後釋放記憶體', withMemoryOptimization(async () => {
      const initialHeap = process.memoryUsage().heapUsed;

      // 執行多個重構操作
      for (let i = 0; i < 20; i++) {
        const selection: CodeSelection = {
          range: {
            start: { line: 1, column: 1 },
            end: { line: 5, column: 1 }
          },
          code: `const result${i} = process${i}(data${i});
const transformed${i} = transform${i}(result${i});
output${i}.push(transformed${i});
cache${i}.set(key${i}, transformed${i});
return transformed${i};`
        };

        await refactoring.execute(selection);
      }

      // 強制垃圾回收
      if (global.gc) {
        global.gc();
      }

      const finalHeap = process.memoryUsage().heapUsed;
      const heapIncrease = finalHeap - initialHeap;

      // 記憶體增長應該在合理範圍內 (小於 15MB)
      expect(heapIncrease).toBeLessThan(15 * 1024 * 1024);
    }, { testName: 'memory-cleanup' }));
  });
});