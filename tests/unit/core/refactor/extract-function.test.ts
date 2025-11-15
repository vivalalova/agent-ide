import { describe, it, expect, beforeEach } from 'vitest';
import { FunctionExtractor } from '@core/refactor/extract-function';

describe('FunctionExtractor', () => {
  let extractor: FunctionExtractor;

  beforeEach(() => {
    extractor = new FunctionExtractor();
  });

  describe('extract', () => {
    it('應該提取簡單的程式碼片段', async () => {
      const code = `const x = 1;
const y = 2;
const result = x + y;
console.log(result);`;

      const selection = {
        start: { line: 3, column: 0 },
        end: { line: 3, column: 21 }
      };

      const config = {
        functionName: 'calculateSum',
        generateComments: true,
        preserveFormatting: true,
        validateExtraction: true
      };

      const result = await extractor.extract(code, selection, config);

      expect(result.success).toBe(true);
      expect(result.functionName).toBe('calculateSum');
      expect(result.edits.length).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('應該產生函式呼叫的編輯', async () => {
      const code = 'const result = x + y;';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 21 }
      };

      const config = {
        functionName: 'add',
        generateComments: false,
        preserveFormatting: true,
        validateExtraction: true
      };

      const result = await extractor.extract(code, selection, config);

      expect(result.success).toBe(true);
      expect(result.edits.some(edit => edit.type === 'replace')).toBe(true);
      expect(result.edits.some(edit => edit.type === 'insert')).toBe(true);
    });

    it('應該推導參數列表', async () => {
      const code = 'const result = x + y;';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 21 }
      };

      const config = {
        functionName: 'add',
        generateComments: false,
        preserveFormatting: true,
        validateExtraction: true
      };

      const result = await extractor.extract(code, selection, config);

      expect(result.success).toBe(true);
      expect(result.parameters.length).toBeGreaterThan(0);
      const paramNames = result.parameters.map(p => p.name);
      expect(paramNames).toContain('x');
      expect(paramNames).toContain('y');
    });

    it('應該推導返回型別', async () => {
      const code = 'return x + y;';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 13 }
      };

      const config = {
        functionName: 'add',
        generateComments: false,
        preserveFormatting: true,
        validateExtraction: true
      };

      const result = await extractor.extract(code, selection, config);

      expect(result.success).toBe(true);
      expect(result.returnType).toBeDefined();
    });

    it('應該支援舊格式呼叫（向後相容）', async () => {
      const code = 'const result = x + y;';
      const startLine = 1;
      const endLine = 1;
      const functionName = 'add';

      const result = await extractor.extractFunction(code, startLine, endLine, functionName);

      expect(result.success).toBe(true);
      expect(result.functionName).toBe('add');
    });

    it('應該支援新格式呼叫', async () => {
      const code = 'const result = x + y;';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 21 }
      };
      const config = {
        functionName: 'add',
        generateComments: true,
        preserveFormatting: true,
        validateExtraction: true
      };

      const result = await extractor.extractFunction(code, selection, config);

      expect(result.success).toBe(true);
      expect(result.functionName).toBe('add');
    });

    it('應該產生帶註解的函式（當配置要求時）', async () => {
      const code = 'return x + y;';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 13 }
      };

      const config = {
        functionName: 'add',
        generateComments: true,
        preserveFormatting: true,
        validateExtraction: true
      };

      const result = await extractor.extract(code, selection, config);

      expect(result.success).toBe(true);
      const insertEdit = result.edits.find(e => e.type === 'insert');
      expect(insertEdit?.newText).toContain('/**');
    });

    it('應該在無函式名稱時自動產生', async () => {
      const code = 'const result = calculateTotal(items);';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 38 }
      };

      const config = {
        generateComments: false,
        preserveFormatting: true,
        validateExtraction: true
      };

      const result = await extractor.extract(code, selection, config);

      expect(result.success).toBe(true);
      expect(result.functionName).toBeTruthy();
      expect(result.functionName).toMatch(/^extracted/);
    });
  });

  describe('preview', () => {
    it('應該產生提取預覽', async () => {
      const code = 'const result = x + y;';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 21 }
      };

      const config = {
        functionName: 'add',
        generateComments: false,
        preserveFormatting: true,
        validateExtraction: true
      };

      const preview = await extractor.preview(code, selection, config);

      expect(preview.originalCode).toBe(code);
      expect(preview.modifiedCode).toBeDefined();
      expect(preview.functionCode).toBeDefined();
      expect(preview.modifiedCode).not.toBe(code);
    });

    it('應該在提取失敗時拋出錯誤', async () => {
      const code = 'break;'; // 無效的提取目標
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 6 }
      };

      await expect(
        extractor.preview(code, selection)
      ).rejects.toThrow();
    });
  });

  describe('extractMultiple', () => {
    it('應該批次提取多個片段', async () => {
      const extractions = [
        {
          code: 'const a = 1;',
          selection: {
            start: { line: 1, column: 0 },
            end: { line: 1, column: 12 }
          },
          config: {
            functionName: 'initA',
            generateComments: false,
            preserveFormatting: true,
            validateExtraction: true
          }
        },
        {
          code: 'const b = 2;',
          selection: {
            start: { line: 1, column: 0 },
            end: { line: 1, column: 12 }
          },
          config: {
            functionName: 'initB',
            generateComments: false,
            preserveFormatting: true,
            validateExtraction: true
          }
        }
      ];

      const results = await extractor.extractMultiple(extractions);

      expect(results).toHaveLength(2);
      expect(results[0].functionName).toBe('initA');
      expect(results[1].functionName).toBe('initB');
    });
  });

  describe('錯誤處理', () => {
    it('應該拋出錯誤當程式碼不是字串', async () => {
      const code = null as any;
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 10 }
      };

      await expect(
        extractor.extract(code, selection)
      ).rejects.toThrow('程式碼必須是字串');
    });

    it('應該拋出錯誤當選取範圍無效', async () => {
      const code = 'const x = 1;';
      const selection = null as any;

      await expect(
        extractor.extract(code, selection)
      ).rejects.toThrow('選取範圍無效');
    });

    it('應該拋出錯誤當範圍順序錯誤', async () => {
      const code = 'const x = 1;\nconst y = 2;';
      const selection = {
        start: { line: 2, column: 0 },
        end: { line: 1, column: 0 }
      };

      await expect(
        extractor.extract(code, selection)
      ).rejects.toThrow('選取範圍無效');
    });

    it('應該返回錯誤當包含 break 語句', async () => {
      const code = 'break;';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 6 }
      };

      const result = await extractor.extract(code, selection);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('應該返回錯誤當包含 continue 語句', async () => {
      const code = 'continue;';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 9 }
      };

      const result = await extractor.extract(code, selection);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('邊界情況', () => {
    it('應該處理單行選取', async () => {
      const code = 'return 1;';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 9 }
      };

      const result = await extractor.extract(code, selection);

      expect(result.success).toBe(true);
    });

    it('應該處理多行選取', async () => {
      const code = `const a = 1;
const b = 2;
return a + b;`;
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 3, column: 13 }
      };

      const result = await extractor.extract(code, selection);

      expect(result.success).toBe(true);
    });

    it('應該處理帶縮排的程式碼', async () => {
      const code = '  const x = 1;\n  return x;';
      const selection = {
        start: { line: 1, column: 2 },
        end: { line: 2, column: 11 }
      };

      const result = await extractor.extract(code, selection);

      expect(result.success).toBe(true);
    });

    it('應該處理空行', async () => {
      const code = 'const x = 1;\n\nreturn x;';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 3, column: 9 }
      };

      const result = await extractor.extract(code, selection);

      expect(result.success).toBe(true);
    });
  });

  describe('跨檔案提取', () => {
    it('應該支援跨檔案提取（當提供目標檔案路徑）', async () => {
      const code = 'const result = x + y;';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 21 }
      };

      const config = {
        functionName: 'add',
        generateComments: false,
        preserveFormatting: true,
        validateExtraction: true,
        targetFile: '/tmp/test-target.ts',
        sourceFile: '/tmp/test-source.ts'
      };

      const result = await extractor.extract(code, selection, config);

      expect(result.success).toBe(true);
      expect(result.targetFileContent).toBeDefined();
      expect(result.importStatement).toBeDefined();
      expect(result.importStatement).toContain('import');
      expect(result.importStatement).toContain('add');
    });

    it('應該產生正確的相對 import 路徑', async () => {
      const code = 'return x + y;';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 13 }
      };

      const config = {
        functionName: 'add',
        generateComments: false,
        preserveFormatting: true,
        validateExtraction: true,
        targetFile: '/home/user/project/utils/math.ts',
        sourceFile: '/home/user/project/src/index.ts'
      };

      const result = await extractor.extract(code, selection, config);

      expect(result.success).toBe(true);
      expect(result.importStatement).toContain('../utils/math');
    });

    it('應該在目標檔案中產生 export function', async () => {
      const code = 'return x + y;';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 13 }
      };

      const config = {
        functionName: 'add',
        generateComments: false,
        preserveFormatting: true,
        validateExtraction: true,
        targetFile: '/tmp/test-target.ts',
        sourceFile: '/tmp/test-source.ts'
      };

      const result = await extractor.extract(code, selection, config);

      expect(result.success).toBe(true);
      expect(result.targetFileContent).toContain('export function');
      expect(result.targetFileContent).toContain('add');
    });
  });

  describe('插入點配置', () => {
    it('應該支援不同的插入點', async () => {
      const code = 'const result = x + y;';
      const selection = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 21 }
      };

      const configs = [
        { insertionPoint: 'before' as const },
        { insertionPoint: 'after' as const },
        { insertionPoint: 'top' as const }
      ];

      for (const insertionPoint of configs) {
        const config = {
          functionName: 'add',
          generateComments: false,
          preserveFormatting: true,
          validateExtraction: true,
          ...insertionPoint
        };

        const result = await extractor.extract(code, selection, config);
        expect(result.success).toBe(true);
      }
    });
  });
});
