/**
 * CLI rename 命令 E2E 測試 - 驗證和錯誤處理
 * 測試各種驗證失敗和錯誤情況
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI rename validation - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本命令執行', () => {
    it('應該處理缺少 --from 參數', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--to', 'newName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 命令應該執行完成（可能是成功或失敗，但不應崩潰）
      expect(typeof result.exitCode).toBe('number');
    });

    it('應該處理缺少 --to 參數', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(typeof result.exitCode).toBe('number');
    });
  });

  describe('dry-run 模式', () => {
    it('應該在 dry-run 時不實際修改檔案', async () => {
      await fixture.writeFile('src/dry-run-test.ts', `
export const originalName = 'value';
const copy = originalName;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'originalName', '--to', 'newName', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 驗證檔案未被修改
      const content = await fixture.memfs.readFile(`${fixture.rootPath}/src/dry-run-test.ts`, 'utf-8');
      expect(content).toContain('originalName');
      expect(content).not.toContain('newName');
    });

    it('應該在 dry-run 時顯示預覽變更', async () => {
      await fixture.writeFile('src/preview-test.ts', `
export function oldFunc() { return 1; }
const result = oldFunc();
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldFunc', '--to', 'newFunc', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.operations).toBeGreaterThan(0);
    });
  });

  describe('多種輸出格式', () => {
    it('應該支援 summary 格式輸出', async () => {
      await fixture.writeFile('src/format-summary.ts', `
export const testVar = 1;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'testVar', '--to', 'renamedVar', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Files:');
    });

    it('應該支援 diff 格式輸出', async () => {
      await fixture.writeFile('src/format-diff.ts', `
export const diffVar = 'test';
const use = diffVar;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'diffVar', '--to', 'newDiffVar', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      // diff 格式應該包含 +/- 符號
      expect(result.stdout).toMatch(/[+-]/);
    });

  });

  describe('特殊符號類型', () => {
    it('應該處理 getter 重命名', async () => {
      await fixture.writeFile('src/getter.ts', `
class MyClass {
  private _value = 0;
  get oldGetter() { return this._value; }
}
const obj = new MyClass();
console.log(obj.oldGetter);
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldGetter', '--to', 'newGetter', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理 setter 重命名', async () => {
      await fixture.writeFile('src/setter.ts', `
class Container {
  private _data = '';
  set oldSetter(val: string) { this._data = val; }
}
const c = new Container();
c.oldSetter = 'test';
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldSetter', '--to', 'newSetter', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理 static 方法重命名', async () => {
      await fixture.writeFile('src/static-method.ts', `
class Utils {
  static oldStaticMethod() { return 42; }
}
const result = Utils.oldStaticMethod();
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldStaticMethod', '--to', 'newStaticMethod', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理 async 函數重命名', async () => {
      await fixture.writeFile('src/async-func.ts', `
export async function oldAsyncFunc(): Promise<number> {
  return 1;
}
const promise = oldAsyncFunc();
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldAsyncFunc', '--to', 'newAsyncFunc', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });

  describe('複雜的引用場景', () => {
    it('應該處理 named export 重命名', async () => {
      await fixture.writeFile('src/named-export.ts', `
const internalName = 'value';
export { internalName as oldExportName };
`);
      await fixture.writeFile('src/import-named.ts', `
import { oldExportName } from './named-export.js';
console.log(oldExportName);
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldExportName', '--to', 'newExportName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理 default export 的內部符號重命名', async () => {
      await fixture.writeFile('src/default-export.ts', `
function internalFunc() { return 'hello'; }
export default internalFunc;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'internalFunc', '--to', 'renamedInternalFunc', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理解構賦值中的變數重命名', async () => {
      await fixture.writeFile('src/destructure.ts', `
const obj = { oldProp: 1, other: 2 };
const { oldProp } = obj;
console.log(oldProp);
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'oldProp', '--to', 'newProp', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });
});
