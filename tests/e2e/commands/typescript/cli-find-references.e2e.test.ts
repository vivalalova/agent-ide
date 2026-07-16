/**
 * CLI find-references 命令 E2E 測試
 * 基於 sample-project fixture 測試符號引用搜尋功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

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
      // 唯一名：sample-project 已有 processData（quality-test），撞名會觸發 F6 fail-fast
      await fixture.writeFile('utils.ts', 'export function processDataFindRefE2e(input: string) { return input; }');
      await fixture.writeFile('main.ts', 'import { processDataFindRefE2e } from "./utils.js";\nconst result = processDataFindRefE2e("test");');

      const result = await executeCLI(
        ['find-references', 'processDataFindRefE2e', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('processDataFindRefE2e');
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
      // 唯一名：fixture 內大量 property 叫 value，會被當多定義觸發 F6
      await fixture.writeFile('lib.ts', 'export const valueFindRefE2e = 1;');
      await fixture.writeFile('a.ts', 'import { valueFindRefE2e } from "./lib.js";\nexport const a = valueFindRefE2e;');
      await fixture.writeFile('b.ts', 'import { valueFindRefE2e } from "./lib.js";\nexport const b = valueFindRefE2e;');

      const result = await executeCLI(
        ['find-references', 'valueFindRefE2e', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
      // lib.ts 定義 + a.ts/b.ts 各有 import 和使用 = 至少 5 個引用
      expect(output.summary.totalReferences).toBeGreaterThanOrEqual(5);
      // 至少 3 個檔案（lib.ts, a.ts, b.ts）會受影響
      expect(output.summary.filesAffected).toBeGreaterThanOrEqual(3);
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
        // 定義應在合理行號範圍內
        expect(output.definition.line).toBeGreaterThanOrEqual(1);
        expect(output.definition.line).toBeLessThanOrEqual(5);
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

    it('應該回傳與 line 對齊的 context', async () => {
      const result = await executeCLI(
        ['find-references', 'UserService', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const indexReferences = output.references.filter((ref: { file: string }) => ref.file.endsWith('/src/index.ts'));

      expect(indexReferences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            line: 4,
            context: 'import { UserService } from \'./services/user-service\';'
          }),
          expect.objectContaining({
            line: 24,
            context: 'const userService = new UserService();'
          })
        ])
      );
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

  describe('--at 符號定位', () => {
    it('應該只回傳指定同名函數定義的引用', async () => {
      await fixture.writeFile('src/left-target.ts', 'export function duplicateTarget() { return "left"; }');
      await fixture.writeFile('src/right-target.ts', 'export function duplicateTarget() { return "right"; }');
      await fixture.writeFile(
        'src/use-left-target.ts',
        'import { duplicateTarget } from "./left-target.js";\nexport const left = duplicateTarget();'
      );
      await fixture.writeFile(
        'src/use-right-target.ts',
        'import { duplicateTarget } from "./right-target.js";\nexport const right = duplicateTarget();'
      );

      const result = await executeCLI(
        [
          'find-references',
          'duplicateTarget',
          '--path',
          fixture.rootPath,
          '--at',
          'src/left-target.ts:1',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.targetSymbol.file).toContain('src/left-target.ts');
      expect(output.symbols).toHaveLength(1);
      expect(output.summary.definitionCount).toBe(1);

      const referenceFiles = output.references.map((ref: { file: string }) => ref.file);
      expect(referenceFiles.some((file: string) => file.includes('use-left-target.ts'))).toBe(true);
      expect(referenceFiles.some((file: string) => file.includes('use-right-target.ts'))).toBe(false);
    });

    it('同檔 shadowed symbol 不應被 --at 納入指定符號引用', async () => {
      await fixture.writeFile(
        'src/same-file-target.ts',
        [
          'export function sameFileTarget() { return "selected"; }',
          'export const selectedValue = sameFileTarget();',
          'function wrapper() {',
          '  function sameFileTarget() { return "shadow"; }',
          '  return sameFileTarget();',
          '}'
        ].join('\n')
      );

      const result = await executeCLI(
        [
          'find-references',
          'sameFileTarget',
          '--path',
          fixture.rootPath,
          '--at',
          'src/same-file-target.ts:1',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const contexts = output.references.map((ref: { context: string }) => ref.context);

      expect(contexts.some((context: string) => context.includes('selectedValue'))).toBe(true);
      expect(contexts.some((context: string) => context.includes('return "shadow"'))).toBe(false);
      expect(contexts.some((context: string) => context.trim() === 'return sameFileTarget();')).toBe(false);
    });

    it('同名定義沒有 --at 時應 fail-fast 要求指定位置（F6，與 rename 對齊）', async () => {
      await fixture.writeFile('src/identity-a.ts', 'export const duplicateIdentity = "a";');
      await fixture.writeFile('src/identity-b.ts', 'export const duplicateIdentity = "b";');

      const result = await executeCLI(
        ['find-references', 'duplicateIdentity', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 正確：多定義無 --at → 不合併、不成功回傳混合引用
      // 舊行為（錯誤 pin）：exit 0 + 回傳全部 identity；F6 改為 fail-fast
      expect(result.exitCode).not.toBe(0);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toMatch(/--at|同名|ambiguous|多個/i);
    });

    it('應該用 --at 鎖定同名類別方法的引用', async () => {
      await fixture.writeFile('src/left-reference-runner.ts', [
        'export class LeftReferenceRunner {',
        '  run() { return "left"; }',
        '}'
      ].join('\n'));
      await fixture.writeFile('src/right-reference-runner.ts', [
        'export class RightReferenceRunner {',
        '  run() { return "right"; }',
        '}'
      ].join('\n'));
      await fixture.writeFile(
        'src/use-left-reference-runner.ts',
        'import { LeftReferenceRunner } from "./left-reference-runner.js";\nexport function leftReferenceCaller() { return new LeftReferenceRunner().run(); }'
      );
      await fixture.writeFile(
        'src/use-right-reference-runner.ts',
        'import { RightReferenceRunner } from "./right-reference-runner.js";\nexport const right = new RightReferenceRunner().run();'
      );

      const result = await executeCLI(
        [
          'find-references',
          'run',
          '--path',
          fixture.rootPath,
          '--at',
          'src/left-reference-runner.ts:2',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const referenceFiles = output.references.map((ref: { file: string }) => ref.file);

      expect(referenceFiles.some((file: string) => file.includes('use-left-reference-runner.ts'))).toBe(true);
      expect(referenceFiles.some((file: string) => file.includes('use-right-reference-runner.ts'))).toBe(false);
    });

    it('應該解析 tsconfig paths alias 的指定符號引用', async () => {
      await fixture.writeFile('tsconfig.json', JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'ESNext',
          moduleResolution: 'bundler',
          baseUrl: '.',
          paths: {
            '@features/*': ['src/features/*']
          }
        },
        include: ['src/**/*']
      }));
      await fixture.writeFile('src/features/left-alias-source.ts', 'export function aliasPipeline() { return "left"; }');
      await fixture.writeFile('src/features/right-alias-source.ts', 'export function aliasPipeline() { return "right"; }');
      await fixture.writeFile(
        'src/use-left-alias.ts',
        'import { aliasPipeline } from "@features/left-alias-source";\nexport const left = aliasPipeline();'
      );
      await fixture.writeFile(
        'src/use-right-alias.ts',
        'import { aliasPipeline } from "./features/right-alias-source.js";\nexport const right = aliasPipeline();'
      );

      const result = await executeCLI(
        [
          'find-references',
          'aliasPipeline',
          '--path',
          fixture.rootPath,
          '--at',
          'src/features/left-alias-source.ts:1',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const referenceFiles = output.references.map((ref: { file: string }) => ref.file);

      expect(referenceFiles.some((file: string) => file.includes('use-left-alias.ts'))).toBe(true);
      expect(referenceFiles.some((file: string) => file.includes('use-right-alias.ts'))).toBe(false);
    });

    it('應該保留 namespace import 與 barrel re-export 的指定符號引用', async () => {
      await fixture.writeFile('src/left-library.ts', 'export function selectedPipeline() { return "left"; }');
      await fixture.writeFile('src/right-library.ts', 'export function selectedPipeline() { return "right"; }');
      await fixture.writeFile('src/left-barrel.ts', 'export { selectedPipeline } from "./left-library.js";');
      await fixture.writeFile(
        'src/use-left-library.ts',
        [
          'import * as leftLibrary from "./left-library.js";',
          'import { selectedPipeline } from "./left-barrel.js";',
          'export const direct = leftLibrary.selectedPipeline();',
          'export const indirect = selectedPipeline();'
        ].join('\n')
      );
      await fixture.writeFile(
        'src/use-right-library.ts',
        [
          'import * as rightLibrary from "./right-library.js";',
          'export const wrong = rightLibrary.selectedPipeline();'
        ].join('\n')
      );

      const result = await executeCLI(
        [
          'find-references',
          'selectedPipeline',
          '--path',
          fixture.rootPath,
          '--at',
          'src/left-library.ts:1',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const contexts = output.references.map((ref: { context: string }) => ref.context);
      const referenceFiles = output.references.map((ref: { file: string }) => ref.file);

      expect(contexts.some((context: string) => context.includes('leftLibrary.selectedPipeline'))).toBe(true);
      expect(contexts.some((context: string) => context.includes('selectedPipeline();'))).toBe(true);
      expect(referenceFiles.some((file: string) => file.includes('left-barrel.ts'))).toBe(true);
      expect(referenceFiles.some((file: string) => file.includes('use-right-library.ts'))).toBe(false);
    });

    it('同檔混合 namespace import 時不應納入非目標模組引用', async () => {
      await fixture.writeFile('src/left-mixed-library.ts', 'export function mixedPipeline() { return "left"; }');
      await fixture.writeFile('src/right-mixed-library.ts', 'export function mixedPipeline() { return "right"; }');
      await fixture.writeFile(
        'src/use-mixed-library.ts',
        [
          'import * as leftMixed from "./left-mixed-library.js";',
          'import * as rightMixed from "./right-mixed-library.js";',
          'export const left = leftMixed.mixedPipeline();',
          'export const right = rightMixed.mixedPipeline();'
        ].join('\n')
      );

      const result = await executeCLI(
        [
          'find-references',
          'mixedPipeline',
          '--path',
          fixture.rootPath,
          '--at',
          'src/left-mixed-library.ts:1',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const contexts = output.references.map((ref: { context: string }) => ref.context);

      expect(contexts.some((context: string) => context.includes('leftMixed.mixedPipeline'))).toBe(true);
      expect(contexts.some((context: string) => context.includes('rightMixed.mixedPipeline'))).toBe(false);
    });

    it('應該保留 split barrel re-export 的指定符號引用', async () => {
      await fixture.writeFile('src/left-split-source.ts', 'export function splitPipeline() { return "left"; }');
      await fixture.writeFile('src/right-split-source.ts', 'export function splitPipeline() { return "right"; }');
      await fixture.writeFile(
        'src/left-split-barrel.ts',
        [
          'import { splitPipeline } from "./left-split-source.js";',
          'export { splitPipeline };'
        ].join('\n')
      );
      await fixture.writeFile(
        'src/use-left-split.ts',
        'import { splitPipeline } from "./left-split-barrel.js";\nexport const value = splitPipeline();'
      );

      const result = await executeCLI(
        [
          'find-references',
          'splitPipeline',
          '--path',
          fixture.rootPath,
          '--at',
          'src/left-split-source.ts:1',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const referenceFiles = output.references.map((ref: { file: string }) => ref.file);

      expect(referenceFiles.some((file: string) => file.includes('use-left-split.ts'))).toBe(true);
    });

    it('無效 --at 位置應回傳清楚錯誤', async () => {
      await fixture.writeFile('src/valid-target.ts', 'export function locatedTarget() {}');

      const result = await executeCLI(
        [
          'find-references',
          'locatedTarget',
          '--path',
          fixture.rootPath,
          '--at',
          'src/valid-target.ts:99',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('locatedTarget');
      expect(output.error).toContain('src/valid-target.ts:99');
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

    it('同名不同檔案無 --at 時應 fail-fast（F6）', async () => {
      await fixture.writeFile('moduleA.ts', 'export const nameFindRefE2e = "A";');
      await fixture.writeFile('moduleB.ts', 'export const nameFindRefE2e = "B";');

      const result = await executeCLI(
        ['find-references', 'nameFindRefE2e', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).not.toBe(0);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toMatch(/--at|同名|ambiguous|多個/i);
    });

    it('多個同名定義無 --at 時應 fail-fast，不得 silently merge（F6）', async () => {
      await fixture.writeFile('src/ref-a.ts', 'export class DuplicateRef {}');
      await fixture.writeFile('src/ref-b.ts', 'export class DuplicateRef {}');

      const result = await executeCLI(
        ['find-references', 'DuplicateRef', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).not.toBe(0);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toMatch(/--at|同名|ambiguous|多個/i);
    });

    it('用 --at 鎖定後同名定義引用不應重複', async () => {
      await fixture.writeFile('src/ref-pin-a.ts', 'export class DuplicateRefPin {}');
      await fixture.writeFile('src/ref-pin-b.ts', 'export class DuplicateRefPin {}');
      await fixture.writeFile(
        'src/use-ref-pin-a.ts',
        'import { DuplicateRefPin } from "./ref-pin-a.js";\nexport const x = DuplicateRefPin;'
      );

      const result = await executeCLI(
        [
          'find-references',
          'DuplicateRefPin',
          '--path',
          fixture.rootPath,
          '--at',
          'src/ref-pin-a.ts:1',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary.definitionCount).toBe(1);

      const referenceKeys = output.references.map(
        (ref: { file: string; line: number; column?: number; type: string }) =>
          `${ref.file}:${ref.line}:${ref.column ?? ''}:${ref.type}`
      );
      expect(referenceKeys).toHaveLength(new Set(referenceKeys).size);
    });
  });

  describe('錯誤處理', () => {
    it('應該拒絕無效的格式選項', async () => {
      const result = await executeCLI(
        ['find-references', 'test', '--path', fixture.rootPath, '--format', 'invalid'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('不支援的輸出格式');
      expect(result.stdout).toBe('');
    });

    it('無效路徑應回傳 JSON 錯誤', async () => {
      const result = await executeCLI(
        ['find-references', 'test', '--path', '/nonexistent/path/xyz', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('路徑不存在');
    });

    it('檔案路徑不可作為專案路徑', async () => {
      await fixture.writeFile('not-directory.ts', 'export const test = 1;');

      const result = await executeCLI(
        ['find-references', 'test', '--path', fixture.getFilePath('not-directory.ts'), '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('路徑不是目錄');
    });
  });
});
