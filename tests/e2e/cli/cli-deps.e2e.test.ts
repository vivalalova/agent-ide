/**
 * CLI deps 命令 E2E 測試
 * 測試實際的依賴分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { analyzeDependencies } from '../helpers/cli-executor';

describe('CLI deps 命令 E2E 測試', () => {
  let project: TestProject;

  beforeEach(async () => {
    // 建立測試專案
    project = await createTypeScriptProject({
      'src/a.ts': `
import { b } from './b';

export function a() {
  return b();
}
      `.trim(),
      'src/b.ts': `
import { c } from './c';

export function b() {
  return c();
}
      `.trim(),
      'src/c.ts': `
export function c() {
  return 'hello';
}
      `.trim(),
      'src/circular-a.ts': `
import { circularB } from './circular-b';

export function circularA() {
  return circularB();
}
      `.trim(),
      'src/circular-b.ts': `
import { circularA } from './circular-a';

export function circularB() {
  return circularA();
}
      `.trim()
    });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it('應該能分析專案依賴', async () => {
    const result = await analyzeDependencies(project.projectPath);

    // 檢查執行成功
    expect(result.exitCode).toBe(0);

    // 檢查輸出包含依賴分析結果
    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);
  });

  it('應該能處理簡單專案', async () => {
    const simpleProject = await createTypeScriptProject({
      'src/index.ts': `
export function hello() {
  return 'world';
}
      `.trim()
    });

    const result = await analyzeDependencies(simpleProject.projectPath);
    expect(result.exitCode).toBe(0);

    await simpleProject.cleanup();
  });

  it('應該能處理空專案', async () => {
    const emptyProject = await createTypeScriptProject({});

    const result = await analyzeDependencies(emptyProject.projectPath);
    expect(result.exitCode).toBe(0);

    await emptyProject.cleanup();
  });
});
