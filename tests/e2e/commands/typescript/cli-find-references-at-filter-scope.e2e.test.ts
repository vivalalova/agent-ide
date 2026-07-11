/**
 * CLI find-references --at 過濾器作用域感知 regression 測試
 *
 * 目標：symbol-reference-filter.ts 的 --at 過濾器以「裸名稱比對」取代真正的作用域/繼承判斷，
 * 對下列情境會誤報（false positive）或漏報（false negative）：
 *   1. `export * from './x'` barrel 檔內同名區域變數被誤報為引用
 *   2. 遮蔽（shadow）已匯入名稱的區域變數（for-of 迴圈變數等）被誤報為引用
 *   3. 子類別 `this.method()` 呼叫繼承自父類別的方法時被漏報（丟棄）
 *   4. `export { X } from './x'` 具名 re-export 檔內同名區域變數（宣告與其引用）被誤報為引用
 *   5. for-of 迴圈變數遮蔽 import 的作用域判斷過寬，迴圈頭與 body 內遮蔽用法仍被誤報為引用
 *   6. 呼叫路徑漏做遮蔽檢查，區域變數（含函式型別）遮蔽 import 後的呼叫仍被誤報為引用
 *   7. 解構綁定（`const { x } = obj`）遮蔽 import 時看不見遮蔽，綁定與其引用被誤報為引用
 *   8. `default import` 無條件視為 owner，未比對實際綁定的類別，繼承自不同類別的同名方法被誤報為引用
 *
 * 每筆 bug 均先以不帶 --at 或另一真實引用佐證資料存在，再以 --at 佐證過濾器造成誤報/漏報。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI find-references --at 過濾器作用域感知 regression', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  // MARK: - export * barrel 檔同名區域變數誤報

  describe('export * barrel 檔內同名區域變數 regression', () => {
    it('--at 鎖定原始定義時，barrel 檔（export * from）內同名區域變數不應被誤報為引用', async () => {
      await fixture.writeFile('src/at-scope-target.ts', [
        'export const foo = 1;',
        '',
        'export function useFoo(): number {',
        '  return foo;',
        '}'
      ].join('\n'));
      await fixture.writeFile('src/at-scope-barrel.ts', [
        'export * from \'./at-scope-target.js\';',
        '',
        'function g(): number {',
        '  const foo = 99;',
        '  return foo;',
        '}'
      ].join('\n'));

      const result = await executeCLI(
        [
          'find-references',
          'foo',
          '--path',
          fixture.rootPath,
          '--at',
          'src/at-scope-target.ts:1:14',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output: any = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 正向：target.ts 內對 foo 的真實使用（useFoo 內的 return foo）必須被找到
      expect(
        output.references.some(
          (r: any) => r.file.endsWith('at-scope-target.ts') && r.line === 4
        )
      ).toBe(true);

      // Bug：barrel.ts 內 g() 的區域變數 foo（const foo = 99 及其 return foo）
      // 被誤報為對 target.ts 匯出 foo 的引用
      expect(
        output.references.some((r: any) => r.file.endsWith('at-scope-barrel.ts'))
      ).toBe(false);
    });
  });

  // MARK: - 遮蔽已匯入名稱的區域變數誤報

  describe('遮蔽（shadow）已匯入名稱的區域變數 regression', () => {
    it('--at 跨檔過濾不應把遮蔽 import 的區域變數（for-of 迴圈變數）誤報為引用', async () => {
      await fixture.writeFile('src/at-scope-config-target.ts', [
        'export const config = { value: 1 };'
      ].join('\n'));
      await fixture.writeFile('src/at-scope-config-consumer.ts', [
        'import { config } from \'./at-scope-config-target.js\';',
        'export function use() { return config.value; }',
        'export function loop(configs: Array<{ value: number }>) {',
        '  for (const config of configs) { console.log(config.value); }',
        '  return configs;',
        '}'
      ].join('\n'));

      const result = await executeCLI(
        [
          'find-references',
          'config',
          '--path',
          fixture.rootPath,
          '--at',
          'src/at-scope-config-target.ts:1:14',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output: any = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 正向：use() 內對真正匯入的 config 的引用（config.value）必須被找到
      expect(
        output.references.some(
          (r: any) =>
            r.file.endsWith('at-scope-config-consumer.ts')
            && r.context.includes('return config.value')
        )
      ).toBe(true);

      // Bug：loop() 內被 for-of 遮蔽的區域變數 config 被誤報為對匯入 config 的引用
      expect(
        output.references.some(
          (r: any) =>
            r.file.endsWith('at-scope-config-consumer.ts')
            && r.context.includes('for (const config of configs)')
        )
      ).toBe(false);
    });
  });

  // MARK: - 子類別 this.method() 呼叫繼承方法漏報

  describe('子類別 this.method() 呼叫繼承方法 regression', () => {
    it('baseline（不帶 --at）：子類別 this.greet() 呼叫應被找到', async () => {
      await fixture.writeFile('src/at-scope-inherit.ts', [
        'export class Parent {',
        '  greet(): string { return \'hi\'; }',
        '}',
        'export class Child extends Parent {',
        '  call(): string { return this.greet(); }',
        '}'
      ].join('\n'));

      const baseline = await executeCLI(
        ['find-references', 'greet', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );
      const baselineOutput: any = JSON.parse(baseline.stdout);
      expect(baselineOutput.success).toBe(true);
      expect(
        baselineOutput.references.some(
          (r: any) => r.file.endsWith('at-scope-inherit.ts') && r.context.includes('this.greet()')
        )
      ).toBe(true);
    });

    it('--at 鎖定父類別方法定義時，子類別 this.greet() 呼叫不應被丟棄', async () => {
      await fixture.writeFile('src/at-scope-inherit.ts', [
        'export class Parent {',
        '  greet(): string { return \'hi\'; }',
        '}',
        'export class Child extends Parent {',
        '  call(): string { return this.greet(); }',
        '}'
      ].join('\n'));

      const result = await executeCLI(
        [
          'find-references',
          'greet',
          '--path',
          fixture.rootPath,
          '--at',
          'src/at-scope-inherit.ts:2:3',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output: any = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // Bug：--at 過濾器要求 enclosing class 名稱等於 owner（Parent），
      // 子類別 Child 內的 this.greet() 因 class 名不符而被丟棄
      expect(
        output.references.some(
          (r: any) => r.file.endsWith('at-scope-inherit.ts') && r.context.includes('this.greet()')
        )
      ).toBe(true);
    });
  });

  // MARK: - 具名 re-export barrel 檔內同名區域變數誤留

  describe('具名 re-export（export { X } from）barrel 檔內同名區域變數 regression', () => {
    it('--at 鎖定原始定義時，barrel 檔內同名區域變數宣告與其引用不應被誤報，但具名 re-export 子句本身應被找到', async () => {
      await fixture.writeFile('src/nre-target.ts', [
        'export const nreFoo = 1;'
      ].join('\n'));
      await fixture.writeFile('src/nre-barrel.ts', [
        'export { nreFoo } from \'./nre-target.js\';',
        'export function g(): number {',
        '  const nreFoo = 99;',
        '  return nreFoo;',
        '}'
      ].join('\n'));

      const result = await executeCLI(
        [
          'find-references',
          'nreFoo',
          '--path',
          fixture.rootPath,
          '--at',
          'src/nre-target.ts:1:14',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output: any = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 正向：具名 re-export 子句本身是對原始 nreFoo 的真實引用，必須被找到
      expect(
        output.references.some((r: any) => r.file.endsWith('nre-barrel.ts') && r.line === 1)
      ).toBe(true);

      // Bug：g() 內區域變數 nreFoo（const nreFoo = 99 及其 return nreFoo）
      // 被誤報為對 target.ts 匯出 nreFoo 的引用
      expect(
        output.references.some((r: any) => r.file.endsWith('nre-barrel.ts') && r.line === 3)
      ).toBe(false);
      expect(
        output.references.some((r: any) => r.file.endsWith('nre-barrel.ts') && r.line === 4)
      ).toBe(false);
    });
  });

  // MARK: - for-of 迴圈變數遮蔽 import 作用域過寬誤報

  describe('for-of 迴圈變數遮蔽 import 作用域過寬 regression', () => {
    it('--at 跨檔過濾應找到迴圈外真實引用，但不應把被 for-of 遮蔽的迴圈頭與 body 內用法誤報為引用', async () => {
      await fixture.writeFile('src/cfg-target.ts', [
        'export const cfgVal = 42;'
      ].join('\n'));
      await fixture.writeFile('src/cfg-consumer.ts', [
        'import { cfgVal } from \'./cfg-target.js\';',
        'export function loop(items: number[]): number[] {',
        '  const before = cfgVal;',
        '  for (const cfgVal of [items.length]) {',
        '    void cfgVal;',
        '  }',
        '  const after = cfgVal;',
        '  return [before, after];',
        '}'
      ].join('\n'));

      const result = await executeCLI(
        [
          'find-references',
          'cfgVal',
          '--path',
          fixture.rootPath,
          '--at',
          'src/cfg-target.ts:1:14',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output: any = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 正向：迴圈外對真正匯入的 cfgVal 的引用（import 行、before、after）必須被找到
      expect(
        output.references.some((r: any) => r.file.endsWith('cfg-consumer.ts') && r.line === 1)
      ).toBe(true);
      expect(
        output.references.some(
          (r: any) => r.file.endsWith('cfg-consumer.ts') && r.context.includes('const before = cfgVal')
        )
      ).toBe(true);
      expect(
        output.references.some(
          (r: any) => r.file.endsWith('cfg-consumer.ts') && r.context.includes('const after = cfgVal')
        )
      ).toBe(true);

      // Bug：for-of 頭與 body 內被遮蔽的區域變數 cfgVal 被誤報為對匯入 cfgVal 的引用
      expect(
        output.references.some(
          (r: any) =>
            r.file.endsWith('cfg-consumer.ts')
            && r.context.includes('for (const cfgVal of [items.length])')
        )
      ).toBe(false);
      expect(
        output.references.some(
          (r: any) => r.file.endsWith('cfg-consumer.ts') && r.context.includes('void cfgVal')
        )
      ).toBe(false);
    });
  });

  // MARK: - 呼叫路徑漏做遮蔽檢查誤報

  describe('呼叫路徑漏做遮蔽檢查 regression', () => {
    it('--at 跨檔過濾不應把遮蔽 import 函式的區域變數呼叫誤報為對匯入函式的引用', async () => {
      await fixture.writeFile('src/cfn-target.ts', [
        'export function cfnFn(): number { return 0; }'
      ].join('\n'));
      await fixture.writeFile('src/cfn-consumer.ts', [
        'import { cfnFn } from \'./cfn-target.js\';',
        'export function wrapper(): number {',
        '  const cfnFn = (): number => 1;',
        '  return cfnFn();',
        '}'
      ].join('\n'));

      const result = await executeCLI(
        [
          'find-references',
          'cfnFn',
          '--path',
          fixture.rootPath,
          '--at',
          'src/cfn-target.ts:1:17',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output: any = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 正向：import 行本身是對匯入 cfnFn 的真實引用，必須被找到
      expect(
        output.references.some((r: any) => r.file.endsWith('cfn-consumer.ts') && r.line === 1)
      ).toBe(true);

      // Bug：wrapper() 內遮蔽 import 的區域變數 cfnFn（const cfnFn 宣告與 cfnFn() 呼叫）
      // 被誤報為對匯入 cfnFn 的引用
      expect(
        output.references.some(
          (r: any) => r.file.endsWith('cfn-consumer.ts') && r.context.includes('const cfnFn')
        )
      ).toBe(false);
      expect(
        output.references.some(
          (r: any) => r.file.endsWith('cfn-consumer.ts') && r.context.includes('return cfnFn()')
        )
      ).toBe(false);
    });
  });

  // MARK: - 解構綁定遮蔽看不見誤報

  describe('解構綁定（destructuring）遮蔽看不見 regression', () => {
    it('--at 跨檔過濾不應把解構綁定遮蔽 import 的宣告與其引用誤報為引用', async () => {
      await fixture.writeFile('src/dst-target.ts', [
        'export const dstVal = 7;'
      ].join('\n'));
      await fixture.writeFile('src/dst-consumer.ts', [
        'import { dstVal } from \'./dst-target.js\';',
        'export function pick(obj: { dstVal: number }): number {',
        '  const { dstVal } = obj;',
        '  return dstVal;',
        '}',
        'export const real = dstVal;'
      ].join('\n'));

      const result = await executeCLI(
        [
          'find-references',
          'dstVal',
          '--path',
          fixture.rootPath,
          '--at',
          'src/dst-target.ts:1:14',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output: any = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 正向：import 行與 pick() 之外對真正匯入 dstVal 的引用（export const real = dstVal）必須被找到
      expect(
        output.references.some((r: any) => r.file.endsWith('dst-consumer.ts') && r.line === 1)
      ).toBe(true);
      expect(
        output.references.some(
          (r: any) => r.file.endsWith('dst-consumer.ts') && r.context.includes('export const real = dstVal')
        )
      ).toBe(true);

      // Bug：pick() 內被解構綁定遮蔽的區域變數 dstVal（解構宣告與 return dstVal）
      // 被誤報為對匯入 dstVal 的引用
      expect(
        output.references.some(
          (r: any) => r.file.endsWith('dst-consumer.ts') && r.context.includes('const { dstVal } = obj')
        )
      ).toBe(false);
      expect(
        output.references.some(
          (r: any) => r.file.endsWith('dst-consumer.ts') && r.context.includes('return dstVal')
        )
      ).toBe(false);
    });
  });

  // MARK: - default import 無條件當 owner 誤報

  describe('default import 無條件視為 owner regression', () => {
    it('--at 鎖定具名類別方法定義時，default import 之不同類別同名方法呼叫不應被誤報為引用', async () => {
      await fixture.writeFile('src/own-target.ts', [
        'export class Owner {',
        '  method(): number { return 1; }',
        '}',
        'export default class Other {',
        '  method(): number { return 2; }',
        '}'
      ].join('\n'));
      await fixture.writeFile('src/own-consumer.ts', [
        'import Other from \'./own-target.js\';',
        'export const x = new Other().method();'
      ].join('\n'));

      const result = await executeCLI(
        [
          'find-references',
          'method',
          '--path',
          fixture.rootPath,
          '--at',
          'src/own-target.ts:2:3',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output: any = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 正向：own-target.ts 內 Owner.method 定義本身應被找到
      expect(
        output.references.some((r: any) => r.file.endsWith('own-target.ts') && r.line === 2)
      ).toBe(true);

      // Bug：default import 的 Other 被無條件當成 Owner，own-consumer.ts 內對
      // Other.method（不同類別的同名方法）的呼叫被誤報為對 Owner.method 的引用
      expect(
        output.references.some(
          (r: any) => r.file.endsWith('own-consumer.ts') && r.context.includes('.method()')
        )
      ).toBe(false);
    });
  });
});
