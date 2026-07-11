/**
 * CLI find-references --at 過濾器作用域感知 regression 測試
 *
 * 目標：symbol-reference-filter.ts 的 --at 過濾器以「裸名稱比對」取代真正的作用域/繼承判斷，
 * 對下列情境會誤報（false positive）或漏報（false negative）：
 *   1. `export * from './x'` barrel 檔內同名區域變數被誤報為引用
 *   2. 遮蔽（shadow）已匯入名稱的區域變數（for-of 迴圈變數等）被誤報為引用
 *   3. 子類別 `this.method()` 呼叫繼承自父類別的方法時被漏報（丟棄）
 *
 * 三筆 bug 均先以不帶 --at 的 baseline 佐證資料存在，再以 --at 佐證過濾器造成誤報/漏報。
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
});
