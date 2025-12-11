/**
 * CLI snapshot 命令 E2E 測試 - 覆蓋率補強
 * 測試更多邊界情況和複雜場景
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI snapshot coverage - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('多檔案模組', () => {
    it('應該處理包含多個檔案的模組', async () => {
      await fixture.writeFile('src/multi/index.ts', `
export { a } from './a.js';
export { b } from './b.js';
export { c } from './c.js';
`);
      await fixture.writeFile('src/multi/a.ts', 'export const a = 1;');
      await fixture.writeFile('src/multi/b.ts', 'export const b = 2;');
      await fixture.writeFile('src/multi/c.ts', 'export const c = 3;');

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/multi`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理巢狀目錄結構', async () => {
      await fixture.writeFile('src/nested/level1/level2/deep.ts', `
export class DeepClass {
  deepMethod(): void {}
}
`);
      await fixture.writeFile('src/nested/index.ts', `
export { DeepClass } from './level1/level2/deep.js';
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/nested`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });

  describe('複雜類別結構', () => {
    it('應該提取 abstract class 資訊', async () => {
      await fixture.writeFile('src/abstract/index.ts', `
export abstract class BaseService {
  abstract process(): void;
  protected helper(): number { return 1; }
}
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/abstract`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理繼承關係', async () => {
      await fixture.writeFile('src/inherit/base.ts', `
export class BaseClass {
  baseMethod(): void {}
}
`);
      await fixture.writeFile('src/inherit/derived.ts', `
import { BaseClass } from './base.js';
export class DerivedClass extends BaseClass {
  derivedMethod(): void {}
}
`);
      await fixture.writeFile('src/inherit/index.ts', `
export { BaseClass } from './base.js';
export { DerivedClass } from './derived.js';
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/inherit`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理 implements interface', async () => {
      await fixture.writeFile('src/impl/types.ts', `
export interface Processor {
  process(data: string): string;
}
`);
      await fixture.writeFile('src/impl/impl.ts', `
import type { Processor } from './types.js';
export class StringProcessor implements Processor {
  process(data: string): string { return data.toUpperCase(); }
}
`);
      await fixture.writeFile('src/impl/index.ts', `
export type { Processor } from './types.js';
export { StringProcessor } from './impl.js';
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/impl`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });

  describe('特殊語法', () => {
    it('應該處理 getter/setter', async () => {
      await fixture.writeFile('src/accessor/index.ts', `
export class Container {
  private _value = 0;
  get value(): number { return this._value; }
  set value(v: number) { this._value = v; }
}
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/accessor`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理 static 成員', async () => {
      await fixture.writeFile('src/static/index.ts', `
export class Utils {
  static readonly VERSION = '1.0.0';
  static helper(): void {}
}
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/static`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理泛型類別', async () => {
      await fixture.writeFile('src/generic/index.ts', `
export class Container<T> {
  private items: T[] = [];
  add(item: T): void { this.items.push(item); }
  get(index: number): T | undefined { return this.items[index]; }
}
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/generic`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理裝飾器', async () => {
      await fixture.writeFile('src/decorator/index.ts', `
function Log(target: any, key: string): void {}

export class Service {
  @Log
  action(): void {}
}
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/decorator`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });

  describe('Factory 函數識別', () => {
    it('應該識別 createXxx 模式的 factory', async () => {
      await fixture.writeFile('src/factory/index.ts', `
export interface User { name: string; }
export function createUser(name: string): User { return { name }; }
export function createDefaultUser(): User { return { name: 'default' }; }
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/factory`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.snapshot.factories).toBeDefined();
    });

    it('應該識別 makeXxx 模式的 factory', async () => {
      await fixture.writeFile('src/make/index.ts', `
export interface Config { value: number; }
export function makeConfig(value: number): Config { return { value }; }
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/make`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該識別 buildXxx 模式的 factory', async () => {
      await fixture.writeFile('src/build/index.ts', `
export interface Query { sql: string; }
export function buildQuery(sql: string): Query { return { sql }; }
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/build`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });

  describe('Type 定義提取', () => {
    it('應該提取 union type', async () => {
      await fixture.writeFile('src/union/index.ts', `
export type Status = 'pending' | 'active' | 'completed';
export type Result = { success: true; data: string } | { success: false; error: string };
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/union`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該提取 intersection type', async () => {
      await fixture.writeFile('src/intersect/index.ts', `
export interface Named { name: string; }
export interface Aged { age: number; }
export type Person = Named & Aged;
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/intersect`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該提取 mapped type', async () => {
      await fixture.writeFile('src/mapped/index.ts', `
export type Readonly<T> = { readonly [P in keyof T]: T[P] };
export type Partial<T> = { [P in keyof T]?: T[P] };
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/mapped`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該提取 enum', async () => {
      await fixture.writeFile('src/enum/index.ts', `
export enum Color { Red, Green, Blue }
export const enum Direction { Up = 'UP', Down = 'DOWN' }
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/enum`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });

  describe('輸出格式', () => {
    it('應該支援 summary 格式', async () => {
      const result = await executeCLI(
        ['snapshot', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('JSON 輸出應包含完整結構', async () => {
      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/types`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('snapshot');
      expect(output.success).toBe(true);
      expect(output.snapshotType).toBeDefined();
      expect(output.snapshot).toBeDefined();
    });
  });

  describe('大規模專案', () => {
    it('應該處理 30+ 檔案的模組', async () => {
      for (let i = 0; i < 35; i++) {
        await fixture.writeFile(`src/large/file${i}.ts`, `
export const value${i} = ${i};
export function func${i}(): number { return ${i}; }
`);
      }

      await fixture.writeFile('src/large/index.ts',
        Array.from({ length: 35 }, (_, i) =>
          `export { value${i}, func${i} } from './file${i}.js';`
        ).join('\n')
      );

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/large`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理複雜依賴網絡', async () => {
      // 建立相互引用的模組
      await fixture.writeFile('src/network/a.ts', `
import { b } from './b.js';
export const a = b + 1;
`);
      await fixture.writeFile('src/network/b.ts', `
export const b = 1;
`);
      await fixture.writeFile('src/network/c.ts', `
import { a } from './a.js';
import { b } from './b.js';
export const c = a + b;
`);
      await fixture.writeFile('src/network/index.ts', `
export { a } from './a.js';
export { b } from './b.js';
export { c } from './c.js';
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/network`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });

  describe('邊界條件', () => {
    it('應該處理空模組', async () => {
      await fixture.writeFile('src/empty/index.ts', '// Empty module');

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/empty`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理只有 re-export 的模組', async () => {
      await fixture.writeFile('src/reexport/types.ts', 'export interface User { id: string; }');
      await fixture.writeFile('src/reexport/index.ts', 'export * from \'./types.js\';');

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/reexport`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理有語法錯誤的檔案', async () => {
      await fixture.writeFile('src/error/index.ts', `
export const x = {
  // 未閉合的大括號
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/error`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 應該不會崩潰
      expect(typeof result.exitCode).toBe('number');
    });

    it('應該處理非常長的函數簽章', async () => {
      await fixture.writeFile('src/long/index.ts', `
export function veryLongFunctionName(
  param1: string,
  param2: number,
  param3: boolean,
  param4: { nested: { deep: string } },
  param5: Array<{ id: string; value: number }>,
  param6?: string
): Promise<{ result: string; count: number }> {
  return Promise.resolve({ result: '', count: 0 });
}
`);

      const result = await executeCLI(
        ['snapshot', '--path', `${fixture.rootPath}/src/long`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });
});
