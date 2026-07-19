/**
 * CLI change-signature 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * T1：class 方法呼叫點被整批丟棄
 *     change-signature-engine.ts:175-177 `callSites = allCallSites.filter(cs => !cs.isMethodCall)`
 *     ——findCallSites 有掃到 `obj.method(...)`（isMethodCall:true）但被整批丟棄，
 *     定義照改、success:true，呼叫點停留在舊引數順序。
 * T2：建構子 `new` 呼叫點從未被掃描
 *     call-site-parser.ts 只認 CallExpression，NewExpression 整條不存在；
 *     constructor 定義經 regex fallback 被改寫，`new X(...)` 呼叫點不動。
 * T3：overload 簽章群只改第一個簽章
 *     declaration-analyzer.ts findFunctionNode 前序走訪名稱比對，命中第一個
 *     overload 簽章（無 body）即回傳，第二簽章與實作不會一起被改。
 * T4：建構子 alias／namespace import 呼叫點被靜默漏改
 *     change-signature-engine.ts 的 constructor 呼叫點過濾只保留「本地名 === 原始類別名」
 *     的檔案，且只用原始類別名掃描：`import { User as Account } from './user'; new Account(1)`
 *     的 alias 檔案整檔被排除在掃描之外（呼叫點漏改，success:true 但呼叫端引數順序沒跟著換）；
 *     `import * as ns from './user'; new ns.User(1)` 的 namespace 檔案同樣被排除，導致既有的
 *     「限定式建構子呼叫點」拒絕邏輯永遠不會被觸發（該檔案從未進入掃描範圍）。
 *
 * 每筆採「雙可接受」斷言：成功（exit 0）⇒ 呼叫端/其餘宣告必須同步更新；
 * 否則須明確拒絕（exit 非 0 且整檔不變）。目前行為是「成功＋定義改了＋呼叫端/
 * 其餘宣告沒動」，兩者皆不成立 → 紅。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI change-signature - 缺陷 regression（T1-T3）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('T1：class 方法 --reorder 應同步更新方法呼叫點，否則須整檔拒絕', async () => {
    const testFile = `${fixture.rootPath}/t1-class-method-callsite.ts`;
    const original = `class CalcT1 {
  addT1(a: number, b: number) {
    return a - b;
  }
}

const c = new CalcT1();
c.addT1(1, 2);
`;
    await fixture.memfs.writeFile(testFile, original);

    const result = await executeCLI(
      ['change-signature', testFile, 'addT1', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;

    if (result.exitCode === 0) {
      // 成功則定義與呼叫點必須同步：定義變 (b, a)，呼叫點引數順序也要跟著換
      expect(updated).toMatch(/addT1\s*\(\s*b\s*:\s*number\s*,\s*a\s*:\s*number\s*\)/);
      expect(updated).toContain('c.addT1(2, 1);');
    } else {
      // 不支援就必須明確拒絕，整檔不得變動（不可靜默只改定義漏改呼叫點）
      expect(updated).toBe(original);
    }
  });

  it('T2：constructor --reorder 應同步更新 new 呼叫點，否則須整檔拒絕', async () => {
    const testFile = `${fixture.rootPath}/t2-constructor-callsite.ts`;
    const original = `class WidgetT2 {
  constructor(a: number, b: string) {}
}

new WidgetT2(1, 'x');
`;
    await fixture.memfs.writeFile(testFile, original);

    const result = await executeCLI(
      ['change-signature', testFile, 'constructor', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;

    if (result.exitCode === 0) {
      expect(updated).toMatch(/constructor\s*\(\s*b\s*:\s*string\s*,\s*a\s*:\s*number\s*\)/);
      expect(updated).toContain('new WidgetT2(\'x\', 1);');
    } else {
      expect(updated).toBe(original);
    }
  });

  it('T3：overload 簽章群 --add 應同步更新全部宣告，否則須整檔拒絕', async () => {
    const testFile = `${fixture.rootPath}/t3-overload-signatures.ts`;
    const original = `export function fmtT3(v: number): string;
export function fmtT3(v: string): string;
export function fmtT3(v: number | string): string { return String(v); }
`;
    await fixture.memfs.writeFile(testFile, original);

    const result = await executeCLI(
      ['change-signature', testFile, 'fmtT3', '-p', fixture.rootPath, '--add', 'opts:boolean=false', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;

    if (result.exitCode === 0) {
      // 成功則三個宣告（兩個 overload 簽章＋一個實作）都必須一致地帶上新參數
      const occurrences = updated.match(/opts\s*:\s*boolean\s*=\s*false/g) ?? [];
      expect(occurrences.length).toBe(3);
    } else {
      expect(updated).toBe(original);
    }
  });

  it('T4a：建構子 --reorder 應同步更新 alias import 呼叫點，否則須整檔拒絕', async () => {
    const defFile = `${fixture.rootPath}/t4a-user-def.ts`;
    const callerFile = `${fixture.rootPath}/t4a-user-caller.ts`;
    const originalDef = `export class UserT4a {
  constructor(id: number, name: string) {}
}
`;
    const originalCaller = `import { UserT4a as AccountT4a } from './t4a-user-def';

new AccountT4a(1, 'alice');
`;
    await fixture.memfs.writeFile(defFile, originalDef);
    await fixture.memfs.writeFile(callerFile, originalCaller);

    const result = await executeCLI(
      ['change-signature', defFile, 'constructor', '-p', fixture.rootPath, '--reorder', 'name,id', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    const updatedDef = await fixture.memfs.readFile(defFile, 'utf-8') as string;
    const updatedCaller = await fixture.memfs.readFile(callerFile, 'utf-8') as string;

    if (result.exitCode === 0) {
      // 成功則 alias 呼叫點必須同步：定義變 (name, id)，呼叫點引數順序也要跟著換
      expect(updatedDef).toMatch(/constructor\s*\(\s*name\s*:\s*string\s*,\s*id\s*:\s*number\s*\)/);
      expect(updatedCaller).toContain('new AccountT4a(\'alice\', 1);');
    } else {
      // 不支援就必須明確拒絕，兩檔都不得變動（不可只改定義漏改 alias 呼叫點）
      expect(updatedDef).toBe(originalDef);
      expect(updatedCaller).toBe(originalCaller);
    }
  });

  it('T4a2：建構子 --add 應同步為 alias import 呼叫點補上新引數，否則須整檔拒絕', async () => {
    const defFile = `${fixture.rootPath}/t4a2-user-def.ts`;
    const callerFile = `${fixture.rootPath}/t4a2-user-caller.ts`;
    const originalDef = `export class UserT4a2 {
  constructor(id: number) {}
}
`;
    const originalCaller = `import { UserT4a2 as AccountT4a2 } from './t4a2-user-def';

new AccountT4a2(1);
`;
    await fixture.memfs.writeFile(defFile, originalDef);
    await fixture.memfs.writeFile(callerFile, originalCaller);

    const result = await executeCLI(
      ['change-signature', defFile, 'constructor', '-p', fixture.rootPath, '--add', 'active:boolean=true', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    const updatedDef = await fixture.memfs.readFile(defFile, 'utf-8') as string;
    const updatedCaller = await fixture.memfs.readFile(callerFile, 'utf-8') as string;

    if (result.exitCode === 0) {
      expect(updatedDef).toMatch(/constructor\s*\(\s*id\s*:\s*number\s*,\s*active\s*:\s*boolean\s*=\s*true\s*\)/);
      expect(updatedCaller).toContain('new AccountT4a2(1, true);');
    } else {
      expect(updatedDef).toBe(originalDef);
      expect(updatedCaller).toBe(originalCaller);
    }
  });

  it('T4b：建構子 --reorder 遇 namespace import 呼叫點須整檔拒絕，不得靜默漏改', async () => {
    const defFile = `${fixture.rootPath}/t4b-user-def.ts`;
    const callerFile = `${fixture.rootPath}/t4b-user-caller.ts`;
    const originalDef = `export class UserT4b {
  constructor(id: number, name: string) {}
}
`;
    const originalCaller = `import * as nsT4b from './t4b-user-def';

new nsT4b.UserT4b(1, 'alice');
`;
    await fixture.memfs.writeFile(defFile, originalDef);
    await fixture.memfs.writeFile(callerFile, originalCaller);

    const result = await executeCLI(
      ['change-signature', defFile, 'constructor', '-p', fixture.rootPath, '--reorder', 'name,id', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    const updatedDef = await fixture.memfs.readFile(defFile, 'utf-8') as string;
    const updatedCaller = await fixture.memfs.readFile(callerFile, 'utf-8') as string;

    // namespace 限定式建構子呼叫點（`new ns.Class(...)`）無型別解析基礎設施安全重寫，
    // 必須整檔拒絕，兩檔都不得變動——絕不可 success:true 但定義改了、namespace 呼叫點沒動。
    expect(result.exitCode).not.toBe(0);
    expect(updatedDef).toBe(originalDef);
    expect(updatedCaller).toBe(originalCaller);
  });
});
