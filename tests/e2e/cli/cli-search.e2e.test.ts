/**
 * CLI search 命令 E2E 測試
 * 測試實際的程式碼搜尋功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { searchCode } from '../helpers/cli-executor';

describe('CLI search 命令 E2E 測試', () => {
  let project: TestProject;

  beforeEach(async () => {
    // 建立測試專案
    project = await createTypeScriptProject({
      'src/greeter.ts': `
export class Greeter {
  constructor(private name: string) {}

  greet(): string {
    return \`Hello, \${this.name}!\`;
  }

  farewell(): string {
    return \`Goodbye, \${this.name}!\`;
  }
}
      `.trim(),
      'src/calculator.ts': `
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  multiply(a: number, b: number): number {
    return a * b;
  }
}
      `.trim()
    });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it('應該能搜尋文字內容', async () => {
    const result = await searchCode(project.projectPath, 'Greeter');

    // 檢查執行成功
    expect(result.exitCode).toBe(0);

    // 檢查輸出包含搜尋結果
    expect(result.stdout).toContain('Greeter');
  });

  it('應該能搜尋函式名稱', async () => {
    const result = await searchCode(project.projectPath, 'add');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('add');
  });

  it('應該能處理找不到結果的情況', async () => {
    const result = await searchCode(project.projectPath, 'NonExistentFunction');

    // 應該成功執行但沒有結果
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('沒有找到');
  });

  it('應該能搜尋多個檔案', async () => {
    const result = await searchCode(project.projectPath, 'number');

    expect(result.exitCode).toBe(0);

    // 應該在多個檔案中找到結果
    const output = result.stdout;
    expect(output).toContain('number');
  });
});
