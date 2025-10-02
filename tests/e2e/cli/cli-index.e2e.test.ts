/**
 * CLI index 命令 E2E 測試
 * 測試實際的索引建立功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { indexProject } from '../helpers/cli-executor';

describe('CLI index 命令 E2E 測試', () => {
  let project: TestProject;

  beforeEach(async () => {
    // 建立測試專案
    project = await createTypeScriptProject({
      'src/index.ts': `
export function hello(name: string): string {
  return \`Hello, \${name}!\`;
}

export class Greeter {
  constructor(private name: string) {}

  greet(): string {
    return hello(this.name);
  }
}
      `.trim(),
      'src/utils.ts': `
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
      `.trim()
    });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it('應該能建立專案索引', async () => {
    const result = await indexProject(project.projectPath);

    // 檢查執行成功
    expect(result.exitCode).toBe(0);

    // 檢查輸出包含成功訊息
    expect(result.stdout).toContain('索引完成');
  });

  it('應該能索引 TypeScript 檔案', async () => {
    const result = await indexProject(project.projectPath);

    expect(result.exitCode).toBe(0);

    // 檢查輸出包含統計資訊
    expect(result.stdout).toContain('檔案');
    expect(result.stdout).toContain('符號');
  });

  it('應該能處理空專案', async () => {
    // 建立空專案
    const emptyProject = await createTypeScriptProject({});

    const result = await indexProject(emptyProject.projectPath);

    // 即使是空專案也應該能成功執行
    expect(result.exitCode).toBe(0);

    await emptyProject.cleanup();
  });

  it('應該能處理不存在的路徑', async () => {
    const result = await indexProject('/non/existent/path');

    // 應該在 stderr 中包含錯誤訊息
    const output = result.stdout + result.stderr;
    expect(output).toContain('索引失敗');
  });
});
