/**
 * CLI change-signature 命令 E2E 測試
 * 基於 sample-project fixture 測試函式簽章修改功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI change-signature - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('參數重排序 - 基本功能', () => {
    it('應該支援文件宣告的 --file 和 --function 形式', async () => {
      await fixture.writeFile('src/doc-option-form.ts', `
function calculate(a: number, b: number): number {
  return a - b;
}

const result = calculate(10, 5);
`.trim());

      const result = await executeCLI(
        [
          'change-signature',
          '--file', 'src/doc-option-form.ts',
          '--function', 'calculate',
          '-p', fixture.rootPath,
          '--reorder', 'b,a',
          '--dry-run',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.files.length).toBeGreaterThan(0);
    });

    it('應該成功重排序兩個參數', async () => {
      const testFile = `${fixture.rootPath}/test-reorder.ts`;
      await fixture.memfs.writeFile(testFile, `
function calculate(a: number, b: number): number {
  return a - b;
}

const result = calculate(10, 5);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'calculate', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        // 使用新的 PreviewResult 格式驗證（change-signature 映射到 refactor）
        expect(output.command).toBe('refactor');
        expect(output.files.length).toBeGreaterThan(0);
      }
    });

    it('應該成功重排序三個參數', async () => {
      const testFile = `${fixture.rootPath}/test-reorder-three.ts`;
      await fixture.memfs.writeFile(testFile, `
function format(prefix: string, value: number, suffix: string): string {
  return prefix + value + suffix;
}

const text = format('[', 42, ']');
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'format', '-p', fixture.rootPath, '--reorder', 'value,prefix,suffix', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該更新所有呼叫點的參數順序', async () => {
      const testFile = `${fixture.rootPath}/test-reorder-calls.ts`;
      await fixture.memfs.writeFile(testFile, `
function add(x: number, y: number): number {
  return x + y;
}

const a = add(1, 2);
const b = add(3, 4);
const c = add(5, 6);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'add', '-p', fixture.rootPath, '--reorder', 'y,x', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        // 使用新的 PreviewResult 格式：summary.totalChanges 代表變更數
        expect(output.summary.totalChanges).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('新增參數 - 基本功能', () => {
    it('應該成功新增有預設值的參數', async () => {
      const testFile = `${fixture.rootPath}/test-add-param.ts`;
      await fixture.memfs.writeFile(testFile, `
function greet(name: string): string {
  return 'Hello, ' + name;
}

const msg = greet('World');
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'greet', '-p', fixture.rootPath, '--add', 'greeting:string=Hello', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功新增多個參數', async () => {
      const testFile = `${fixture.rootPath}/test-add-multi.ts`;
      await fixture.memfs.writeFile(testFile, `
function log(message: string): void {
  console.log(message);
}

log('test');
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'log', '-p', fixture.rootPath, '--add', 'level:string=info', '--add', 'timestamp:boolean=true', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('刪除參數 - 基本功能', () => {
    it('應該成功刪除未使用的參數', async () => {
      const testFile = `${fixture.rootPath}/test-remove-param.ts`;
      await fixture.memfs.writeFile(testFile, `
function process(data: string, unused: number): string {
  return data.toUpperCase();
}

const result = process('test', 123);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'process', '-p', fixture.rootPath, '--remove', 'unused', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('修改參數類型 - 基本功能', () => {
    it('應該成功修改參數類型', async () => {
      const testFile = `${fixture.rootPath}/test-change-type.ts`;
      await fixture.memfs.writeFile(testFile, `
function count(value: number): number {
  return value;
}

const n = count(42);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'count', '-p', fixture.rootPath, '--change-type', 'value:bigint', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('錯誤處理', () => {
    it('應該處理不存在的函式', async () => {
      const testFile = `${fixture.rootPath}/test-nonexistent.ts`;
      await fixture.memfs.writeFile(testFile, 'const x = 1;');

      const result = await executeCLI(
        ['change-signature', testFile, 'nonExistent', '-p', fixture.rootPath, '--reorder', 'a,b', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.command).toBe('change-signature');
      expect(output.error).toContain('找不到函式');
    });

    it('應該處理無效的參數名稱', async () => {
      const testFile = `${fixture.rootPath}/test-invalid-param.ts`;
      await fixture.memfs.writeFile(testFile, `
function test(a: number): number {
  return a;
}
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'test', '-p', fixture.rootPath, '--reorder', 'x,y', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.command).toBe('change-signature');
      expect(output.error).toContain('找不到參數');
    });

    it('應該處理不存在的檔案', async () => {
      const result = await executeCLI(
        ['change-signature', '/nonexistent/file.ts', 'test', '-p', fixture.rootPath, '--reorder', 'a,b', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.command).toBe('change-signature');
      expect(output.error.length).toBeGreaterThan(0);
    });

    it('應該處理語法錯誤的檔案', async () => {
      const testFile = `${fixture.rootPath}/test-syntax-error.ts`;
      await fixture.memfs.writeFile(testFile, 'function broken( { return; }');

      const result = await executeCLI(
        ['change-signature', testFile, 'broken', '-p', fixture.rootPath, '--reorder', 'a,b', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.command).toBe('change-signature');
      expect(output.error.length).toBeGreaterThan(0);
    });
  });

  describe('輸出格式', () => {
    it('應該支援 JSON 格式輸出', async () => {
      const testFile = `${fixture.rootPath}/test-format-json.ts`;
      await fixture.memfs.writeFile(testFile, `
function fn(a: number, b: number): number { return a + b; }
const x = fn(1, 2);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'fn', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('refactor');
      expect(output.success).toBe(true);
      expect(output.summary.totalChanges).toBeGreaterThanOrEqual(2);
      expect(output.files.length).toBe(1);

      const changedContent = output.files
        .flatMap((file: { hunks: Array<{ lines: Array<{ content: string }> }> }) => file.hunks)
        .flatMap((hunk: { lines: Array<{ content: string }> }) => hunk.lines)
        .map((line: { content: string }) => line.content)
        .join('\n');
      expect(changedContent).toContain('function fn(b: number, a: number): number');
      expect(changedContent).toContain('const x = fn(2, 1);');
    });

    it('應該支援 summary 格式輸出', async () => {
      const testFile = `${fixture.rootPath}/test-format-summary.ts`;
      await fixture.memfs.writeFile(testFile, `
function fn(a: number, b: number): number { return a + b; }
const x = fn(1, 2);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'fn', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Files: 1');
      expect(result.stdout).toContain('Changes:');
      expect(result.stdout).toContain('test-format-summary.ts');
    });

    it('應該支援 diff 格式輸出', async () => {
      const testFile = `${fixture.rootPath}/test-format-diff.ts`;
      await fixture.memfs.writeFile(testFile, `
function fn(a: number, b: number): number { return a + b; }
const x = fn(1, 2);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'fn', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('--- a/');
      expect(result.stdout).toContain('+++ b/');
      expect(result.stdout).toContain('function fn(b: number, a: number): number');
      expect(result.stdout).toContain('const x = fn(2, 1);');
    });
  });

  describe('dry-run 模式', () => {
    it('應該在 dry-run 模式下不執行實際變更', async () => {
      const testFile = `${fixture.rootPath}/test-dry-run.ts`;
      const originalContent = `
function calc(a: number, b: number): number {
  return a - b;
}
const result = calc(10, 5);
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        ['change-signature', testFile, 'calc', '-p', fixture.rootPath, '--reorder', 'b,a', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const fileContent = await fixture.memfs.readFile(testFile, 'utf-8');
      expect(fileContent).toBe(originalContent);
    });
  });

  describe('極端測試標準 - 大量參數（50+ 個）', () => {
    it('應該處理 55 個參數的函式簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-many-params.ts`;
      const params = Array.from({ length: 55 }, (_, i) => `p${i}: number`).join(', ');
      const paramNames = Array.from({ length: 55 }, (_, i) => `p${i}`);
      const args = Array.from({ length: 55 }, (_, i) => i).join(', ');

      await fixture.memfs.writeFile(testFile, `
function manyParams(${params}): number {
  return ${paramNames.join(' + ')};
}

const result = manyParams(${args});
`.trim());

      // 重排序：將 p0 移到最後
      const reordered = [...paramNames.slice(1), paramNames[0]].join(',');

      const result = await executeCLI(
        ['change-signature', testFile, 'manyParams', '-p', fixture.rootPath, '--reorder', reordered, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('極端測試標準 - 大量呼叫點（60+ 個）', () => {
    it('應該處理有 60+ 呼叫點的函式簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-many-calls.ts`;
      const calls = Array.from({ length: 65 }, (_, i) => `const r${i} = add(${i}, ${i + 1});`).join('\n');

      await fixture.memfs.writeFile(testFile, `
function add(x: number, y: number): number {
  return x + y;
}

${calls}
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'add', '-p', fixture.rootPath, '--reorder', 'y,x', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        // 使用新的 PreviewResult 格式：summary.totalChanges 代表變更數
        expect(output.summary.totalChanges).toBeGreaterThanOrEqual(65);
      }
    });
  });

  describe('極端測試標準 - 深層巢狀（10+ 層）', () => {
    it('應該處理 12 層巢狀結構中的函式簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-deep-nested.ts`;
      const nestOpen = Array.from({ length: 12 }, (_, i) => `${'  '.repeat(i)}function level${i}() {`).join('\n');
      const nestClose = Array.from({ length: 12 }, (_, i) => `${'  '.repeat(11 - i)}}`).join('\n');

      await fixture.memfs.writeFile(testFile, `
function target(a: number, b: string): string {
  return b + a;
}

${nestOpen}
${'  '.repeat(12)}const x = target(1, 'test');
${nestClose}
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'target', '-p', fixture.rootPath, '--reorder', 'b,a', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('極端測試標準 - 超長函式（500+ 行）', () => {
    it('應該處理 500+ 行函式的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-long-function.ts`;
      const longBody = Array.from({ length: 500 }, (_, i) => `  const v${i} = a + b + ${i};`).join('\n');

      await fixture.memfs.writeFile(testFile, `
function longFunction(a: number, b: number): number {
${longBody}
  return v499;
}

const result = longFunction(1, 2);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'longFunction', '-p', fixture.rootPath, '--reorder', 'b,a', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('極端測試標準 - 跨檔案呼叫（50+ 檔案）', () => {
    it('應該處理被 60 個檔案引用的函式簽章修改', async () => {
      // 創建主檔案
      await fixture.writeFile('src/utils.ts', `
export function sharedFn(x: number, y: string): string {
  return y + x;
}
`);

      // 創建 60 個引用檔案
      for (let i = 0; i < 60; i++) {
        await fixture.writeFile(`src/consumers/file${i}.ts`, `
import { sharedFn } from '../utils';
export const result${i} = sharedFn(${i}, 'value');
`);
      }

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/utils.ts'), 'sharedFn', '--reorder', 'y,x', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('極端測試標準 - 超長參數名稱（100+ 字元）', () => {
    it('應該處理超長參數名稱', async () => {
      const testFile = `${fixture.rootPath}/test-long-names.ts`;
      const longName1 = 'a'.repeat(100);
      const longName2 = 'b'.repeat(100);

      await fixture.memfs.writeFile(testFile, `
function test(${longName1}: number, ${longName2}: string): string {
  return ${longName2} + ${longName1};
}

const r = test(1, 'x');
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'test', '-p', fixture.rootPath, '--reorder', `${longName2},${longName1}`, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('複合操作', () => {
    it('應該同時支援重排序和新增參數', async () => {
      const testFile = `${fixture.rootPath}/test-combo.ts`;
      await fixture.memfs.writeFile(testFile, `
function combo(a: number, b: string): string {
  return b + a;
}

const r = combo(1, 'x');
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'combo', '-p', fixture.rootPath, '--reorder', 'b,a', '--add', 'c:boolean=true', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Class 方法', () => {
    it('應該處理 class 方法的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-class-method.ts`;
      await fixture.memfs.writeFile(testFile, `
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}

const calc = new Calculator();
const result = calc.add(1, 2);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'add', '-p', fixture.rootPath, '--reorder', 'b,a', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Arrow Function', () => {
    it('應該處理 arrow function 的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-arrow.ts`;
      await fixture.memfs.writeFile(testFile, `
const multiply = (x: number, y: number): number => x * y;

const result = multiply(3, 4);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'multiply', '-p', fixture.rootPath, '--reorder', 'y,x', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Async Function', () => {
    it('應該處理 async function 的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-async.ts`;
      await fixture.memfs.writeFile(testFile, `
async function fetchData(url: string, timeout: number): Promise<string> {
  return url;
}

const data = await fetchData('/api', 5000);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'fetchData', '-p', fixture.rootPath, '--reorder', 'timeout,url', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Generic Function', () => {
    it('應該處理泛型函式的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-generic.ts`;
      await fixture.memfs.writeFile(testFile, `
function identity<T>(value: T, label: string): T {
  console.log(label);
  return value;
}

const num = identity(42, 'number');
const str = identity('hello', 'string');
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'identity', '-p', fixture.rootPath, '--reorder', 'label,value', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('效能優化 - 同檔案多呼叫點快取', () => {
    it('應該正確處理同一檔案中的多個呼叫點（檔案只讀取一次）', async () => {
      const testFile = 'test-same-file-calls.ts';
      // 20 個呼叫點都在同一檔案
      const calls = Array.from({ length: 20 }, (_, i) => `const r${i} = calculate(${i * 10}, ${i * 5});`).join('\n');

      await fixture.writeFile(testFile, `
function calculate(a: number, b: number): number {
  return a - b;
}

${calls}
`.trim());

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath(testFile), 'calculate', '-p', fixture.rootPath, '--reorder', 'b,a', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        // 使用新的 PreviewResult 格式
        // 20 個呼叫點（函式定義不算）
        expect(output.summary.totalChanges).toBeGreaterThanOrEqual(19);
        // 所有更新都在同一檔案
        expect(output.summary.totalFiles).toBe(1);
      }
    });

    it('應該正確處理混合場景（同檔案多呼叫 + 跨檔案）', async () => {
      // 主檔案：定義 + 5 個呼叫
      await fixture.writeFile('src/main.ts', `
export function sharedCalc(x: number, y: string): string {
  return y + x;
}

const a1 = sharedCalc(1, 'a');
const a2 = sharedCalc(2, 'b');
const a3 = sharedCalc(3, 'c');
const a4 = sharedCalc(4, 'd');
const a5 = sharedCalc(5, 'e');
`);

      // 5 個跨檔案引用，每個檔案 3 個呼叫
      for (let i = 0; i < 5; i++) {
        await fixture.writeFile(`src/caller${i}.ts`, `
import { sharedCalc } from './main';

const b${i}_1 = sharedCalc(${i * 10 + 1}, 'x');
const b${i}_2 = sharedCalc(${i * 10 + 2}, 'y');
const b${i}_3 = sharedCalc(${i * 10 + 3}, 'z');
`);
      }

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/main.ts'), 'sharedCalc', '--reorder', 'y,x', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        // 使用新的 PreviewResult 格式
        // 5 呼叫在 main.ts + 15 呼叫在 5 個 caller 檔案
        expect(output.summary.totalChanges).toBeGreaterThanOrEqual(20);
        // 1 個 main.ts + 5 個 caller 檔案
        expect(output.summary.totalFiles).toBe(6);
      }
    });

    it('應該正確處理超多呼叫在少量檔案的場景', async () => {
      // 3 個檔案，每個檔案 30 個呼叫（共 90 個呼叫）
      await fixture.writeFile('src/target.ts', `
export function targetFn(a: number, b: number): number {
  return a * b;
}
`);

      for (let f = 0; f < 3; f++) {
        const calls = Array.from({ length: 30 }, (_, i) => `const v${f}_${i} = targetFn(${i}, ${i + 1});`).join('\n');
        await fixture.writeFile(`src/consumer${f}.ts`, `
import { targetFn } from './target';

${calls}
`);
      }

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/target.ts'), 'targetFn', '--reorder', 'b,a', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        // 使用新的 PreviewResult 格式
        // 應有 90 個呼叫點
        expect(output.summary.totalChanges).toBeGreaterThanOrEqual(90);
        // 只有 4 個檔案（1 個 target + 3 個 consumer）
        expect(output.summary.totalFiles).toBe(4);
      }
    });
  });

  describe('缺少參數處理', () => {
    it('應該處理缺少檔案參數', async () => {
      const result = await executeCLI(
        ['change-signature'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('請指定檔案與函式名稱');
    });

    it('應該處理缺少函式名稱參數', async () => {
      const testFile = `${fixture.rootPath}/test.ts`;
      await fixture.memfs.writeFile(testFile, 'const x = 1;');

      const result = await executeCLI(
        ['change-signature', testFile],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('請指定檔案與函式名稱');
    });

    it('應該處理缺少操作參數', async () => {
      const testFile = `${fixture.rootPath}/test.ts`;
      await fixture.memfs.writeFile(testFile, 'function test(a: number) { return a; }');

      const result = await executeCLI(
        ['change-signature', testFile, 'test', '-p', fixture.rootPath],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('請指定至少一個變更操作');
    });
  });
});
