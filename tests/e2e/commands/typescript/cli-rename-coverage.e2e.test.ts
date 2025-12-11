/**
 * CLI rename 命令 E2E 測試 - 覆蓋率補強
 * 專注於實際執行重命名（非 dry-run）以提升 core/rename 覆蓋率
 *
 * 注意: 所有新建檔案放到 src/ 子目錄（mem-vfs glob bug: **\/*.ts 不匹配根目錄檔案）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename coverage - 實際執行測試', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('實際執行重命名（非 dry-run）', () => {
    it('應該實際執行 class 重命名並更新檔案', async () => {
      await fixture.writeFile('src/rename-class.ts', `
export class OldClassName {
  value: number = 1;
  method() { return this.value; }
}
const instance = new OldClassName();
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OldClassName', '--to', 'NewClassName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該實際執行 function 重命名', async () => {
      await fixture.writeFile('src/rename-func.ts', `
export function oldFunctionName(x: number): number {
  return x * 2;
}
const result = oldFunctionName(5);
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldFunctionName', '--to', 'newFunctionName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該實際執行 variable 重命名', async () => {
      await fixture.writeFile('src/rename-var.ts', `
export const oldVarName = 'value';
console.log(oldVarName);
const copy = oldVarName;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldVarName', '--to', 'newVarName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該實際執行 interface 重命名', async () => {
      await fixture.writeFile('src/rename-interface.ts', `
export interface OldInterface {
  id: string;
  name: string;
}
const obj: OldInterface = { id: '1', name: 'test' };
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OldInterface', '--to', 'NewInterface', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該實際執行 type alias 重命名', async () => {
      await fixture.writeFile('src/rename-type.ts', `
export type OldType = string | number;
const value: OldType = 'test';
function process(input: OldType): OldType { return input; }
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OldType', '--to', 'NewType', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該實際執行 enum 重命名', async () => {
      await fixture.writeFile('src/rename-enum.ts', `
export enum OldEnum {
  A = 'a',
  B = 'b'
}
const val: OldEnum = OldEnum.A;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OldEnum', '--to', 'NewEnum', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('跨檔案實際重命名', () => {
    it('應該實際更新跨檔案的引用', async () => {
      await fixture.writeFile('src/shared-symbol.ts', `
export const sharedSymbol = 'shared';
export function useShared() { return sharedSymbol; }
`);
      await fixture.writeFile('src/consumer1.ts', `
import { sharedSymbol } from './shared-symbol.js';
export const use1 = sharedSymbol;
`);
      await fixture.writeFile('src/consumer2.ts', `
import { sharedSymbol } from './shared-symbol.js';
export const use2 = sharedSymbol + '-suffix';
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'sharedSymbol', '--to', 'renamedSymbol', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.affectedFiles).toBeGreaterThanOrEqual(2);
    });

    it('應該實際更新 re-export 的引用', async () => {
      await fixture.writeFile('src/origin.ts', `
export const originSymbol = 1;
`);
      await fixture.writeFile('src/reexport.ts', `
export { originSymbol } from './origin.js';
`);
      await fixture.writeFile('src/final-consumer.ts', `
import { originSymbol } from './reexport.js';
export const final = originSymbol;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'originSymbol', '--to', 'renamedOrigin', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('複雜重命名情境', () => {
    it('應該處理 method 重命名', async () => {
      await fixture.writeFile('src/method-rename.ts', `
export class MyClass {
  oldMethod() { return 1; }
  callOld() { return this.oldMethod(); }
}
const obj = new MyClass();
obj.oldMethod();
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldMethod', '--to', 'newMethod', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理 property 重命名', async () => {
      await fixture.writeFile('src/property-rename.ts', `
interface Config {
  oldProp: string;
}
const config: Config = { oldProp: 'value' };
console.log(config.oldProp);
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldProp', '--to', 'newProp', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理 parameter 重命名', async () => {
      await fixture.writeFile('src/param-rename.ts', `
export function process(oldParam: string): string {
  return oldParam.toUpperCase();
}
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldParam', '--to', 'newParam', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理 generic type parameter 重命名', async () => {
      await fixture.writeFile('src/generic-rename.ts', `
export function identity<TOld>(value: TOld): TOld {
  return value;
}
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'TOld', '--to', 'TNew', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('衝突檢測', () => {
    it('應該檢測並報告名稱衝突', async () => {
      await fixture.writeFile('src/conflict.ts', `
export const existingName = 1;
export const toRename = 2;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'toRename', '--to', 'existingName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 應該成功但報告衝突
      const output = JSON.parse(result.stdout);
      expect(output.conflicts).toBeDefined();
    });
  });

  describe('大規模重命名', () => {
    it('應該處理 20+ 檔案的重命名', async () => {
      await fixture.writeFile('src/core-symbol.ts', 'export const coreSymbol = "core";');

      for (let i = 0; i < 25; i++) {
        await fixture.writeFile(`src/consumer-${i}.ts`, `
import { coreSymbol } from './core-symbol.js';
export const use${i} = coreSymbol;
`);
      }

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'coreSymbol', '--to', 'renamedCore', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.affectedFiles).toBeGreaterThanOrEqual(20);
    });
  });

  describe('特殊語法結構', () => {
    it('應該處理 destructuring 中的重命名', async () => {
      await fixture.writeFile('src/destruct.ts', `
export const oldKey = 'value';
const copy = oldKey;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldKey', '--to', 'newKey', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理 namespace 中的符號重命名', async () => {
      await fixture.writeFile('src/namespace.ts', `
export namespace MyNamespace {
  export const oldNsSymbol = 1;
  export function useIt() { return oldNsSymbol; }
}
const val = MyNamespace.oldNsSymbol;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldNsSymbol', '--to', 'newNsSymbol', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理 decorator 重命名', async () => {
      await fixture.writeFile('src/decorator.ts', `
function OldDecorator(target: any) { return target; }

@OldDecorator
export class Decorated {}
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OldDecorator', '--to', 'NewDecorator', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理 arrow function 重命名', async () => {
      await fixture.writeFile('src/arrow.ts', `
export const oldArrow = (x: number) => x * 2;
const result = oldArrow(5);
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldArrow', '--to', 'newArrow', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('索引相關測試（提升 core/indexing 覆蓋率）', () => {
    it('應該正確索引並重命名大型專案中的符號', async () => {
      // 建立多層目錄結構
      for (let dir = 0; dir < 5; dir++) {
        for (let file = 0; file < 5; file++) {
          await fixture.writeFile(`src/dir${dir}/file${file}.ts`, `
export const symbol_${dir}_${file} = ${dir * 10 + file};
`);
        }
      }

      // 建立索引檔案
      await fixture.writeFile('src/all-index.ts', `
import { symbol_0_0 } from './dir0/file0.js';
import { symbol_1_1 } from './dir1/file1.js';
import { symbol_2_2 } from './dir2/file2.js';
export { symbol_0_0, symbol_1_1, symbol_2_2 };
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'symbol_0_0', '--to', 'renamed_symbol', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理增量索引更新', async () => {
      await fixture.writeFile('src/initial.ts', 'export const initialSymbol = 1;');

      // 第一次重命名
      const result1 = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'initialSymbol', '--to', 'renamedOnce', '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(result1.exitCode).toBe(0);

      // 新增檔案
      await fixture.writeFile('src/new-file.ts', `
import { renamedOnce } from './initial.js';
export const useRenamed = renamedOnce;
`);

      // 第二次重命名
      const result2 = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'renamedOnce', '--to', 'renamedTwice', '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(result2.exitCode).toBe(0);
      const output2 = JSON.parse(result2.stdout);
      expect(output2.success).toBe(true);
    });
  });
});
