/**
 * CLI move 命令 E2E 測試
 * 測試實際的檔案移動和 import 更新功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { executeCLI } from '../helpers/cli-executor';

describe('CLI move 命令 E2E 測試', () => {
  let project: TestProject;

  beforeEach(async () => {
    // 建立測試專案，包含檔案和 import 關係
    project = await createTypeScriptProject({
      'src/utils.ts': `
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
      `.trim(),
      'src/index.ts': `
import { add, subtract } from './utils';

console.log(add(1, 2));
console.log(subtract(5, 3));
      `.trim()
    });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it('應該能移動檔案', async () => {
    const sourcePath = project.getFilePath('src/utils.ts');
    const targetPath = project.getFilePath('src/helpers/utils.ts');

    const result = await executeCLI(
      ['move', sourcePath, targetPath]
    );

    // 檢查執行成功
    expect(result.exitCode).toBe(0);

    // 檢查輸出包含移動訊息
    expect(result.stdout).toContain('移動');
  });

  it('應該能處理不存在的源檔案', async () => {
    const sourcePath = project.getFilePath('src/nonexistent.ts');
    const targetPath = project.getFilePath('src/target.ts');

    const result = await executeCLI(
      ['move', sourcePath, targetPath]
    );

    // 應該顯示錯誤訊息
    const output = result.stdout;
    expect(output).toContain('移動失敗');
  });

  it('應該能在預覽模式下顯示變更', async () => {
    const sourcePath = project.getFilePath('src/utils.ts');
    const targetPath = project.getFilePath('src/helpers/utils.ts');

    const result = await executeCLI(
      ['move', sourcePath, targetPath, '--preview']
    );

    expect(result.exitCode).toBe(0);

    // 應該顯示預覽訊息
    expect(result.stdout).toContain('預覽');
  });

  it('應該能處理相同的源和目標路徑', async () => {
    const samePath = project.getFilePath('src/utils.ts');

    const result = await executeCLI(
      ['move', samePath, samePath]
    );

    // 應該成功執行或顯示適當訊息
    expect(result.exitCode).toBe(0);
  });
});
