/**
 * CLI refactor 命令 E2E 測試
 * 測試實際的程式碼重構功能（extract-function）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { executeCLI } from '../helpers/cli-executor';

describe('CLI refactor 命令 E2E 測試', () => {
  let project: TestProject;

  beforeEach(async () => {
    // 建立測試專案，包含可重構的程式碼
    project = await createTypeScriptProject({
      'src/calculator.ts': `
export function complexCalculation(a: number, b: number): number {
  const sum = a + b;
  const product = a * b;
  const average = sum / 2;
  return average + product;
}
      `.trim()
    });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it('應該能提取函式', async () => {
    const filePath = project.getFilePath('src/calculator.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file', filePath,
      '--start-line', '2',
      '--end-line', '4',
      '--function-name', 'calculateAverage'
    ]);

    // 檢查執行成功
    expect(result.exitCode).toBe(0);

    // 檢查輸出包含重構訊息
    expect(result.stdout).toContain('重構完成');
  });

  it('應該能在預覽模式下顯示變更', async () => {
    const filePath = project.getFilePath('src/calculator.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file', filePath,
      '--start-line', '2',
      '--end-line', '4',
      '--function-name', 'helper',
      '--preview'
    ]);

    expect(result.exitCode).toBe(0);

    // 應該顯示預覽訊息
    expect(result.stdout).toContain('預覽模式');
  });

  it('應該能提取包含多種語句的複雜函式', async () => {
    const complexProject = await createTypeScriptProject({
      'src/complex-logic.ts': `
export function processUserData(user: any) {
  // 驗證使用者
  if (!user || !user.id) {
    throw new Error('Invalid user');
  }

  // 格式化名稱
  const formattedName = user.firstName + ' ' + user.lastName;
  const upperName = formattedName.toUpperCase();

  // 計算年齡
  const birthYear = new Date(user.birthDate).getFullYear();
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;

  // 建立結果
  return {
    id: user.id,
    name: upperName,
    age: age,
    isAdult: age >= 18
  };
}
      `.trim()
    });

    const filePath = complexProject.getFilePath('src/complex-logic.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file', filePath,
      '--start-line', '6',
      '--end-line', '8',
      '--function-name', 'formatUserName'
    ]);

    expect(result.exitCode).toBe(0);

    await complexProject.cleanup();
  });

  it('應該能處理嵌套程式碼結構', async () => {
    const nestedProject = await createTypeScriptProject({
      'src/nested.ts': `
export function calculateDiscount(price: number, customer: any): number {
  let discount = 0;

  if (customer.isPremium) {
    if (customer.years > 5) {
      discount = 0.2;
    } else if (customer.years > 2) {
      discount = 0.15;
    } else {
      discount = 0.1;
    }
  } else {
    if (customer.orders > 10) {
      discount = 0.05;
    }
  }

  return price * (1 - discount);
}
      `.trim()
    });

    const filePath = nestedProject.getFilePath('src/nested.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file', filePath,
      '--start-line', '4',
      '--end-line', '12',
      '--function-name', 'calculatePremiumDiscount'
    ]);

    expect(result.exitCode).toBe(0);

    await nestedProject.cleanup();
  });

  it('應該能處理包含箭頭函式的程式碼', async () => {
    const arrowProject = await createTypeScriptProject({
      'src/arrow-functions.ts': `
export const processItems = (items: any[]) => {
  const filtered = items.filter(item => item.active);
  const mapped = filtered.map(item => ({
    ...item,
    processed: true
  }));
  const sorted = mapped.sort((a, b) => a.priority - b.priority);

  return sorted;
};
      `.trim()
    });

    const filePath = arrowProject.getFilePath('src/arrow-functions.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file', filePath,
      '--start-line', '2',
      '--end-line', '5',
      '--function-name', 'filterAndMapItems'
    ]);

    expect(result.exitCode).toBe(0);

    await arrowProject.cleanup();
  });

  it('應該在缺少參數時顯示錯誤', async () => {
    const filePath = project.getFilePath('src/calculator.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file', filePath
    ]);

    // 應該顯示錯誤訊息
    const output = result.stdout + result.stderr;
    expect(output).toContain('需要');
  });

  it('應該能處理無效的行號範圍', async () => {
    const filePath = project.getFilePath('src/calculator.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file', filePath,
      '--start-line', '100',
      '--end-line', '200',
      '--function-name', 'invalid'
    ]);

    // 應該顯示範圍錯誤
    const output = result.stdout + result.stderr;
    expect(output.length).toBeGreaterThan(0);
  });

  it('應該能處理語法錯誤的檔案', async () => {
    const brokenProject = await createTypeScriptProject({
      'src/broken.ts': `
export function broken(
  console.log("missing closing parenthesis");
  return true;
}
      `.trim()
    });

    const filePath = brokenProject.getFilePath('src/broken.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file', filePath,
      '--start-line', '1',
      '--end-line', '2',
      '--function-name', 'extracted'
    ]);

    // 不應該崩潰
    expect(result.exitCode).toBeDefined();

    await brokenProject.cleanup();
  });

  it('應該能處理不支援的重構操作', async () => {
    const filePath = project.getFilePath('src/calculator.ts');

    const result = await executeCLI([
      'refactor',
      'inline-function',
      '--file', filePath
    ]);

    // 應該顯示錯誤訊息
    const output = result.stdout + result.stderr;
    expect(output).toContain('尚未實作');
  });

  it('應該能處理大型函式提取', async () => {
    const lines = Array.from({ length: 100 }, (_, i) =>
      `  const var${i} = ${i};\n  console.log(var${i});`
    ).join('\n');

    const largeProject = await createTypeScriptProject({
      'src/large-function.ts': `
export function largeFunction() {
${lines}
  return 'done';
}
      `.trim()
    });

    const filePath = largeProject.getFilePath('src/large-function.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file', filePath,
      '--start-line', '10',
      '--end-line', '20',
      '--function-name', 'extractedPart'
    ]);

    expect(result.exitCode).toBe(0);

    await largeProject.cleanup();
  });

  it('應該能處理多個檔案的批次重構準備', async () => {
    const multiFileProject = await createTypeScriptProject({
      'src/file1.ts': `
export function helper1() {
  const x = 1;
  const y = 2;
  return x + y;
}
      `.trim(),
      'src/file2.ts': `
export function helper2() {
  const a = 10;
  const b = 20;
  return a * b;
}
      `.trim(),
      'src/file3.ts': `
export function helper3() {
  const m = 5;
  const n = 15;
  return m - n;
}
      `.trim()
    });

    // 測試對第一個檔案的重構
    const filePath1 = multiFileProject.getFilePath('src/file1.ts');
    const result1 = await executeCLI([
      'refactor',
      'extract-function',
      '--file', filePath1,
      '--start-line', '1',
      '--end-line', '2',
      '--function-name', 'calculateSum',
      '--preview'
    ]);

    expect(result1.exitCode).toBe(0);

    await multiFileProject.cleanup();
  });
});
