/**
 * CLI rename 命令 E2E 測試
 * 測試實際的符號重新命名功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { executeCLI } from '../helpers/cli-executor';

describe('CLI rename 命令 E2E 測試', () => {
  let project: TestProject;

  beforeEach(async () => {
    // 建立測試專案，包含符號定義和引用
    project = await createTypeScriptProject({
      'src/user.ts': `
export class User {
  constructor(public name: string, public age: number) {}

  greet(): string {
    return \`Hello, I'm \${this.name}\`;
  }
}
      `.trim(),
      'src/index.ts': `
import { User } from './user';

const user = new User('Alice', 30);
console.log(user.greet());
      `.trim()
    });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it('應該能重新命名類別', async () => {
    const result = await executeCLI(
      ['rename', '--symbol', 'User', '--new-name', 'Person', '--path', project.projectPath]
    );

    // 檢查執行成功
    expect(result.exitCode).toBe(0);

    // 檢查輸出包含重新命名訊息
    expect(result.stdout).toContain('重新命名');
  });

  it('應該能處理找不到符號的情況', async () => {
    const result = await executeCLI(
      ['rename', '--symbol', 'NonExistent', '--new-name', 'NewName', '--path', project.projectPath]
    );

    // 應該顯示錯誤訊息
    const output = result.stdout;
    expect(output).toContain('找不到符號');
  });

  it('應該能預覽重新命名變更', async () => {
    const result = await executeCLI(
      ['rename', '--symbol', 'User', '--new-name', 'Person', '--path', project.projectPath, '--preview']
    );

    expect(result.exitCode).toBe(0);

    // 應該顯示預覽訊息
    expect(result.stdout).toContain('預覽');
  });

  it('應該在缺少參數時顯示錯誤', async () => {
    const result = await executeCLI(
      ['rename', '--path', project.projectPath]
    );

    // 應該顯示錯誤訊息
    const output = result.stdout + result.stderr;
    expect(output).toContain('必須指定符號名稱和新名稱');
  });
});
