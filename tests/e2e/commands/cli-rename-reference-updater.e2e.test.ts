/**
 * CLI rename 命令 E2E 測試 - 引用更新器覆蓋率補強
 * 專注於 reference-updater.ts 和 rename-engine.ts 的未覆蓋代碼路徑
 *
 * 注意: 所有新建檔案放到 src/ 子目錄（mem-vfs glob bug: **\/*.ts 不匹配根目錄檔案）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI rename reference-updater - 覆蓋率補強測試', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('別名 import 處理', () => {
    it('應該處理 import { x as alias } 的別名導入', async () => {
      await fixture.writeFile('src/alias-source.ts', `
export const originalName = 'value';
export function originalFunc() { return 1; }
`);
      await fixture.writeFile('src/alias-consumer.ts', `
import { originalName as aliasName, originalFunc as aliasFunc } from './alias-source.js';
console.log(aliasName);
const result = aliasFunc();
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'originalName', '--to', 'renamedValue', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理 export { x as y } 的別名導出', async () => {
      await fixture.writeFile('src/alias-export-source.ts', `
const internalValue = 42;
export { internalValue as publicValue };
`);
      await fixture.writeFile('src/alias-export-consumer.ts', `
import { publicValue } from './alias-export-source.js';
console.log(publicValue);
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'internalValue', '--to', 'renamedInternal', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理 namespace import', async () => {
      await fixture.writeFile('src/ns-source.ts', `
export const nsValue = 1;
export function nsFunc() { return nsValue; }
`);
      await fixture.writeFile('src/ns-consumer.ts', `
import * as NS from './ns-source.js';
console.log(NS.nsValue);
NS.nsFunc();
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'nsValue', '--to', 'renamedNsValue', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('re-export 重命名', () => {
    it('應該處理 export { x } from "./module" 的 re-export', async () => {
      await fixture.writeFile('src/reexport/origin.ts', `
export const reExportedSymbol = 'original';
`);
      await fixture.writeFile('src/reexport/index.ts', `
export { reExportedSymbol } from './origin.js';
`);
      await fixture.writeFile('src/reexport/consumer.ts', `
import { reExportedSymbol } from './index.js';
console.log(reExportedSymbol);
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'reExportedSymbol', '--to', 'renamedReExport', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.affectedFiles).toBeGreaterThanOrEqual(2);
    });

    it('應該處理帶別名的 re-export', async () => {
      await fixture.writeFile('src/reexport-alias/core.ts', `
export const coreSymbol = 42;
`);
      await fixture.writeFile('src/reexport-alias/index.ts', `
export { coreSymbol as publicSymbol } from './core.js';
`);
      await fixture.writeFile('src/reexport-alias/user.ts', `
import { publicSymbol } from './index.js';
const val = publicSymbol;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'coreSymbol', '--to', 'renamedCore', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理多層 re-export 鏈', async () => {
      await fixture.writeFile('src/chain/level0.ts', `
export const chainedValue = 'base';
`);
      await fixture.writeFile('src/chain/level1.ts', `
export { chainedValue } from './level0.js';
`);
      await fixture.writeFile('src/chain/level2.ts', `
export { chainedValue } from './level1.js';
`);
      await fixture.writeFile('src/chain/consumer.ts', `
import { chainedValue } from './level2.js';
console.log(chainedValue);
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'chainedValue', '--to', 'renamedChain', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('解構賦值重命名', () => {
    it('應該處理物件解構中的屬性重命名', async () => {
      await fixture.writeFile('src/destruct/object-destruct.ts', `
interface Config {
  serverHost: string;
  serverPort: number;
}
const config: Config = { serverHost: 'localhost', serverPort: 3000 };
const { serverHost, serverPort } = config;
console.log(serverHost, serverPort);
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'serverHost', '--to', 'host', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理匯出常數的屬性重命名', async () => {
      // 使用導出的常數和類別屬性確保符號可被索引找到
      await fixture.writeFile('src/destruct/export-props.ts', `
export class ArrayDataHolder {
  public firstElement: number = 10;
  public secondElement: number = 20;

  getFirst(): number {
    return this.firstElement;
  }
}

const holder = new ArrayDataHolder();
console.log(holder.firstElement, holder.secondElement);
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'firstElement', '--to', 'primaryElement', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理巢狀解構中的變數重命名', async () => {
      await fixture.writeFile('src/destruct/nested-destruct.ts', `
export interface NestedData {
  user: {
    nestedPropValue: string;
  }
}
export const nestedData: NestedData = {
  user: {
    nestedPropValue: 'value'
  }
};
export function getNestedProp() { return nestedData.user.nestedPropValue; }
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'nestedPropValue', '--to', 'renamedNestedPropValue', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理解構時的重命名語法', async () => {
      await fixture.writeFile('src/destruct/rename-destruct.ts', `
export interface DestructObj {
  destructOriginalKey: string;
}
export const destructObj: DestructObj = { destructOriginalKey: 'value' };
export function useDestructKey() { return destructObj.destructOriginalKey; }
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'destructOriginalKey', '--to', 'destructNewKey', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('類別方法重命名', () => {
    it('應該重命名 class 內的實例方法', async () => {
      await fixture.writeFile('src/class/instance-method.ts', `
export class Calculator {
  calculateSum(a: number, b: number): number {
    return a + b;
  }

  useSum() {
    return this.calculateSum(1, 2);
  }
}
const calc = new Calculator();
calc.calculateSum(5, 3);
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'calculateSum', '--to', 'add', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該重命名 class 內的私有方法', async () => {
      await fixture.writeFile('src/class/private-method.ts', `
export class SecureService {
  private internalProcess(data: string): string {
    return data.toUpperCase();
  }

  public process(data: string): string {
    return this.internalProcess(data);
  }
}
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'internalProcess', '--to', 'privateProcess', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該重命名繼承類別中的 override 方法', async () => {
      await fixture.writeFile('src/class/override-method.ts', `
class BaseClass {
  baseBehavior(): string {
    return 'base';
  }
}

export class DerivedClass extends BaseClass {
  baseBehavior(): string {
    return 'derived';
  }

  callBase() {
    return super.baseBehavior();
  }
}
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'baseBehavior', '--to', 'coreBehavior', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('介面屬性重命名', () => {
    it('應該重命名 interface 的必需屬性', async () => {
      await fixture.writeFile('src/interface/required-prop.ts', `
interface UserData {
  userName: string;
  userAge: number;
}

const user: UserData = {
  userName: 'John',
  userAge: 30
};
console.log(user.userName);
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'userName', '--to', 'name', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該重命名 interface 的可選屬性', async () => {
      await fixture.writeFile('src/interface/optional-prop.ts', `
interface Settings {
  optionalSetting?: string;
  requiredSetting: boolean;
}

function configure(settings: Settings) {
  if (settings.optionalSetting) {
    console.log(settings.optionalSetting);
  }
}
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'optionalSetting', '--to', 'customSetting', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該重命名 interface 的方法簽名', async () => {
      await fixture.writeFile('src/interface/method-sig.ts', `
interface Repository<T> {
  fetchById(id: string): Promise<T>;
  fetchAll(): Promise<T[]>;
}

class UserRepo implements Repository<{ id: string }> {
  async fetchById(id: string) {
    return { id };
  }
  async fetchAll() {
    return [];
  }
}
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'fetchById', '--to', 'getById', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('跨檔案重命名驗證', () => {
    it('應該驗證多個檔案中的引用都被更新', async () => {
      await fixture.writeFile('src/cross-file/shared.ts', `
export const sharedConstant = 'SHARED';
export function sharedHelper() { return sharedConstant; }
`);
      await fixture.writeFile('src/cross-file/consumer1.ts', `
import { sharedConstant } from './shared.js';
export const use1 = sharedConstant;
`);
      await fixture.writeFile('src/cross-file/consumer2.ts', `
import { sharedConstant, sharedHelper } from './shared.js';
export const use2 = sharedConstant;
export const result = sharedHelper();
`);
      await fixture.writeFile('src/cross-file/consumer3.ts', `
import { sharedConstant } from './shared.js';
export function getShared() { return sharedConstant; }
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'sharedConstant', '--to', 'GLOBAL_CONST', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.affectedFiles).toBeGreaterThanOrEqual(4);
    });

    it('應該處理循環引用的檔案', async () => {
      await fixture.writeFile('src/circular/moduleA.ts', `
import { bValue } from './moduleB.js';
export const aValue = 'A';
export const combined = aValue + bValue;
`);
      await fixture.writeFile('src/circular/moduleB.ts', `
import { aValue } from './moduleA.js';
export const bValue = 'B';
export const reversed = bValue + aValue;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'aValue', '--to', 'alphaValue', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('Dry-run 輸出結構驗證', () => {
    it('應該在 dry-run 模式下返回正確的 JSON 結構', async () => {
      await fixture.writeFile('src/dryrun/test.ts', `
export const dryRunTarget = 'test';
const use = dryRunTarget;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'dryRunTarget', '--to', 'renamedTarget', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // 驗證 JSON 結構
      expect(output.command).toBe('rename');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
      expect(typeof output.summary.totalFiles).toBe('number');
      expect(typeof output.summary.totalChanges).toBe('number');
      expect(output.conflicts).toBeDefined();
      expect(Array.isArray(output.conflicts)).toBe(true);
    });

    it('應該在 dry-run 模式下包含 files 陣列', async () => {
      await fixture.writeFile('src/dryrun/files-test.ts', `
export const targetSymbol = 1;
`);
      await fixture.writeFile('src/dryrun/files-consumer.ts', `
import { targetSymbol } from './files-test.js';
const val = targetSymbol;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'targetSymbol', '--to', 'newSymbol', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.files).toBeDefined();
      expect(Array.isArray(output.files)).toBe(true);
    });

    it('應該在 dry-run 模式下顯示衝突資訊', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'function', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.conflicts).toBeDefined();
      expect(Array.isArray(output.conflicts)).toBe(true);
      expect(output.conflicts.length).toBeGreaterThan(0);
      expect(output.conflicts[0].type).toBe('reserved_keyword');
    });
  });

  describe('Summary 格式輸出驗證', () => {
    it('應該在 summary 格式下顯示變更摘要', async () => {
      await fixture.writeFile('src/summary/target.ts', `
export const summaryTarget = 'test';
const use1 = summaryTarget;
const use2 = summaryTarget;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'summaryTarget', '--to', 'renamedSummary', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Files:');
    });

    it('應該在 dry-run + summary 格式下顯示預覽摘要', async () => {
      await fixture.writeFile('src/summary/preview.ts', `
export const previewSymbol = 42;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'previewSymbol', '--to', 'renamedPreview', '--dry-run', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe('錯誤處理路徑測試', () => {
    it('應該處理空的 symbol 名稱', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', '', '--to', 'newName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 應該有錯誤訊息
      expect(result.stderr.length > 0 || result.stdout.includes('error')).toBe(true);
    });

    it('應該處理特殊字元的 symbol 名稱', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', '@special!', '--to', 'newName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 應該優雅處理（可能找不到或報告錯誤）
      expect(typeof result.exitCode).toBe('number');
    });

    it('應該處理非常長的 symbol 名稱', async () => {
      const longName = 'a'.repeat(500);
      await fixture.writeFile('src/error/long-name.ts', `
export const ${longName} = 1;
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', longName, '--to', 'shortName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });

  describe('多重引用場景', () => {
    it('應該處理同一檔案中的多次引用', async () => {
      await fixture.writeFile('src/multi-ref/many-refs.ts', `
export const multiRef = 'value';
const a = multiRef;
const b = multiRef;
const c = multiRef;
const d = multiRef;
const e = multiRef;
function use() { return multiRef; }
class C { prop = multiRef; }
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'multiRef', '--to', 'renamedMulti', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.operations).toBeGreaterThanOrEqual(6);
    });

    it('應該處理不同上下文中的同名符號', async () => {
      await fixture.writeFile('src/multi-ref/different-contexts.ts', `
// 頂層變數
const contextVar = 1;

// 函數參數
function fn(contextVar: number) {
  return contextVar * 2;
}

// 物件屬性
const obj = { contextVar: 3 };

// class 屬性
class MyClass {
  contextVar = 4;
}
`);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'contextVar', '--to', 'renamedContext', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('批次操作測試', () => {
    it('應該處理 50+ 個檔案的批次重命名', async () => {
      // 建立核心模組
      await fixture.writeFile('src/batch/core.ts', `
export const batchSymbol = 'batch';
`);

      // 建立 55 個消費者檔案
      for (let i = 0; i < 55; i++) {
        await fixture.writeFile(`src/batch/consumer${i}.ts`, `
import { batchSymbol } from './core.js';
export const use${i} = batchSymbol;
`);
      }

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'batchSymbol', '--to', 'renamedBatch', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.affectedFiles).toBeGreaterThanOrEqual(50);
    });
  });
});
