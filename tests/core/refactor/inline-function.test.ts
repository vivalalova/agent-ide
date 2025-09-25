import { describe, it, expect, beforeEach } from 'vitest';
import { withMemoryOptimization } from '../../test-utils/cleanup';

/**
 * 內聯函式重構操作測試
 * 測試將函式呼叫替換為函式體內容的功能
 */

// 內聯目標
interface InlineTarget {
  name: string;
  definition: {
    parameters: Parameter[];
    body: string;
    returnType: string;
    async: boolean;
    range: {
      start: { line: number; column: number };
      end: { line: number; column: number };
    };
  };
  references: Reference[];
}

interface Parameter {
  name: string;
  type: string;
  defaultValue?: string;
}

interface Reference {
  location: {
    file: string;
    range: {
      start: { line: number; column: number };
      end: { line: number; column: number };
    };
  };
  arguments: string[];
  scope: Scope;
  context: 'expression' | 'statement';
}

interface Scope {
  variables: Set<string>;
  functions: Set<string>;
  parent?: Scope;
}

// 重構編輯
interface RefactorEdit {
  type: 'replace' | 'delete';
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  content: string;
  file?: string;
}

// 重構結果
interface RefactorResult {
  success: boolean;
  edits: RefactorEdit[];
  errors?: string[];
  warnings?: string[];
}

// 內聯策略
class InlineStrategy {
  private complexityThreshold = 8; // 最大複雜度閾值
  private referenceThreshold = 10;  // 最大引用次數閾值

  canInline(target: InlineTarget): { canInline: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // 檢查副作用
    if (this.hasSideEffects(target)) {
      reasons.push('函式有副作用');
    }

    // 檢查引用次數
    if (target.references.length > this.referenceThreshold) {
      reasons.push(`引用次數過多 (${target.references.length} > ${this.referenceThreshold})`);
    }

    // 檢查複雜度
    if (this.isTooComplex(target)) {
      reasons.push('函式過於複雜');
    }

    // 檢查遞迴
    if (this.isRecursive(target)) {
      reasons.push('函式是遞迴的');
    }

    return {
      canInline: reasons.length === 0,
      reasons
    };
  }

  inline(target: InlineTarget): RefactorResult {
    const validation = this.canInline(target);
    if (!validation.canInline) {
      return {
        success: false,
        edits: [],
        errors: validation.reasons
      };
    }

    const edits: RefactorEdit[] = [];
    const warnings: string[] = [];

    try {
      // 1. 處理每個引用點
      for (const ref of target.references) {
        const replacement = this.createReplacement(target, ref);

        if (replacement.hasConflicts) {
          warnings.push(`變數名衝突在 ${ref.location.file}:${ref.location.range.start.line}`);
        }

        edits.push({
          type: 'replace',
          range: ref.location.range,
          content: replacement.content,
          file: ref.location.file
        });
      }

      // 2. 刪除原始函式定義
      edits.push({
        type: 'delete',
        range: target.definition.range,
        content: ''
      });

      return {
        success: true,
        edits,
        warnings
      };
    } catch (error) {
      return {
        success: false,
        edits: [],
        errors: [error instanceof Error ? error.message : '內聯失敗']
      };
    }
  }

  private createReplacement(target: InlineTarget, ref: Reference): {
    content: string;
    hasConflicts: boolean;
  } {
    let hasConflicts = false;
    let content = target.definition.body;

    // 1. 參數替換
    target.definition.parameters.forEach((param, index) => {
      const argValue = ref.arguments[index] || param.defaultValue || 'undefined';
      const regex = new RegExp(`\\b${param.name}\\b`, 'g');
      content = content.replace(regex, argValue);
    });

    // 2. 變數重命名（避免衝突）
    const renamedContent = this.renameConflictingVariables(content, ref.scope);
    if (renamedContent.hasConflicts) {
      hasConflicts = true;
      content = renamedContent.content;
    }

    // 3. 處理返回語句
    content = this.handleReturnStatements(content, ref.context);

    // 4. 處理異步函式
    if (target.definition.async) {
      content = this.handleAsyncContent(content, ref.context);
    }

    return { content, hasConflicts };
  }

  private renameConflictingVariables(content: string, scope: Scope): {
    content: string;
    hasConflicts: boolean;
  } {
    let hasConflicts = false;
    let result = content;

    // 找出函式內容中的變數宣告
    const varDeclarations = this.findVariableDeclarations(content);

    for (const varName of varDeclarations) {
      if (this.isVariableInScope(varName, scope)) {
        hasConflicts = true;
        const newName = this.generateUniqueVariableName(varName, scope);
        const regex = new RegExp(`\\b${varName}\\b`, 'g');
        result = result.replace(regex, newName);
      }
    }

    return { content: result, hasConflicts };
  }

  private handleReturnStatements(content: string, context: 'expression' | 'statement'): string {
    if (context === 'expression') {
      // 表達式上下文：移除 return 關鍵字和結尾分號
      return content.replace(/\breturn\s+/g, '').replace(/;$/, '');
    } else {
      // 語句上下文：保持 return
      return content;
    }
  }

  private handleAsyncContent(content: string, context: 'expression' | 'statement'): string {
    if (context === 'expression') {
      // 表達式上下文：包裝在立即執行的異步函式中
      return `(async () => { ${content} })()`;
    }
    return content;
  }

  private hasSideEffects(target: InlineTarget): boolean {
    const body = target.definition.body;

    // 檢查可能的副作用
    const sideEffectPatterns = [
      /console\./,           // 控制台輸出
      /document\./,          // DOM 操作
      /window\./,            // 全域物件操作
      /localStorage\./,      // 本地儲存
      /sessionStorage\./,    // 會話儲存
      /fetch\(/,             // 網路請求
      /XMLHttpRequest/,      // AJAX 請求
      /throw\s+/,            // 拋出異常
      /alert\(/,             // 彈出視窗
      /confirm\(/,           // 確認對話框
      /prompt\(/             // 輸入對話框
    ];

    // 檢查賦值操作，但排除變數聲明和迴圈初始化
    const assignmentPattern = /\w+\s*=\s*[^=]/g;
    const assignments = body.match(assignmentPattern) || [];

    const hasProblematicAssignment = assignments.some(assignment => {
      const beforeAssignment = body.substring(0, body.indexOf(assignment));
      // 排除 let/const/var 聲明和 for 迴圈初始化
      return !(
        /(?:let|const|var)\s+\w*\s*$/.test(beforeAssignment) || // 變數聲明
        /for\s*\(\s*(?:let|const|var)?\s*\w*\s*$/.test(beforeAssignment) // for 迴圈初始化
      );
    });

    return sideEffectPatterns.some(pattern => pattern.test(body)) || hasProblematicAssignment;
  }

  private isTooComplex(target: InlineTarget): boolean {
    const body = target.definition.body;

    // 簡化的複雜度計算
    let complexity = 1;

    // 條件語句
    complexity += (body.match(/\bif\b/g) || []).length;
    complexity += (body.match(/\belse\b/g) || []).length;

    // 循環
    complexity += (body.match(/\bfor\b/g) || []).length;
    complexity += (body.match(/\bwhile\b/g) || []).length;

    // 異常處理
    complexity += (body.match(/\btry\b/g) || []).length;
    complexity += (body.match(/\bcatch\b/g) || []).length;

    // 行數
    const lineCount = body.split('\n').length;
    complexity += Math.floor(lineCount / 5); // 每5行增加1點複雜度

    return complexity > this.complexityThreshold;
  }

  private isRecursive(target: InlineTarget): boolean {
    const body = target.definition.body;
    const functionName = target.name;

    // 簡單檢查函式體中是否包含自身調用
    const regex = new RegExp(`\\b${functionName}\\s*\\(`, 'g');
    return regex.test(body);
  }

  private findVariableDeclarations(content: string): string[] {
    const declarations: string[] = [];

    // 匹配 let、const、var 宣告
    const letMatches = content.match(/\blet\s+(\w+)/g) || [];
    const constMatches = content.match(/\bconst\s+(\w+)/g) || [];
    const varMatches = content.match(/\bvar\s+(\w+)/g) || [];

    [...letMatches, ...constMatches, ...varMatches].forEach(match => {
      const varName = match.split(/\s+/)[1];
      if (varName) {
        declarations.push(varName);
      }
    });

    return declarations;
  }

  private isVariableInScope(varName: string, scope: Scope): boolean {
    let currentScope: Scope | undefined = scope;

    while (currentScope) {
      if (currentScope.variables.has(varName)) {
        return true;
      }
      currentScope = currentScope.parent;
    }

    return false;
  }

  private generateUniqueVariableName(baseName: string, scope: Scope): string {
    let counter = 1;
    let newName = `${baseName}_inline`;

    while (this.isVariableInScope(newName, scope)) {
      newName = `${baseName}_inline${counter}`;
      counter++;
    }

    return newName;
  }

  setComplexityThreshold(threshold: number): void {
    this.complexityThreshold = Math.max(1, threshold);
  }

  setReferenceThreshold(threshold: number): void {
    this.referenceThreshold = Math.max(1, threshold);
  }
}

describe('內聯函式重構', () => {
  let strategy: InlineStrategy;

  beforeEach(() => {
    strategy = new InlineStrategy();
  });

  describe('內聯可行性檢查', () => {
    it('應該允許內聯簡單的純函式', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'add',
        definition: {
          parameters: [
            { name: 'a', type: 'number' },
            { name: 'b', type: 'number' }
          ],
          body: 'return a + b;',
          returnType: 'number',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
        },
        references: [
          {
            location: {
              file: 'test.ts',
              range: { start: { line: 10, column: 1 }, end: { line: 10, column: 10 } }
            },
            arguments: ['x', 'y'],
            scope: {
              variables: new Set(['x', 'y']),
              functions: new Set()
            },
            context: 'expression'
          }
        ]
      };

      const result = strategy.canInline(target);
      expect(result.canInline).toBe(true);
      expect(result.reasons).toHaveLength(0);
    }, { testName: 'simple-pure-function-inline' }));

    it('應該拒絕內聯有副作用的函式', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'logAndReturn',
        definition: {
          parameters: [{ name: 'value', type: 'any' }],
          body: 'console.log(value); return value;',
          returnType: 'any',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
        },
        references: []
      };

      const result = strategy.canInline(target);
      expect(result.canInline).toBe(false);
      expect(result.reasons).toContain('函式有副作用');
    }, { testName: 'reject-side-effect-function' }));

    it('應該拒絕內聯引用次數過多的函式', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'multiply',
        definition: {
          parameters: [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }],
          body: 'return a * b;',
          returnType: 'number',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
        },
        references: Array.from({ length: 15 }, (_, i) => ({
          location: {
            file: 'test.ts',
            range: { start: { line: i + 10, column: 1 }, end: { line: i + 10, column: 10 } }
          },
          arguments: ['x', 'y'],
          scope: { variables: new Set(), functions: new Set() },
          context: 'expression' as const
        }))
      };

      const result = strategy.canInline(target);
      expect(result.canInline).toBe(false);
      expect(result.reasons).toContain('引用次數過多 (15 > 10)');
    }, { testName: 'reject-too-many-references' }));

    it('應該拒絕內聯過於複雜的函式', withMemoryOptimization(() => {
      const complexBody = `
        if (condition1) {
          for (let i = 0; i < 10; i++) {
            if (condition2) {
              try {
                while (condition3) {
                  // 複雜的邏輯
                }
              } catch (error) {
                // 錯誤處理
              }
            }
          }
        }
        return result;
      `;

      const target: InlineTarget = {
        name: 'complexFunction',
        definition: {
          parameters: [],
          body: complexBody,
          returnType: 'any',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 20, column: 1 } }
        },
        references: []
      };

      const result = strategy.canInline(target);
      expect(result.canInline).toBe(false);
      expect(result.reasons).toContain('函式過於複雜');
    }, { testName: 'reject-complex-function' }));

    it('應該拒絕內聯遞迴函式', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'factorial',
        definition: {
          parameters: [{ name: 'n', type: 'number' }],
          body: 'return n <= 1 ? 1 : n * factorial(n - 1);',
          returnType: 'number',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
        },
        references: []
      };

      const result = strategy.canInline(target);
      expect(result.canInline).toBe(false);
      expect(result.reasons).toContain('函式是遞迴的');
    }, { testName: 'reject-recursive-function' }));
  });

  describe('參數替換', () => {
    it('應該正確替換函式參數', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'square',
        definition: {
          parameters: [{ name: 'x', type: 'number' }],
          body: 'return x * x;',
          returnType: 'number',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
        },
        references: [
          {
            location: {
              file: 'test.ts',
              range: { start: { line: 10, column: 1 }, end: { line: 10, column: 15 } }
            },
            arguments: ['value'],
            scope: { variables: new Set(['value']), functions: new Set() },
            context: 'expression'
          }
        ]
      };

      const result = strategy.inline(target);
      expect(result.success).toBe(true);

      const replaceEdit = result.edits.find(e => e.type === 'replace');
      expect(replaceEdit!.content).toBe('value * value');
    }, { testName: 'parameter-substitution' }));

    it('應該處理多個參數的替換', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'calculate',
        definition: {
          parameters: [
            { name: 'a', type: 'number' },
            { name: 'b', type: 'number' },
            { name: 'op', type: 'string' }
          ],
          body: 'return op === "+" ? a + b : a - b;',
          returnType: 'number',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
        },
        references: [
          {
            location: {
              file: 'test.ts',
              range: { start: { line: 10, column: 1 }, end: { line: 10, column: 25 } }
            },
            arguments: ['x', 'y', '"+"'],
            scope: { variables: new Set(['x', 'y']), functions: new Set() },
            context: 'expression'
          }
        ]
      };

      const result = strategy.inline(target);
      expect(result.success).toBe(true);

      const replaceEdit = result.edits.find(e => e.type === 'replace');
      expect(replaceEdit!.content).toBe('"+" === "+" ? x + y : x - y');
    }, { testName: 'multiple-parameter-substitution' }));

    it('應該處理預設參數值', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'greet',
        definition: {
          parameters: [
            { name: 'name', type: 'string' },
            { name: 'greeting', type: 'string', defaultValue: '"Hello"' }
          ],
          body: 'return greeting + ", " + name;',
          returnType: 'string',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
        },
        references: [
          {
            location: {
              file: 'test.ts',
              range: { start: { line: 10, column: 1 }, end: { line: 10, column: 15 } }
            },
            arguments: ['userName'], // 只提供一個參數
            scope: { variables: new Set(['userName']), functions: new Set() },
            context: 'expression'
          }
        ]
      };

      const result = strategy.inline(target);
      expect(result.success).toBe(true);

      const replaceEdit = result.edits.find(e => e.type === 'replace');
      expect(replaceEdit!.content).toBe('"Hello" + ", " + userName');
    }, { testName: 'default-parameter-handling' }));
  });

  describe('變數名衝突處理', () => {
    it('應該偵測並重命名衝突的變數', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'process',
        definition: {
          parameters: [{ name: 'input', type: 'any' }],
          body: 'const temp = input * 2; return temp + 1;',
          returnType: 'number',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
        },
        references: [
          {
            location: {
              file: 'test.ts',
              range: { start: { line: 10, column: 1 }, end: { line: 10, column: 15 } }
            },
            arguments: ['value'],
            scope: {
              variables: new Set(['temp']), // 已存在 temp 變數
              functions: new Set()
            },
            context: 'expression'
          }
        ]
      };

      const result = strategy.inline(target);
      expect(result.success).toBe(true);
      expect(result.warnings).toContain('變數名衝突在 test.ts:10');

      const replaceEdit = result.edits.find(e => e.type === 'replace');
      expect(replaceEdit!.content).toContain('temp_inline');
    }, { testName: 'variable-conflict-resolution' }));

    it('應該生成唯一的變數名', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'test',
        definition: {
          parameters: [],
          body: 'const value = 42; return value;',
          returnType: 'number',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
        },
        references: [
          {
            location: {
              file: 'test.ts',
              range: { start: { line: 10, column: 1 }, end: { line: 10, column: 10 } }
            },
            arguments: [],
            scope: {
              variables: new Set(['value', 'value_inline', 'value_inline1']),
              functions: new Set()
            },
            context: 'expression'
          }
        ]
      };

      const result = strategy.inline(target);
      expect(result.success).toBe(true);

      const replaceEdit = result.edits.find(e => e.type === 'replace');
      expect(replaceEdit!.content).toContain('value_inline2');
    }, { testName: 'unique-variable-name-generation' }));
  });

  describe('返回語句處理', () => {
    it('應該在表達式上下文中移除 return 關鍵字', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'getValue',
        definition: {
          parameters: [],
          body: 'return 42;',
          returnType: 'number',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } }
        },
        references: [
          {
            location: {
              file: 'test.ts',
              range: { start: { line: 10, column: 1 }, end: { line: 10, column: 12 } }
            },
            arguments: [],
            scope: { variables: new Set(), functions: new Set() },
            context: 'expression'
          }
        ]
      };

      const result = strategy.inline(target);
      expect(result.success).toBe(true);

      const replaceEdit = result.edits.find(e => e.type === 'replace');
      expect(replaceEdit!.content).toBe('42');
    }, { testName: 'return-removal-in-expression' }));

    it('應該在語句上下文中保留 return 關鍵字', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'doSomething',
        definition: {
          parameters: [],
          body: 'const result = calculate(); return result;',
          returnType: 'any',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
        },
        references: [
          {
            location: {
              file: 'test.ts',
              range: { start: { line: 10, column: 1 }, end: { line: 10, column: 15 } }
            },
            arguments: [],
            scope: { variables: new Set(), functions: new Set() },
            context: 'statement'
          }
        ]
      };

      const result = strategy.inline(target);
      expect(result.success).toBe(true);

      const replaceEdit = result.edits.find(e => e.type === 'replace');
      expect(replaceEdit!.content).toContain('return result');
    }, { testName: 'return-preservation-in-statement' }));
  });

  describe('異步函式處理', () => {
    it('應該正確處理異步函式的內聯', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'fetchData',
        definition: {
          parameters: [{ name: 'url', type: 'string' }],
          body: 'const response = await fetch(url); return response.json();',
          returnType: 'Promise<any>',
          async: true,
          range: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
        },
        references: [
          {
            location: {
              file: 'test.ts',
              range: { start: { line: 10, column: 1 }, end: { line: 10, column: 20 } }
            },
            arguments: ['apiUrl'],
            scope: { variables: new Set(['apiUrl']), functions: new Set() },
            context: 'expression'
          }
        ]
      };

      // 降低複雜度閾值以允許內聯
      strategy.setComplexityThreshold(50);

      const result = strategy.inline(target);
      expect(result.success).toBe(true);

      const replaceEdit = result.edits.find(e => e.type === 'replace');
      expect(replaceEdit!.content).toContain('(async () => {');
      expect(replaceEdit!.content).toContain('await fetch(apiUrl)');
    }, { testName: 'async-function-inline' }));
  });

  describe('閾值設定', () => {
    it('應該正確設定複雜度閾值', () => {
      strategy.setComplexityThreshold(15);
      expect((strategy as any).complexityThreshold).toBe(15);

      strategy.setComplexityThreshold(-5);
      expect((strategy as any).complexityThreshold).toBe(1); // 最小值限制
    });

    it('應該正確設定引用次數閾值', () => {
      strategy.setReferenceThreshold(5);
      expect((strategy as any).referenceThreshold).toBe(5);

      strategy.setReferenceThreshold(0);
      expect((strategy as any).referenceThreshold).toBe(1); // 最小值限制
    });
  });

  describe('完整內聯流程', () => {
    it('應該能完整執行內聯操作', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'double',
        definition: {
          parameters: [{ name: 'num', type: 'number' }],
          body: 'return num * 2;',
          returnType: 'number',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
        },
        references: [
          {
            location: {
              file: 'file1.ts',
              range: { start: { line: 10, column: 5 }, end: { line: 10, column: 17 } }
            },
            arguments: ['x'],
            scope: { variables: new Set(['x']), functions: new Set() },
            context: 'expression'
          },
          {
            location: {
              file: 'file2.ts',
              range: { start: { line: 20, column: 10 }, end: { line: 20, column: 22 } }
            },
            arguments: ['value'],
            scope: { variables: new Set(['value']), functions: new Set() },
            context: 'expression'
          }
        ]
      };

      const result = strategy.inline(target);
      expect(result.success).toBe(true);
      expect(result.edits).toHaveLength(3); // 2個替換 + 1個刪除

      // 檢查替換編輯
      const replaceEdits = result.edits.filter(e => e.type === 'replace');
      expect(replaceEdits).toHaveLength(2);
      expect(replaceEdits[0].content).toBe('x * 2');
      expect(replaceEdits[1].content).toBe('value * 2');

      // 檢查刪除編輯
      const deleteEdit = result.edits.find(e => e.type === 'delete');
      expect(deleteEdit).toBeDefined();
      expect(deleteEdit!.range).toEqual(target.definition.range);
    }, { testName: 'complete-inline-workflow' }));
  });

  describe('邊界條件', () => {
    it('應該處理沒有引用的函式', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'unused',
        definition: {
          parameters: [],
          body: 'return 42;',
          returnType: 'number',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } }
        },
        references: []
      };

      const result = strategy.inline(target);
      expect(result.success).toBe(true);
      expect(result.edits).toHaveLength(1); // 只有刪除編輯

      const deleteEdit = result.edits[0];
      expect(deleteEdit.type).toBe('delete');
    }, { testName: 'no-references-function' }));

    it('應該處理空函式體', withMemoryOptimization(() => {
      const target: InlineTarget = {
        name: 'empty',
        definition: {
          parameters: [],
          body: '',
          returnType: 'void',
          async: false,
          range: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } }
        },
        references: [
          {
            location: {
              file: 'test.ts',
              range: { start: { line: 10, column: 1 }, end: { line: 10, column: 8 } }
            },
            arguments: [],
            scope: { variables: new Set(), functions: new Set() },
            context: 'statement'
          }
        ]
      };

      const result = strategy.inline(target);
      expect(result.success).toBe(true);

      const replaceEdit = result.edits.find(e => e.type === 'replace');
      expect(replaceEdit!.content).toBe('');
    }, { testName: 'empty-function-body' }));
  });
});