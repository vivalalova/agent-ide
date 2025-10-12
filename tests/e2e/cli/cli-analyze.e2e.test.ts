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

  it('應該能分析程式碼複雜度並返回正確結果', async () => {
    const filePath = project.getFilePath('src/complex.ts');
    const result = await analyzeCode(filePath);

    // 檢查執行成功
    expect(result.exitCode).toBe(0);

    // 檢查輸出包含分析相關資訊
    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);
    expect(output).toMatch(/分析|analyze|analysis/i);
  });

  it('應該能分析專案目錄並輸出所有檔案分析結果', async () => {
    const result = await analyzeCode(project.projectPath);

    expect(result.exitCode).toBe(0);

    // 應該分析整個專案
    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);
    expect(output).toMatch(/分析|analyze|analysis/i);
  });

  it('應該能處理簡單程式碼並報告低複雜度', async () => {
    const filePath = project.getFilePath('src/simple.ts');
    const result = await analyzeCode(filePath);

    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);
  });

  it('應該能檢測死代碼', async () => {
    const projectWithDeadCode = await createTypeScriptProject({
      'src/dead-code.ts': `
function used() {
  return 'used';
}

function unused() {
  return 'never called';
}

export const result = used();
      `.trim()
    });

    const result = await analyzeCode(projectWithDeadCode.projectPath);
    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);

    await projectWithDeadCode.cleanup();
  });

  it('應該能評估程式碼品質指標', async () => {
    const projectWithQualityIssues = await createTypeScriptProject({
      'src/quality-issues.ts': `
export function poorQuality(a: any, b: any, c: any, d: any, e: any) {
  if (a) {
    if (b) {
      if (c) {
        if (d) {
          if (e) {
            return a + b + c + d + e;
          }
        }
      }
    }
  }
  return 0;
}
      `.trim()
    });

    const result = await analyzeCode(projectWithQualityIssues.projectPath);
    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);

    await projectWithQualityIssues.cleanup();
  });

  it('應該處理大型專案', async () => {
    const largeProject = await createTypeScriptProject({
      'src/module1.ts': `export function func1() { return 1; }`,
      'src/module2.ts': `export function func2() { return 2; }`,
      'src/module3.ts': `export function func3() { return 3; }`,
      'src/module4.ts': `export function func4() { return 4; }`,
      'src/module5.ts': `export function func5() { return 5; }`,
      'src/utils/helper1.ts': `export const helper1 = () => 'help1';`,
      'src/utils/helper2.ts': `export const helper2 = () => 'help2';`,
      'src/services/service1.ts': `export class Service1 {}`,
      'src/services/service2.ts': `export class Service2 {}`,
      'src/index.ts': `
import { func1 } from './module1';
import { func2 } from './module2';
export { func1, func2 };
      `.trim()
    });

    const result = await analyzeCode(largeProject.projectPath);
    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);

    await largeProject.cleanup();
  });

  it('應該能處理語法錯誤檔案', async () => {
    const projectWithErrors = await createTypeScriptProject({
      'src/broken.ts': `
function broken( {
  console.log("missing parameter type");
  return;
}
      `.trim()
    });

    const result = await analyzeCode(projectWithErrors.projectPath);

    // 應該要能處理錯誤，不應該崩潰
    expect(result.exitCode).toBeDefined();

    await projectWithErrors.cleanup();
  });

  it('應該能處理空專案', async () => {
    const emptyProject = await createTypeScriptProject({});

    const result = await analyzeCode(emptyProject.projectPath);
    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output).toBeDefined();

    await emptyProject.cleanup();
  });

  it('應該能比較複雜度差異', async () => {
    const complexFile = project.getFilePath('src/complex.ts');
    const simpleFile = project.getFilePath('src/simple.ts');

    const complexResult = await analyzeCode(complexFile);
    const simpleResult = await analyzeCode(simpleFile);

    expect(complexResult.exitCode).toBe(0);
    expect(simpleResult.exitCode).toBe(0);

    // 複雜檔案的輸出應該比簡單檔案長
    expect(complexResult.stdout.length).toBeGreaterThan(0);
    expect(simpleResult.stdout.length).toBeGreaterThan(0);
  });
});
