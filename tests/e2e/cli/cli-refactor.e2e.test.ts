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
});
