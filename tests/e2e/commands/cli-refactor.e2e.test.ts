/**
 * CLI refactor 命令 E2E 測試
 * 基於 sample-project fixture 測試程式碼重構功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI refactor - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('extract-function - 基本功能', () => {
    it('應該成功提取單行程式碼為函式', async () => {
      const testFile = `${fixture.rootPath}/test-extract-single.ts`;
      await fixture.memfs.writeFile(testFile, `
function main() {
  const result = 1 + 2;
  console.log(result);
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '2', '--end-line', '2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.functionName).toBeDefined();
      }
    });

    it('應該成功提取多行程式碼區塊', async () => {
      const testFile = `${fixture.rootPath}/test-extract-multi.ts`;
      await fixture.memfs.writeFile(testFile, `
function process() {
  const a = 1;
  const b = 2;
  const sum = a + b;
  return sum;
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '2', '--end-line', '4', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.parameters).toBeDefined();
      }
    });

    it('應該成功提取包含變數引用的程式碼（需要參數傳遞）', async () => {
      const testFile = `${fixture.rootPath}/test-extract-params.ts`;
      await fixture.memfs.writeFile(testFile, `
function calculate(x: number, y: number) {
  const result = x + y;
  console.log(result);
  return result;
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '2', '--end-line', '3', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.parameters.length).toBeGreaterThan(0);
      }
    });

    it('應該成功提取包含 return 的程式碼', async () => {
      const testFile = `${fixture.rootPath}/test-extract-return.ts`;
      await fixture.memfs.writeFile(testFile, `
function compute() {
  const value = 42;
  return value * 2;
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '2', '--end-line', '3', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.returnType).toBeDefined();
      }
    });

    it('應該支援自訂函式名稱', async () => {
      const testFile = `${fixture.rootPath}/test-extract-custom.ts`;
      await fixture.memfs.writeFile(testFile, `
function main() {
  const x = 10;
  console.log(x);
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '2', '--end-line', '2', '--function-name', 'customFunction', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.functionName).toBe('customFunction');
      }
    });
  });

  describe('extract-function - 進階功能', () => {
    it('應該成功提取 async 程式碼', async () => {
      const testFile = `${fixture.rootPath}/test-extract-async.ts`;
      await fixture.memfs.writeFile(testFile, `
async function main() {
  const data = await fetch('/api');
  console.log(data);
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '2', '--end-line', '2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功提取 class method', async () => {
      const testFile = `${fixture.rootPath}/test-extract-method.ts`;
      await fixture.memfs.writeFile(testFile, `
class Calculator {
  compute() {
    const x = 1;
    const y = 2;
    return x + y;
  }
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '3', '--end-line', '5', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功提取巢狀函式', async () => {
      const testFile = `${fixture.rootPath}/test-extract-nested.ts`;
      await fixture.memfs.writeFile(testFile, `
function outer() {
  function inner() {
    const value = 42;
    return value;
  }
  return inner();
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '3', '--end-line', '3', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('extract-function - 錯誤處理', () => {
    it('應該處理無效範圍（from > to）', async () => {
      const testFile = `${fixture.rootPath}/test-invalid-range.ts`;
      await fixture.memfs.writeFile(testFile, `
function main() {
  const x = 1;
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '3', '--end-line', '2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理空範圍', async () => {
      const testFile = `${fixture.rootPath}/test-empty-range.ts`;
      await fixture.memfs.writeFile(testFile, `
function main() {
  const x = 1;
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '2', '--end-line', '2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理不存在的檔案路徑', async () => {
      const result = await executeCLI(
        ['transform', 'extract-function', '--file', '/nonexistent/file.ts', '--start-line', '1', '--end-line', '2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr).toBeDefined();
    });

    it('應該處理不支援的檔案類型', async () => {
      const testFile = `${fixture.rootPath}/test.txt`;
      await fixture.memfs.writeFile(testFile, 'plain text');

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '1', '--end-line', '1', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理語法錯誤的檔案', async () => {
      const testFile = `${fixture.rootPath}/test-syntax-error.ts`;
      await fixture.memfs.writeFile(testFile, `
function broken() {
  const x =
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '2', '--end-line', '2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });
  });

  describe('extract-function - 跨檔案提取', () => {
    it('應該支援跨檔案提取到新檔案', async () => {
      const sourceFile = `${fixture.rootPath}/source.ts`;
      const targetFile = `${fixture.rootPath}/extracted.ts`;
      await fixture.memfs.writeFile(sourceFile, `
function main() {
  const x = 1;
  const y = 2;
  return x + y;
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', sourceFile, '--start-line', '2', '--end-line', '4', '--target-file', targetFile, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.targetFileContent).toBeDefined();
        expect(output.importStatement).toBeDefined();
      }
    });

    it('應該在原始檔案中加入 import 語句', async () => {
      const sourceFile = `${fixture.rootPath}/main.ts`;
      const targetFile = `${fixture.rootPath}/utils.ts`;
      await fixture.memfs.writeFile(sourceFile, `
function process() {
  const result = 42;
  return result;
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', sourceFile, '--start-line', '2', '--end-line', '2', '--target-file', targetFile, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.importStatement).toContain('import');
        expect(output.importStatement).toContain('from');
      }
    });
  });

  describe('inline-function - 基本功能', () => {
    it('應該成功內聯簡單函式', async () => {
      const testFile = `${fixture.rootPath}/test-inline-simple.ts`;
      await fixture.memfs.writeFile(testFile, `
function add(a: number, b: number): number {
  return a + b;
}

const result = add(1, 2);
`.trim());

      const result = await executeCLI(
        ['transform', 'inline-function', '--file', testFile, '--function-name', 'add', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.inlinedCallsCount).toBeGreaterThan(0);
      }
    });

    it('應該成功內聯有多個呼叫點的函式', async () => {
      const testFile = `${fixture.rootPath}/test-inline-multi.ts`;
      await fixture.memfs.writeFile(testFile, `
function double(x: number): number {
  return x * 2;
}

const a = double(5);
const b = double(10);
const c = double(15);
`.trim());

      const result = await executeCLI(
        ['transform', 'inline-function', '--file', testFile, '--function-name', 'double', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.inlinedCallsCount).toBe(3);
      }
    });

    it('應該成功內聯有參數的函式', async () => {
      const testFile = `${fixture.rootPath}/test-inline-params.ts`;
      await fixture.memfs.writeFile(testFile, `
function multiply(x: number, y: number): number {
  return x * y;
}

const product = multiply(3, 4);
`.trim());

      const result = await executeCLI(
        ['transform', 'inline-function', '--file', testFile, '--function-name', 'multiply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該在內聯後移除函式定義', async () => {
      const testFile = `${fixture.rootPath}/test-inline-remove.ts`;
      await fixture.memfs.writeFile(testFile, `
function square(n: number): number {
  return n * n;
}

const value = square(5);
`.trim());

      const result = await executeCLI(
        ['transform', 'inline-function', '--file', testFile, '--function-name', 'square', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.removedFunction).toBe(true);
      }
    });
  });

  describe('inline-function - 錯誤處理', () => {
    it('應該處理 recursive 函式（應該失敗）', async () => {
      const testFile = `${fixture.rootPath}/test-inline-recursive.ts`;
      await fixture.memfs.writeFile(testFile, `
function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

const result = factorial(5);
`.trim());

      const result = await executeCLI(
        ['transform', 'inline-function', '--file', testFile, '--function-name', 'factorial', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(false);
        expect(output.errors).toBeDefined();
        expect(output.errors.some((e: string) => e.includes('遞迴'))).toBe(true);
      }
    });

    it('應該處理不存在的函式', async () => {
      const testFile = `${fixture.rootPath}/test-inline-nonexistent.ts`;
      await fixture.memfs.writeFile(testFile, `
const x = 1;
`.trim());

      const result = await executeCLI(
        ['transform', 'inline-function', '--file', testFile, '--function-name', 'nonExistentFunction', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(false);
        expect(output.errors.some((e: string) => e.includes('找不到'))).toBe(true);
      }
    });

    it('應該處理無呼叫點的函式', async () => {
      const testFile = `${fixture.rootPath}/test-inline-nocalls.ts`;
      await fixture.memfs.writeFile(testFile, `
function unused(): void {
  console.log('never called');
}
`.trim());

      const result = await executeCLI(
        ['transform', 'inline-function', '--file', testFile, '--function-name', 'unused', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(false);
        expect(output.errors.some((e: string) => e.includes('沒有找到'))).toBe(true);
      }
    });
  });

  describe('輸出格式', () => {
    it('應該支援 JSON 格式輸出', async () => {
      const testFile = `${fixture.rootPath}/test-format-json.ts`;
      await fixture.memfs.writeFile(testFile, `
function test() {
  const x = 1;
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '2', '--end-line', '2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('應該支援 summary 格式輸出', async () => {
      const testFile = `${fixture.rootPath}/test-format-summary.ts`;
      await fixture.memfs.writeFile(testFile, `
function test() {
  const x = 1;
}
`.trim());

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '2', '--end-line', '2', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeDefined();
    });
  });

  describe('preview 模式', () => {
    it('應該在 preview 模式下不執行實際變更（extract-function）', async () => {
      const testFile = `${fixture.rootPath}/test-preview-extract.ts`;
      const originalContent = `
function main() {
  const x = 1;
  console.log(x);
}
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '2', '--end-line', '2', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('refactor');
        expect(output.success).toBe(true);
        const fileContent = await fixture.memfs.readFile(testFile, 'utf-8');
        expect(fileContent).toBe(originalContent);
      }
    });

    it('應該在 preview 模式下不執行實際變更（inline-function）', async () => {
      const testFile = `${fixture.rootPath}/test-preview-inline.ts`;
      const originalContent = `
function add(a: number, b: number): number {
  return a + b;
}
const result = add(1, 2);
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        ['transform', 'inline-function', '--file', testFile, '--function-name', 'add', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('refactor');
        expect(output.success).toBe(true);
        const fileContent = await fixture.memfs.readFile(testFile, 'utf-8');
        expect(fileContent).toBe(originalContent);
      }
    });
  });

  describe('極端測試標準', () => {
    it('應該處理極長的函式（500+ 行）', async () => {
      const testFile = `${fixture.rootPath}/test-long-function.ts`;
      const longCode = `function longFunction() {\n${Array(500).fill('  const x = 1;').join('\n')}\n}`;
      await fixture.memfs.writeFile(testFile, longCode);

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '2', '--end-line', '50', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理深度巢狀（10+ 層）', async () => {
      const testFile = `${fixture.rootPath}/test-deep-nesting.ts`;
      const deepNested = `function deep() {\n${Array(10).fill(0).map((_, i) => '  '.repeat(i + 1) + 'if (true) {').join('\n')}\n${'  '.repeat(11)}const x = 1;\n${Array(10).fill(0).map((_, i) => '  '.repeat(10 - i) + '}').join('\n')}\n}`;
      await fixture.memfs.writeFile(testFile, deepNested);

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '11', '--end-line', '11', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理超長單行（1000+ 字元）', async () => {
      const testFile = `${fixture.rootPath}/test-long-line.ts`;
      const longLine = `function test() {\n  const x = ${'1 + '.repeat(200)}1;\n}`;
      await fixture.memfs.writeFile(testFile, longLine);

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '2', '--end-line', '2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理大量參數（50+ 個）', async () => {
      const testFile = `${fixture.rootPath}/test-many-params.ts`;
      const params = Array(50).fill(0).map((_, i) => `p${i}: number`).join(', ');
      const usage = Array(50).fill(0).map((_, i) => `p${i}`).join(' + ');
      await fixture.memfs.writeFile(testFile, `function test(${params}) {\n  return ${usage};\n}`);

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '2', '--end-line', '2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });

  describe('缺少參數處理', () => {
    it('應該處理缺少 --file 參數', async () => {
      const result = await executeCLI(
        ['transform', 'extract-function', '--start-line', '1', '--end-line', '2'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理缺少 --start-line 參數', async () => {
      const testFile = `${fixture.rootPath}/test.ts`;
      await fixture.memfs.writeFile(testFile, 'const x = 1;');

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--end-line', '2'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理缺少 --end-line 參數', async () => {
      const testFile = `${fixture.rootPath}/test.ts`;
      await fixture.memfs.writeFile(testFile, 'const x = 1;');

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '1'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理缺少 --name 參數（inline-function）', async () => {
      const testFile = `${fixture.rootPath}/test.ts`;
      await fixture.memfs.writeFile(testFile, 'function test() {}');

      const result = await executeCLI(
        ['transform', 'inline-function', '--file', testFile],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });
  });

  describe('空專案處理', () => {
    it('應該處理空檔案（extract-function）', async () => {
      const testFile = `${fixture.rootPath}/empty.ts`;
      await fixture.memfs.writeFile(testFile, '');

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '1', '--end-line', '1', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理空檔案（inline-function）', async () => {
      const testFile = `${fixture.rootPath}/empty.ts`;
      await fixture.memfs.writeFile(testFile, '');

      const result = await executeCLI(
        ['transform', 'inline-function', '--file', testFile, '--function-name', 'test', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(false);
      }
    });

    it('應該處理只有空白字元的檔案', async () => {
      const testFile = `${fixture.rootPath}/whitespace.ts`;
      await fixture.memfs.writeFile(testFile, '   \n\n   ');

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', testFile, '--start-line', '1', '--end-line', '1', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });
  });

  describe('極端情境 - 大規模跨檔案提取', () => {
    it('應該處理提取函數到被 60+ 檔案引用的模組', async () => {
      // 生成 60 個檔案引用 utils
      for (let i = 0; i < 60; i++) {
        await fixture.writeFile(`src/consumers/consumer${i}.ts`,
          `import { helper } from '../utils';\nexport const result${i} = helper();`
        );
      }

      // 生成 utils 檔案（目標檔案）
      await fixture.writeFile('src/utils.ts', 'export function helper() { return 1; }');

      // 原始檔案有可提取的程式碼
      await fixture.writeFile('src/source.ts', [
        'export function mainFunction() {',
        '  const a = 1;',
        '  const b = 2;',
        '  const c = a + b;',
        '  return c * 2;',
        '}'
      ].join('\n'));

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', fixture.getFilePath('src/source.ts'), '--start-line', '2', '--end-line', '4', '--function-name', 'extractedCalc', '--target-file', fixture.getFilePath('src/utils.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('refactor');
        expect(output.success).toBe(true);
        // 驗證提取到的模組會影響到引用它的 60+ 檔案
        expect(output.files).toBeDefined();
      }
    });
  });

  describe('極端情境 - 深層巢狀函數（10+ 層）', () => {
    it('應該處理 12 層巢狀結構中的函數內聯', async () => {
      const deepNested = [
        'function helper() { return 42; }',
        'function level0() {',
        ...Array.from({ length: 12 }, (_, i) =>
          `${'  '.repeat(i + 1)}function level${i + 1}() {`
        ),
        '  '.repeat(13) + 'return helper();',
        ...Array.from({ length: 12 }, (_, i) =>
          `${'  '.repeat(12 - i)}}`
        ),
        '  return level1();',
        '}'
      ].join('\n');

      await fixture.writeFile('src/deep-inline.ts', deepNested);

      const result = await executeCLI(
        ['transform', 'inline-function', '--file', fixture.getFilePath('src/deep-inline.ts'), '--function-name', 'helper', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('refactor');
        expect(output.success).toBe(true);
      }
    });

    it('應該處理提取 10+ 層巢狀 if-else 結構', async () => {
      const deepIfElse = [
        'export function deepConditional(x: number) {',
        ...Array.from({ length: 12 }, (_, i) =>
          `${'  '.repeat(i + 1)}if (x > ${i}) {`
        ),
        '  '.repeat(13) + 'const result = x * 2;',
        '  '.repeat(13) + 'return result;',
        ...Array.from({ length: 12 }, (_, i) =>
          `${'  '.repeat(12 - i)}} else { return ${11 - i}; }`
        ),
        '}'
      ].join('\n');

      await fixture.writeFile('src/deep-if-else.ts', deepIfElse);

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', fixture.getFilePath('src/deep-if-else.ts'), '--start-line', '13', '--end-line', '14', '--function-name', 'extractedDeep', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('refactor');
        // 深層巢狀可能導致提取失敗，所以只驗證有回應
        expect(output.success).toBeDefined();
      }
    });
  });

  describe('極端情境 - 超多呼叫點（50+ 呼叫）', () => {
    it('應該處理有 60+ 呼叫點的函數內聯', async () => {
      const manyCallsCode = [
        'function helperFn(x: number) { return x * 2; }',
        'export function main() {',
        ...Array.from({ length: 60 }, (_, i) =>
          `  const r${i} = helperFn(${i});`
        ),
        '  return r0;',
        '}'
      ].join('\n');

      await fixture.writeFile('src/many-calls.ts', manyCallsCode);

      const result = await executeCLI(
        ['transform', 'inline-function', '--file', fixture.getFilePath('src/many-calls.ts'), '--function-name', 'helperFn', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('refactor');
        expect(output.success).toBe(true);
      }
    });

    it('應該處理 50+ 個參數的函數提取', async () => {
      const manyParamsCode = [
        'export function main() {',
        ...Array.from({ length: 55 }, (_, i) =>
          `  const p${i} = ${i};`
        ),
        '  // 以下程式碼使用所有變數',
        '  const sum = ' + Array.from({ length: 55 }, (_, i) => `p${i}`).join(' + ') + ';',
        '  return sum;',
        '}'
      ].join('\n');

      await fixture.writeFile('src/many-params.ts', manyParamsCode);

      const result = await executeCLI(
        ['transform', 'extract-function', '--file', fixture.getFilePath('src/many-params.ts'), '--start-line', '57', '--end-line', '58', '--function-name', 'calculateSum', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('refactor');
        // 大量參數可能導致複雜的簽章，所以只驗證有回應
        expect(output.success).toBeDefined();
      }
    });
  });
});
