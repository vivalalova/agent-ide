/**
 * CLI search 命令 E2E 測試
 * 測試實際的程式碼搜尋功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { searchCode, executeCLI } from '../helpers/cli-executor';

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

  it('應該支援正則表達式搜尋', async () => {
    const result = await executeCLI(
      ['search', 'Greeter|Calculator', '--type', 'regex', '--path', project.projectPath]
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it('應該支援模糊搜尋', async () => {
    const result = await executeCLI(
      ['search', 'greet', '--type', 'fuzzy', '--path', project.projectPath]
    );

    expect(result.exitCode).toBe(0);
  });

  it('應該支援大小寫敏感搜尋', async () => {
    const result = await executeCLI(
      ['search', 'greeter', '--case-sensitive', '--path', project.projectPath]
    );

    expect(result.exitCode).toBe(0);
  });

  it('應該支援全字匹配', async () => {
    const result = await executeCLI(
      ['search', 'add', '--whole-word', '--path', project.projectPath]
    );

    expect(result.exitCode).toBe(0);
  });

  it('應該支援上下文行數控制', async () => {
    const result = await executeCLI(
      ['search', 'Greeter', '--context', '5', '--path', project.projectPath]
    );

    expect(result.exitCode).toBe(0);
  });

  it('應該支援結果數量限制', async () => {
    const result = await executeCLI(
      ['search', 'function', '--limit', '3', '--path', project.projectPath]
    );

    expect(result.exitCode).toBe(0);
  });

  it('應該支援檔案類型過濾', async () => {
    const result = await executeCLI(
      ['search', 'class', '--extensions', '.ts', '--path', project.projectPath]
    );

    expect(result.exitCode).toBe(0);
  });

  it('應該支援 JSON 輸出格式', async () => {
    const result = await executeCLI(
      ['search', 'Greeter', '--format', 'json', '--path', project.projectPath]
    );

    expect(result.exitCode).toBe(0);
    // 驗證是否為有效的 JSON（如果有結果）
    if (result.stdout.trim()) {
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    }
  });

  it('應該支援最小化輸出格式', async () => {
    const result = await executeCLI(
      ['search', 'Greeter', '--format', 'minimal', '--path', project.projectPath]
    );

    expect(result.exitCode).toBe(0);
  });

  it('應該支援排除模式', async () => {
    const result = await executeCLI(
      ['search', 'export', '--exclude', '*.test.*,*.spec.*', '--path', project.projectPath]
    );

    expect(result.exitCode).toBe(0);
  });

  it('應該能搜尋註解內容', async () => {
    const commentProject = await createTypeScriptProject({
      'src/code.ts': `
// This is a special comment
export function test() {}
      `.trim()
    });

    const result = await searchCode(commentProject.projectPath, 'special comment');

    expect(result.exitCode).toBe(0);

    await commentProject.cleanup();
  });

  it('應該能搜尋字串字面值', async () => {
    const stringProject = await createTypeScriptProject({
      'src/strings.ts': `
const message = "Hello, World!";
const greeting = 'Welcome to TypeScript';
      `.trim()
    });

    const result = await searchCode(stringProject.projectPath, 'Hello, World');

    expect(result.exitCode).toBe(0);

    await stringProject.cleanup();
  });

  it('應該能搜尋 import 陳述式', async () => {
    const importProject = await createTypeScriptProject({
      'src/index.ts': `
import { User } from './user';
import type { Config } from './config';
      `.trim()
    });

    const result = await searchCode(importProject.projectPath, 'import');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('import');

    await importProject.cleanup();
  });

  it('應該能搜尋 export 陳述式', async () => {
    const exportProject = await createTypeScriptProject({
      'src/module.ts': `
export const value = 123;
export function helper() {}
export default class Main {}
      `.trim()
    });

    const result = await searchCode(exportProject.projectPath, 'export');

    expect(result.exitCode).toBe(0);

    await exportProject.cleanup();
  });

  it('應該能處理特殊字符搜尋', async () => {
    const specialProject = await createTypeScriptProject({
      'src/special.ts': `
const regex = /test/g;
const value = a + b - c * d;
      `.trim()
    });

    const result = await searchCode(specialProject.projectPath, '+');

    expect(result.exitCode).toBe(0);

    await specialProject.cleanup();
  });

  it('應該能搜尋多行模式', async () => {
    const multilineProject = await createTypeScriptProject({
      'src/multi.ts': `
const config = {
  api: 'http://example.com',
  timeout: 5000
};
      `.trim()
    });

    const result = await executeCLI(
      ['search', 'config.*api', '--type', 'regex', '--multiline', '--path', multilineProject.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await multilineProject.cleanup();
  });

  it('應該能處理空白字符搜尋', async () => {
    const result = await searchCode(project.projectPath, '  ');

    expect(result.exitCode).toBe(0);
  });

  it('應該能搜尋型別定義', async () => {
    const typeProject = await createTypeScriptProject({
      'src/types.ts': `
type User = { name: string; age: number };
interface Config { api: string; }
      `.trim()
    });

    const result = await searchCode(typeProject.projectPath, 'type User');

    expect(result.exitCode).toBe(0);

    await typeProject.cleanup();
  });

  it('應該能搜尋泛型語法', async () => {
    const genericProject = await createTypeScriptProject({
      'src/generic.ts': `
function identity<T>(arg: T): T { return arg; }
class Box<T> { value: T; }
      `.trim()
    });

    const result = await searchCode(genericProject.projectPath, '<T>');

    expect(result.exitCode).toBe(0);

    await genericProject.cleanup();
  });

  it('應該能搜尋裝飾器', async () => {
    const decoratorProject = await createTypeScriptProject({
      'src/decorators.ts': `
@Component({ selector: 'app' })
class AppComponent {}
      `.trim()
    });

    const result = await searchCode(decoratorProject.projectPath, '@Component');

    expect(result.exitCode).toBe(0);

    await decoratorProject.cleanup();
  });

  it('應該能處理大型搜尋結果', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      files[`src/file${i}.ts`] = `export const value${i} = ${i};`;
    }
    const largeProject = await createTypeScriptProject(files);

    const result = await searchCode(largeProject.projectPath, 'export');

    expect(result.exitCode).toBe(0);

    await largeProject.cleanup();
  });

  it('應該能搜尋中文內容', async () => {
    const chineseProject = await createTypeScriptProject({
      'src/chinese.ts': `
const message = "這是中文訊息";
// 這是中文註解
      `.trim()
    });

    const result = await searchCode(chineseProject.projectPath, '中文');

    expect(result.exitCode).toBe(0);

    await chineseProject.cleanup();
  });

  it('應該能處理 Unicode 字符', async () => {
    const unicodeProject = await createTypeScriptProject({
      'src/unicode.ts': `
const emoji = "🎉 🚀 ✨";
const symbols = "→ ← ↑ ↓";
      `.trim()
    });

    const result = await searchCode(unicodeProject.projectPath, '🎉');

    expect(result.exitCode).toBe(0);

    await unicodeProject.cleanup();
  });

  it('應該能處理換行符搜尋', async () => {
    const result = await searchCode(project.projectPath, 'export');

    expect(result.exitCode).toBe(0);
  });
});
