/**
 * CLI analyze 命令 E2E 測試
 * 測試實際的程式碼分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { analyzeCode } from '../helpers/cli-executor';

describe('CLI analyze 命令 E2E 測試', () => {
  let project: TestProject;

  beforeEach(async () => {
    // 建立測試專案
    project = await createTypeScriptProject({
      'src/complex.ts': `
export function complexFunction(x: number, y: number, z: number): number {
  if (x > 0) {
    if (y > 0) {
      if (z > 0) {
        return x + y + z;
      } else {
        return x + y - z;
      }
    } else {
      if (z > 0) {
        return x - y + z;
      } else {
        return x - y - z;
      }
    }
  } else {
    if (y > 0) {
      if (z > 0) {
        return -x + y + z;
      } else {
        return -x + y - z;
      }
    } else {
      if (z > 0) {
        return -x - y + z;
      } else {
        return -x - y - z;
      }
    }
  }
}

export function simpleFunction(a: number, b: number): number {
  return a + b;
}
      `.trim(),
      'src/simple.ts': `
export class SimpleClass {
  add(a: number, b: number): number {
    return a + b;
  }
}
      `.trim()
    });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it('應該能分析程式碼複雜度', async () => {
    const filePath = project.getFilePath('src/complex.ts');
    const result = await analyzeCode(filePath);

    // 檢查執行成功
    expect(result.exitCode).toBe(0);

    // 檢查輸出包含分析結果
    const output = result.stdout;
    expect(output).toContain('分析');
  });

  it('應該能分析專案目錄', async () => {
    const result = await analyzeCode(project.projectPath);

    expect(result.exitCode).toBe(0);

    // 應該分析整個專案
    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);
  });

  it('應該能處理簡單程式碼', async () => {
    const filePath = project.getFilePath('src/simple.ts');
    const result = await analyzeCode(filePath);

    expect(result.exitCode).toBe(0);
  });
});
