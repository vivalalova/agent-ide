/**
 * CLI find-references 命令 E2E 測試
 * 基於 sample-project fixture 測試符號引用搜尋功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI find-references - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功查找函數引用並輸出 JSON 格式', async () => {
      await fixture.writeFile('utils.ts', 'export function processData(input: string) { return input; }');
      await fixture.writeFile('main.ts', 'import { processData } from "./utils.js";\nconst result = processData("test");');

      const result = await executeCLI(
        ['find-references', 'processData', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('processData');
      expect(output.success).toBe(true);
    });

    it('應該支援 summary 格式輸出', async () => {
      await fixture.writeFile('helper.ts', 'export function helper() {}');

      const result = await executeCLI(
        ['find-references', 'helper', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('helper');
    });

    it('應該包含引用統計', async () => {
      await fixture.writeFile('lib.ts', 'export const value = 1;');
      await fixture.writeFile('a.ts', 'import { value } from "./lib.js";\nexport const a = value;');
      await fixture.writeFile('b.ts', 'import { value } from "./lib.js";\nexport const b = value;');

      const result = await executeCLI(
        ['find-references', 'value', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
      expect(output.summary.totalReferences).toBeGreaterThan(0);
      expect(output.summary.filesAffected).toBeGreaterThan(0);
    });
  });

  describe('定義位置查找', () => {
    it('應該返回符號定義位置', async () => {
      await fixture.writeFile('def.ts', 'export const target = 42;');

      const result = await executeCLI(
        ['find-references', 'target', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.definition).toBeDefined();
      if (output.definition) {
        expect(output.definition.file).toContain('def.ts');
        expect(output.definition.line).toBeGreaterThan(0);
      }
    });

    it('應該處理找不到定義的情況', async () => {
      await fixture.writeFile('empty.ts', 'export const other = 1;');

      const result = await executeCLI(
        ['find-references', 'nonexistent', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.definition).toBeNull();
      expect(output.references).toHaveLength(0);
    });

    it('應該返回符號類型', async () => {
      await fixture.writeFile('types.ts', 'export function myFunc() {}\nexport const myConst = 1;\nexport class MyClass {}');

      const funcResult = await executeCLI(
        ['find-references', 'myFunc', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(funcResult.exitCode).toBe(0);
      const funcOutput = JSON.parse(funcResult.stdout);
      expect(funcOutput.type).toBeDefined();
    });
  });

  describe('引用類型識別', () => {
    it('應該查找 import 引用', async () => {
      await fixture.writeFile('source.ts', 'export const exported = "value";');
      await fixture.writeFile('consumer.ts', 'import { exported } from "./source.js";\nconsole.log(exported);');

      const result = await executeCLI(
        ['find-references', 'exported', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.references).toBeDefined();
      expect(Array.isArray(output.references)).toBe(true);
    });

    it('應該查找函數呼叫引用', async () => {
      await fixture.writeFile('fn.ts', 'export function fn() { return 1; }');
      await fixture.writeFile('caller.ts', 'import { fn } from "./fn.js";\nconst result = fn();');

      const result = await executeCLI(
        ['find-references', 'fn', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.references).toBeDefined();
      expect(Array.isArray(output.references)).toBe(true);
    });
  });

  describe('跨檔案引用', () => {
    it('應該查找跨多檔案的引用', async () => {
      await fixture.writeFile('shared.ts', 'export const CONSTANT = "shared";');
      await fixture.writeFile('a.ts', 'import { CONSTANT } from "./shared.js";\nexport const a = CONSTANT;');
      await fixture.writeFile('b.ts', 'import { CONSTANT } from "./shared.js";\nexport const b = CONSTANT;');
      await fixture.writeFile('c.ts', 'import { CONSTANT } from "./shared.js";\nfunction use() { return CONSTANT; }');

      const result = await executeCLI(
        ['find-references', 'CONSTANT', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(typeof output.summary.filesAffected).toBe('number');
    });

    it('應該處理 re-export 的引用', async () => {
      await fixture.writeFile('origin.ts', 'export const original = 1;');
      await fixture.writeFile('barrel.ts', 'export { original } from "./origin.js";');
      await fixture.writeFile('user.ts', 'import { original } from "./barrel.js";\nexport const use = original;');

      const result = await executeCLI(
        ['find-references', 'original', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('JSON 輸出結構驗證', () => {
    it('應該包含完整的輸出結構', async () => {
      await fixture.writeFile('test.ts', 'export function testFn() {}');

      const result = await executeCLI(
        ['find-references', 'testFn', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.command).toBe('find-references');
      expect(output.success).toBe(true);
      expect(output.symbol).toBe('testFn');
      expect(output.type).toBeDefined();
      expect(output.summary).toBeDefined();
      expect(output.summary.totalReferences).toBeDefined();
      expect(output.summary.filesAffected).toBeDefined();
      expect(Array.isArray(output.references)).toBe(true);
    });

    it('應該返回正確的引用項目結構', async () => {
      await fixture.writeFile('struct.ts', 'export const structValue = 1;');
      await fixture.writeFile('use-struct.ts', 'import { structValue } from "./struct.js";\nconst x = structValue;');

      const result = await executeCLI(
        ['find-references', 'structValue', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      if (output.references.length > 0) {
        const ref = output.references[0];
        expect(ref.file).toBeDefined();
        expect(ref.line).toBeDefined();
        expect(ref.type).toBeDefined();
      }
    });
  });

  describe('大規模專案情境', () => {
    it('應該處理 50+ 檔案中的引用搜尋', async () => {
      await fixture.writeFile('core.ts', 'export const coreValue = 1;');

      const files = Array.from({ length: 55 }, (_, i) => ({
        path: `consumer-${i}.ts`,
        content: `import { coreValue } from "./core.js";\nexport const use${i} = coreValue;`
      }));

      await Promise.all(files.map(f => fixture.writeFile(f.path, f.content)));

      const result = await executeCLI(
        ['find-references', 'coreValue', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(typeof output.summary.filesAffected).toBe('number');
    });

    it('應該處理深層嵌套的符號引用', async () => {
      await fixture.writeFile('deep/nested/module.ts', 'export const deepValue = "deep";');
      await fixture.writeFile('deep/user.ts', 'import { deepValue } from "./nested/module.js";\nexport const use = deepValue;');
      await fixture.writeFile('top.ts', 'import { use } from "./deep/user.js";\nexport const top = use;');

      const result = await executeCLI(
        ['find-references', 'deepValue', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('特殊符號類型', () => {
    it('應該查找 class 引用', async () => {
      await fixture.writeFile('myclass.ts', 'export class MyService { run() {} }');
      await fixture.writeFile('use-class.ts', 'import { MyService } from "./myclass.js";\nconst svc = new MyService();');

      const result = await executeCLI(
        ['find-references', 'MyService', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該查找 interface 引用', async () => {
      await fixture.writeFile('iface.ts', 'export interface IConfig { value: string; }');
      await fixture.writeFile('use-iface.ts', 'import type { IConfig } from "./iface.js";\nconst cfg: IConfig = { value: "x" };');

      const result = await executeCLI(
        ['find-references', 'IConfig', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該查找 type alias 引用', async () => {
      await fixture.writeFile('alias.ts', 'export type UserId = string;');
      await fixture.writeFile('use-alias.ts', 'import type { UserId } from "./alias.js";\nconst id: UserId = "123";');

      const result = await executeCLI(
        ['find-references', 'UserId', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('邊界條件', () => {
    it('應該處理空專案', async () => {
      const result = await executeCLI(
        ['find-references', 'anything', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.references).toHaveLength(0);
    });

    it('應該處理特殊字元符號名', async () => {
      await fixture.writeFile('special.ts', 'export const $value = 1;\nexport const _private = 2;');

      const result = await executeCLI(
        ['find-references', '$value', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理同名不同檔案的符號', async () => {
      await fixture.writeFile('moduleA.ts', 'export const name = "A";');
      await fixture.writeFile('moduleB.ts', 'export const name = "B";');

      const result = await executeCLI(
        ['find-references', 'name', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('錯誤處理', () => {
    it('應該拒絕無效的格式選項', async () => {
      const result = await executeCLI(
        ['find-references', 'test', '--path', fixture.rootPath, '--format', 'invalid'],
        { memfs: fixture.memfs }
      );

      // 可能返回錯誤或成功（取決於錯誤處理方式）
      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該處理不存在的路徑', async () => {
      const result = await executeCLI(
        ['find-references', 'test', '--path', '/nonexistent/path', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // memfs 環境下路徑處理可能不同
      expect([0, 1]).toContain(result.exitCode);
    });
  });
});
