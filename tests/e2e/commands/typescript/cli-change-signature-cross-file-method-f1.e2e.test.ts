/**
 * CLI change-signature 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * F1：class method 跨檔呼叫點靜默漏改
 *
 * change-signature-engine.ts 對「方法目標」的呼叫點掃描範圍計算，searchName
 * 用的是 options.functionName（如 'sub'），再透過 bindingResolver.resolveTargetBindings
 * 找出各檔對 searchName 的本地繫結。但跨檔消費端 import 的是「類別名」（如
 * `import { Calc } from './a'`），從未 import 過 'sub' 這個識別字，故該檔不會
 * 出現在 relevantFiles（binding.localNames.has('sub') 恆假），methodCallSites
 * 掃描範圍完全排除消費端檔案——methodCallSites.length === 0，不會觸發 T1 的
 * 「偵測到方法呼叫點即拒絕」保護，命令直接成功、只改了定義，消費端的
 * `new Calc().sub(10, 3)` 停在舊引數順序，success:true 但呼叫端與定義不一致。
 *
 * 對照：同檔案內的方法呼叫點（見 cli-change-signature-defects-t1-t3.e2e.test.ts
 * T1）因為呼叫點與定義同檔，targetAbsolute 那個分支會把該檔納入 relevantFiles，
 * 故 T1 能被正確攔下；本測試專打「呼叫點在另一個檔案」這個掃描範圍算漏的情境。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI change-signature 缺陷 F1：class method 跨檔呼叫點', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[F1] --reorder 對跨檔 class method 呼叫點應同步更新，否則須整檔拒絕（不可只改定義漏改呼叫端）', async () => {
    const defFile = `${fixture.rootPath}/regression-f1a-def.ts`;
    const callerFile = `${fixture.rootPath}/regression-f1a-caller.ts`;

    const originalDef = `export class CalcF1a {
  sub(a: number, b: number) {
    return a - b;
  }
}
`;
    const originalCaller = `import { CalcF1a } from './regression-f1a-def';

export const r = new CalcF1a().sub(10, 3);

function useF1a(c: CalcF1a) {
  return c.sub(1, 2);
}
`;
    await fixture.memfs.writeFile(defFile, originalDef);
    await fixture.memfs.writeFile(callerFile, originalCaller);

    const result = await executeCLI(
      ['change-signature', '--file', defFile, '--function', 'sub', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    const updatedDef = await fixture.memfs.readFile(defFile, 'utf-8') as string;
    const updatedCaller = await fixture.memfs.readFile(callerFile, 'utf-8') as string;

    if (result.exitCode === 0) {
      // 成功則跨檔呼叫點必須同步：定義變 (b, a)，兩處呼叫點引數順序也要跟著換
      expect(updatedDef).toMatch(/sub\s*\(\s*b\s*:\s*number\s*,\s*a\s*:\s*number\s*\)/);
      expect(updatedCaller).toContain('new CalcF1a().sub(3, 10);');
      expect(updatedCaller).toContain('c.sub(2, 1);');
    } else {
      // 不支援就必須明確拒絕，兩檔皆不得變動（不可靜默只改定義漏改跨檔呼叫端）
      expect(updatedDef).toBe(originalDef);
      expect(updatedCaller).toBe(originalCaller);
    }
  });

  it('[F1] --add 搭配 --call-site-value 對跨檔 class method 呼叫點必須強制改寫為明確值，否則須整檔拒絕', async () => {
    // --call-site-value 明確指定呼叫點要填入的值（非 default 的隱含省略），
    // 與「尾端 add 帶預設值、呼叫點可以不動仍語意正確」不同——這裡呼叫點若不
    // 被重寫成 `.sub(10, 3, 99)`，就是定義多了必要引數個數但呼叫端仍是 2 引數，
    // 兩者不一致（且該值是 explicit override，不能悄悄退回用 default 蓋過去）。
    const defFile = `${fixture.rootPath}/regression-f1b-def.ts`;
    const callerFile = `${fixture.rootPath}/regression-f1b-caller.ts`;

    const originalDef = `export class CalcF1b {
  sub(a: number, b: number) {
    return a - b;
  }
}
`;
    const originalCaller = `import { CalcF1b } from './regression-f1b-def';

export const r = new CalcF1b().sub(10, 3);
`;
    await fixture.memfs.writeFile(defFile, originalDef);
    await fixture.memfs.writeFile(callerFile, originalCaller);

    const result = await executeCLI(
      [
        'change-signature', '--file', defFile, '--function', 'sub', '-p', fixture.rootPath,
        '--add', 'c:number=0',
        '--call-site-value', 'c=99',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    const updatedDef = await fixture.memfs.readFile(defFile, 'utf-8') as string;
    const updatedCaller = await fixture.memfs.readFile(callerFile, 'utf-8') as string;

    if (result.exitCode === 0) {
      expect(updatedDef).toMatch(/sub\s*\(\s*a\s*:\s*number\s*,\s*b\s*:\s*number\s*,\s*c\s*:\s*number\s*=\s*0\s*\)/);
      expect(updatedCaller).toContain('new CalcF1b().sub(10, 3, 99);');
    } else {
      expect(updatedDef).toBe(originalDef);
      expect(updatedCaller).toBe(originalCaller);
    }
  });

  it('[F1] 跨檔 class method 尾端 --add 帶預設值時呼叫點維持原樣即為正確（防過度 fast-fail 回歸）', async () => {
    // 對照案例：尾端新增帶預設值參數時，未更新的呼叫點在語意上仍正確
    // （TS 呼叫端省略尾端有預設值的參數本就合法），不應被要求呼叫點跟著改，
    // 也不可被本工具過度保守地整檔拒絕——見 tests/cli/cli-commands.cli.test.ts
    // 對跨檔 method（user-service.ts createUser，被 user-handler.ts／
    // user-controller.ts 呼叫）用 `--add "options:object={}@2"` 的既有驗收行為。
    const defFile = `${fixture.rootPath}/regression-f1c-def.ts`;
    const callerFile = `${fixture.rootPath}/regression-f1c-caller.ts`;

    const originalDef = `export class CalcF1c {
  sub(a: number, b: number) {
    return a - b;
  }
}
`;
    const originalCaller = `import { CalcF1c } from './regression-f1c-def';

export const r = new CalcF1c().sub(10, 3);
`;
    await fixture.memfs.writeFile(defFile, originalDef);
    await fixture.memfs.writeFile(callerFile, originalCaller);

    const result = await executeCLI(
      ['change-signature', '--file', defFile, '--function', 'sub', '-p', fixture.rootPath, '--add', 'c:number=0', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const updatedDef = await fixture.memfs.readFile(defFile, 'utf-8') as string;
    const updatedCaller = await fixture.memfs.readFile(callerFile, 'utf-8') as string;

    expect(updatedDef).toMatch(/sub\s*\(\s*a\s*:\s*number\s*,\s*b\s*:\s*number\s*,\s*c\s*:\s*number\s*=\s*0\s*\)/);
    expect(updatedCaller).toBe(originalCaller);
  });

  it('[F1] 引用 owner 的檔案內另有無關 class 的同名方法呼叫時，不應誤擋安全操作', async () => {
    const defFile = `${fixture.rootPath}/regression-f1d-def.ts`;
    const otherFile = `${fixture.rootPath}/regression-f1d-other.ts`;
    const consumerFile = `${fixture.rootPath}/regression-f1d-consumer.ts`;

    const originalDef = `export class SvcF1d {
  m(a: string, b: number) {
    return a + b;
  }
}
`;
    const originalOther = `export class OtherThingF1d {
  m(a: string, b: number, c: string) {
    return a + b + c;
  }
}
`;
    const originalConsumer = `import { SvcF1d } from './regression-f1d-def';
import { OtherThingF1d } from './regression-f1d-other';

const svc = new SvcF1d();
const other = new OtherThingF1d();

export const r1 = svc.m('x', 1);
export const r2 = other.m('unrelated-x', 999, 'y');
`;
    await fixture.memfs.writeFile(defFile, originalDef);
    await fixture.memfs.writeFile(otherFile, originalOther);
    await fixture.memfs.writeFile(consumerFile, originalConsumer);

    const result = await executeCLI(
      ['change-signature', '--file', defFile, '--function', 'm', '-p', fixture.rootPath, '--add', 'c:string="default"', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const updatedDef = await fixture.memfs.readFile(defFile, 'utf-8') as string;
    const updatedConsumer = await fixture.memfs.readFile(consumerFile, 'utf-8') as string;

    expect(updatedDef).toMatch(/m\s*\(\s*a\s*:\s*string\s*,\s*b\s*:\s*number\s*,\s*c\s*:\s*string\s*=\s*"default"\s*\)/);
    expect(updatedConsumer).toBe(originalConsumer);
  });

  it('[F1] 同一 fixture 下 --reorder 對 owner 真呼叫點仍須 fast-fail，不可被無關同名方法掩蓋', async () => {
    const defFile = `${fixture.rootPath}/regression-f1e-def.ts`;
    const otherFile = `${fixture.rootPath}/regression-f1e-other.ts`;
    const consumerFile = `${fixture.rootPath}/regression-f1e-consumer.ts`;

    const originalDef = `export class SvcF1e {
  m(a: string, b: number) {
    return a + b;
  }
}
`;
    const originalOther = `export class OtherThingF1e {
  m(a: string, b: number, c: string) {
    return a + b + c;
  }
}
`;
    const originalConsumer = `import { SvcF1e } from './regression-f1e-def';
import { OtherThingF1e } from './regression-f1e-other';

const svc = new SvcF1e();
const other = new OtherThingF1e();

export const r1 = svc.m('x', 1);
export const r2 = other.m('unrelated-x', 999, 'y');
`;
    await fixture.memfs.writeFile(defFile, originalDef);
    await fixture.memfs.writeFile(otherFile, originalOther);
    await fixture.memfs.writeFile(consumerFile, originalConsumer);

    const result = await executeCLI(
      ['change-signature', '--file', defFile, '--function', 'm', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    // svc.m('x', 1) 是對 SvcF1e.m 的真呼叫點，reorder 會改變引數順序語意，
    // 無 receiver 型別解析無法安全重寫（同 T1），必須 fast-fail 且 def.ts 不變
    expect(result.exitCode).not.toBe(0);
    const updatedDef = await fixture.memfs.readFile(defFile, 'utf-8') as string;
    expect(updatedDef).toBe(originalDef);
  });
});
