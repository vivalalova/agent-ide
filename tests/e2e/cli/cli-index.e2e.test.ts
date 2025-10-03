/**
 * CLI index 命令 E2E 測試
 * 測試實際的索引建立功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { indexProject, executeCLI } from '../helpers/cli-executor';

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

  it('應該支援增量更新索引', async () => {
    // 先建立初始索引
    const firstResult = await indexProject(project.projectPath);
    expect(firstResult.exitCode).toBe(0);

    // 使用 --update 進行增量更新
    const updateResult = await executeCLI(
      ['index', '--path', project.projectPath, '--update']
    );

    expect(updateResult.exitCode).toBe(0);
    expect(updateResult.stdout).toContain('索引完成');
  });

  it('應該支援自訂副檔名', async () => {
    const result = await executeCLI(
      ['index', '--path', project.projectPath, '--extensions', '.ts,.tsx']
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('索引完成');
  });

  it('應該支援排除模式', async () => {
    const result = await executeCLI(
      ['index', '--path', project.projectPath, '--exclude', 'node_modules/**,*.test.*,*.spec.*']
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('索引完成');
  });

  it('應該能索引包含 JavaScript 的混合專案', async () => {
    // 建立混合專案
    const mixedProject = await createTypeScriptProject({
      'src/module.ts': 'export const value = 123;',
      'src/script.js': 'module.exports = { name: "test" };'
    });

    const result = await executeCLI(
      ['index', '--path', mixedProject.projectPath, '--extensions', '.ts,.js']
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('索引完成');

    await mixedProject.cleanup();
  });

  it('應該能處理大量檔案的專案', async () => {
    // 建立包含多個檔案的專案
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) {
      files[`src/file${i}.ts`] = `export const value${i} = ${i};`;
    }
    const largeProject = await createTypeScriptProject(files);

    const result = await indexProject(largeProject.projectPath);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('索引完成');
    expect(result.stdout).toContain('10');

    await largeProject.cleanup();
  });

  it('應該能處理包含語法錯誤的檔案', async () => {
    const errorProject = await createTypeScriptProject({
      'src/valid.ts': 'export const valid = 1;',
      'src/invalid.ts': 'export const invalid = {{{;'
    });

    const result = await indexProject(errorProject.projectPath);

    // 即使有錯誤也應該能索引其他正確的檔案
    expect(result.exitCode).toBe(0);

    await errorProject.cleanup();
  });

  it('應該能處理深層目錄結構', async () => {
    const deepProject = await createTypeScriptProject({
      'src/level1/level2/level3/deep.ts': 'export const deep = true;'
    });

    const result = await indexProject(deepProject.projectPath);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('索引完成');

    await deepProject.cleanup();
  });

  it('應該能處理包含特殊字符的檔案名', async () => {
    const specialProject = await createTypeScriptProject({
      'src/file-with-dash.ts': 'export const dash = 1;',
      'src/file_with_underscore.ts': 'export const underscore = 2;'
    });

    const result = await indexProject(specialProject.projectPath);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('索引完成');

    await specialProject.cleanup();
  });

  it('應該能索引包含多種符號的檔案', async () => {
    const complexProject = await createTypeScriptProject({
      'src/types.ts': `
export interface User { name: string; age: number; }
export type ID = string | number;
export enum Status { Active, Inactive }
export const config = { api: 'http://example.com' };
export function process(data: User): void {}
export class Manager { private users: User[] = []; }
      `.trim()
    });

    const result = await indexProject(complexProject.projectPath);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('索引完成');

    await complexProject.cleanup();
  });

  it('應該能處理僅包含註解的檔案', async () => {
    const commentProject = await createTypeScriptProject({
      'src/comments.ts': `
/**
 * This is a comment only file
 */
// Another comment
      `.trim()
    });

    const result = await indexProject(commentProject.projectPath);

    expect(result.exitCode).toBe(0);

    await commentProject.cleanup();
  });

  it('應該能處理空檔案', async () => {
    const emptyFileProject = await createTypeScriptProject({
      'src/empty.ts': ''
    });

    const result = await indexProject(emptyFileProject.projectPath);

    expect(result.exitCode).toBe(0);

    await emptyFileProject.cleanup();
  });
});
