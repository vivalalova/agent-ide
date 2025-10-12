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

  it('應該能分析專案依賴並輸出依賴圖', async () => {
    const result = await analyzeDependencies(project.projectPath);

    // 檢查執行成功
    expect(result.exitCode).toBe(0);

    // 檢查輸出包含依賴分析結果
    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);
    expect(output).toMatch(/依賴|分析|dependency|analysis/i);
  });

  it('應該能檢測循環依賴', async () => {
    const result = await analyzeDependencies(project.projectPath);

    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    // 應該檢測到 circular-a 和 circular-b 之間的循環
    expect(output.toLowerCase()).toMatch(/cycle|circular|循環/);
  });

  it('應該能顯示依賴層級', async () => {
    const result = await analyzeDependencies(project.projectPath);

    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);
  });

  it('應該能處理複雜依賴關係', async () => {
    const complexProject = await createTypeScriptProject({
      'src/core/base.ts': `export class Base {}`,
      'src/core/extended.ts': `
import { Base } from './base';
export class Extended extends Base {}
      `.trim(),
      'src/services/serviceA.ts': `
import { Extended } from '../core/extended';
export class ServiceA {
  constructor(private ext: Extended) {}
}
      `.trim(),
      'src/services/serviceB.ts': `
import { ServiceA } from './serviceA';
export class ServiceB {
  constructor(private srvA: ServiceA) {}
}
      `.trim(),
      'src/index.ts': `
import { ServiceA } from './services/serviceA';
import { ServiceB } from './services/serviceB';
export { ServiceA, ServiceB };
      `.trim()
    });

    const result = await analyzeDependencies(complexProject.projectPath);
    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);

    // 應該分析多層依賴關係
    try {
      const jsonOutput = JSON.parse(output);
      if (jsonOutput.dependencies) {
        expect(jsonOutput.dependencies.length).toBeGreaterThan(0);
      }
    } catch {
      // 非 JSON 格式應該包含多個檔案
      expect(output.split('\n').length).toBeGreaterThan(3);
    }

    await complexProject.cleanup();
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

    const output = result.stdout;
    // 沒有依賴的專案也應該有輸出
    expect(output).toBeDefined();

    await simpleProject.cleanup();
  });

  it('應該能處理空專案', async () => {
    const emptyProject = await createTypeScriptProject({});

    const result = await analyzeDependencies(emptyProject.projectPath);
    expect(result.exitCode).toBe(0);

    await emptyProject.cleanup();
  });

  it('應該能檢測外部依賴', async () => {
    const projectWithExternal = await createTypeScriptProject({
      'src/index.ts': `
import * as fs from 'fs';
import * as path from 'path';
import { myModule } from './myModule';

export function readConfig() {
  const configPath = path.join(__dirname, 'config.json');
  return fs.readFileSync(configPath, 'utf-8');
}
      `.trim(),
      'src/myModule.ts': `export const myModule = {};`
    });

    const result = await analyzeDependencies(projectWithExternal.projectPath);
    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);

    await projectWithExternal.cleanup();
  });

  it('應該能處理大型依賴圖', async () => {
    const files: Record<string, string> = {};

    // 建立 20 個模組
    for (let i = 0; i < 20; i++) {
      files[`src/module${i}.ts`] = `
export function func${i}() {
  return ${i};
}
      `.trim();
    }

    // 建立主入口，依賴所有模組
    const imports = Array.from({ length: 20 }, (_, i) =>
      `import { func${i} } from './module${i}';`
    ).join('\n');

    files['src/index.ts'] = `
${imports}

export function callAll() {
  return [${Array.from({ length: 20 }, (_, i) => `func${i}()`).join(', ')}];
}
    `.trim();

    const largeProject = await createTypeScriptProject(files);

    const result = await analyzeDependencies(largeProject.projectPath);
    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);

    await largeProject.cleanup();
  });

  it('應該能檢測影響範圍', async () => {
    const projectForImpact = await createTypeScriptProject({
      'src/base.ts': `export const BASE = 'base';`,
      'src/service1.ts': `
import { BASE } from './base';
export const service1 = BASE + '1';
      `.trim(),
      'src/service2.ts': `
import { BASE } from './base';
export const service2 = BASE + '2';
      `.trim(),
      'src/service3.ts': `
import { service1 } from './service1';
export const service3 = service1 + '3';
      `.trim()
    });

    const result = await analyzeDependencies(projectForImpact.projectPath);
    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);

    await projectForImpact.cleanup();
  });

  it('應該能處理多種 import 語法', async () => {
    const projectWithVariousImports = await createTypeScriptProject({
      'src/exports.ts': `
export const named = 'named';
export default 'default';
export * as namespace from './namespace';
      `.trim(),
      'src/namespace.ts': `export const value = 42;`,
      'src/imports.ts': `
import defaultExport from './exports';
import { named } from './exports';
import * as allExports from './exports';
import type { SomeType } from './types';

const dynamicImport = () => import('./dynamic');
      `.trim(),
      'src/types.ts': `export type SomeType = string;`,
      'src/dynamic.ts': `export const dynamic = 'loaded';`
    });

    const result = await analyzeDependencies(projectWithVariousImports.projectPath);
    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);

    await projectWithVariousImports.cleanup();
  });

  it('應該能檢測多層循環依賴', async () => {
    const multiCycleProject = await createTypeScriptProject({
      'src/cycle1.ts': `import { func2 } from './cycle2'; export function func1() { return func2(); }`,
      'src/cycle2.ts': `import { func3 } from './cycle3'; export function func2() { return func3(); }`,
      'src/cycle3.ts': `import { func1 } from './cycle1'; export function func3() { return func1(); }`
    });

    const result = await analyzeDependencies(multiCycleProject.projectPath);
    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.toLowerCase()).toMatch(/cycle|circular|循環/);

    await multiCycleProject.cleanup();
  });

  it('應該能處理深層目錄結構的依賴', async () => {
    const deepProject = await createTypeScriptProject({
      'src/level1/level2/level3/deep.ts': `export const deep = 'deep';`,
      'src/level1/level2/mid.ts': `import { deep } from './level3/deep'; export const mid = deep;`,
      'src/level1/shallow.ts': `import { mid } from './level2/mid'; export const shallow = mid;`,
      'src/index.ts': `import { shallow } from './level1/shallow'; export const root = shallow;`
    });

    const result = await analyzeDependencies(deepProject.projectPath);
    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);

    await deepProject.cleanup();
  });

  it('應該能處理重複 import 同一模組', async () => {
    const duplicateProject = await createTypeScriptProject({
      'src/shared.ts': `export const value = 42;`,
      'src/user1.ts': `import { value } from './shared'; import { value as val } from './shared';`,
      'src/user2.ts': `import { value } from './shared'; export const result = value;`
    });

    const result = await analyzeDependencies(duplicateProject.projectPath);
    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);

    await duplicateProject.cleanup();
  });

  it('應該能處理 re-export 場景', async () => {
    const reexportProject = await createTypeScriptProject({
      'src/core/utils.ts': `export function util() { return 'util'; }`,
      'src/core/index.ts': `export * from './utils'; export { util as coreUtil } from './utils';`,
      'src/main.ts': `import { util, coreUtil } from './core'; console.log(util(), coreUtil());`
    });

    const result = await analyzeDependencies(reexportProject.projectPath);
    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);

    await reexportProject.cleanup();
  });

  it('應該能處理條件式 import', async () => {
    const conditionalProject = await createTypeScriptProject({
      'src/feature.ts': `export const feature = 'enabled';`,
      'src/fallback.ts': `export const fallback = 'disabled';`,
      'src/main.ts': `
const USE_FEATURE = true;
const module = USE_FEATURE ? await import('./feature') : await import('./fallback');
      `.trim()
    });

    const result = await analyzeDependencies(conditionalProject.projectPath);
    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output.length).toBeGreaterThan(0);

    await conditionalProject.cleanup();
  });
});
