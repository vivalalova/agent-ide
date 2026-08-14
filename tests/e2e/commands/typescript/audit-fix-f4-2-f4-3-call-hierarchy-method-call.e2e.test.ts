/**
 * audit-fix F4-2 / F4-3 regression（先紅後綠）
 *
 * F4-2（跨檔 method call 錯配，false positive）：
 * src/core/call-hierarchy/call-hierarchy-analyzer.ts:338-354 對「無明確 import
 * binding」的 method call，只驗證 targetIsMethod（target 定義是不是某個 class
 * method），接著直接落回 `!hasGenuineLocalDefinition(callSiteFile, targetName)`——
 * 完全不檢查呼叫端 receiver 的實際型別是否為 target 所屬的 class。當目標 method
 * 名稱在全專案唯一（不需 --at）、呼叫端檔案本身沒有同名本地宣告時，任何
 * `receiver.methodName()` 都會被判定為 caller，即使 receiver 型別（如 `any`）
 * 明顯與 target 所屬 class 無關。
 *
 * F4-3（同檔非 this. method call 被排除，false negative）：
 * call-hierarchy-analyzer.ts:405-416 對 method call 要求
 * `isTypeScriptThisMethodCallInDefiningClass`——僅接受字面 `this.method()`；
 * 同檔內透過區域變數呼叫（`const svc = new Service(); svc.process()`）語意上
 * 明確是同一個呼叫，卻因為不是 `this.` 而被排除於 incoming 之外。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix F4-2：跨檔 method call 未驗證 receiver 型別導致錯配', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('call-hierarchy incoming 不應把呼叫無關 class（any 型別 receiver）method 的函式算成 target method 的 caller', async () => {
    await fixture.writeFile('src/f42-classA.ts', [
      'export class F42ClassA {',
      '  other(): number {',
      '    return 1;',
      '  }',
      '}'
    ].join('\n'));
    await fixture.writeFile('src/f42-classB.ts', [
      'export class F42ClassB {',
      '  process(): string {',
      '    return \'processed\';',
      '  }',
      '}'
    ].join('\n'));
    await fixture.writeFile('src/f42-caller.ts', [
      'import { F42ClassA } from \'./f42-classA.js\';',
      '',
      'export function run() {',
      '  const objA: any = new F42ClassA();',
      '  return objA.process();',
      '}'
    ].join('\n'));

    const result = await executeCLI(
      ['call-hierarchy', 'process', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json', '--no-cache'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    const callers: string[] = output.incoming.map((c: any) => c.caller);

    // Bug：fallback 只看 callSiteFile 有無同名本地宣告，不看 receiver 實際型別，
    // objA 明明是 F42ClassA（無 process），卻被誤判為 F42ClassB.process 的 caller
    expect(callers).not.toContain('run');
  });

  it('對照組：真實呼叫 F42ClassB.process() 的函式應被列入 incoming（防止修法保守砍過頭）', async () => {
    await fixture.writeFile('src/f42b-classB.ts', [
      'export class F42bClassB {',
      '  process(): string {',
      '    return \'processed\';',
      '  }',
      '}'
    ].join('\n'));
    await fixture.writeFile('src/f42b-caller.ts', [
      'import { F42bClassB } from \'./f42b-classB.js\';',
      '',
      'export function runReal() {',
      '  return new F42bClassB().process();',
      '}'
    ].join('\n'));

    const result = await executeCLI(
      ['call-hierarchy', 'process', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json', '--no-cache'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    const callers: string[] = output.incoming.map((c: any) => c.caller);

    // 注意：本測試與 F42ClassA/F42ClassB 案例共用同一個 project fixture 索引，
    // 若目標名稱唯一性判定跨測試互相干擾，這裡只斷言真實呼叫者應存在
    expect(callers).toContain('runReal');
  });
});

describe('audit-fix F4-3：同檔非 this. 的 method call 被排除（false negative）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('call-hierarchy incoming 應找到同檔透過區域變數呼叫 method（非 this.）的函式', async () => {
    await fixture.writeFile('src/f43-service.ts', [
      'class F43Service {',
      '  process(): number {',
      '    return 1;',
      '  }',
      '}',
      '',
      'export function useIt() {',
      '  const svc = new F43Service();',
      '  return svc.process();',
      '}'
    ].join('\n'));

    const result = await executeCLI(
      ['call-hierarchy', 'process', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json', '--no-cache'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    const callers: string[] = output.incoming.map((c: any) => c.caller);

    // Bug：isTypeScriptThisMethodCallInDefiningClass 僅接受字面 this.method()，
    // svc.process()（區域變數呼叫）現行被排除於 incoming 之外
    expect(callers).toContain('useIt');
  });
});
