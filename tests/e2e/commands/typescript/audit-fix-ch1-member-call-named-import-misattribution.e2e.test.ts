/**
 * audit-fix CH1 regression（先紅後綠）
 *
 * TS：`findTypeScriptImportedBinding` 的具名 import 分支只比對 local 名稱
 * （`candidate.name.text === call.callee`），沒有排除 method call：`receiver.foo()`
 * 的 callee 只是屬性名，與某個具名 import 的 local 名同名純屬巧合（如
 * `import { foo } from './lib'` 之後某處呼叫 `window.foo()`），卻被誤判成呼叫該 import，
 * 導致：
 * - outgoing depth>1：誤把 import 目標檔內部的呼叫鏈掛到這個無關的 member call 上
 * - incoming：誤把無關的 member call 呼叫者算成 import 目標的 caller
 *
 * 修法：具名 import 分支加 `!call.isMethodCall` 守衛；incoming 另補一層 method-call
 * fallback 收斂（method call 語法上不可能呼叫到自由函式，target 非 class method 時直接
 * 排除，不落回保守 fallback）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix CH1：TS member call 誤吃同名具名 import', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('outgoing depth>1 不應把 window.foo() 誤展開成 import foo 內部的呼叫鏈', async () => {
    await fixture.writeFile('src/ch1-lib.ts', `
export function ch1Bar() {
  return 1;
}

export function ch1Foo() {
  return ch1Bar();
}
    `.trim());
    await fixture.writeFile('src/ch1-main.ts', `
import { ch1Foo } from './ch1-lib.js';

export function ch1Outer() {
  return ch1Inner();
}

function ch1Inner() {
  return (globalThis as any).ch1Foo();
}
    `.trim());

    const result = await executeCLI(
      ['call-hierarchy', 'ch1Outer', '--path', fixture.rootPath, '--direction', 'outgoing', '--depth', '3', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const callees = output.outgoing.map((c: { callee: string }) => c.callee);
    expect(callees).toContain('ch1Inner');
    expect(callees).toContain('ch1Foo');
    // Bug：window.ch1Foo() 誤判成呼叫 import 的 ch1Foo，把 ch1Bar 也遞迴展開進來
    expect(callees).not.toContain('ch1Bar');
  });

  it('incoming 不應把呼叫 window.foo() 的函式算成 import foo 的 caller', async () => {
    await fixture.writeFile('src/ch1b-lib.ts', `
export function ch1bFoo() {
  return 1;
}
    `.trim());
    await fixture.writeFile('src/ch1b-main.ts', `
import { ch1bFoo } from './ch1b-lib.js';

export function ch1bCaller() {
  return (globalThis as any).ch1bFoo();
}
    `.trim());

    const result = await executeCLI(
      ['call-hierarchy', 'ch1bFoo', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    // Bug：ch1bCaller 呼叫的是 globalThis 上一個同名屬性，與 import 的 ch1bFoo 無關
    expect(output.incoming).toHaveLength(0);
  });

  it('對照組：直接呼叫（非 member call）的 import foo 仍應正確展開/歸戶', async () => {
    await fixture.writeFile('src/ch1c-lib.ts', `
export function ch1cBar() {
  return 1;
}

export function ch1cFoo() {
  return ch1cBar();
}
    `.trim());
    await fixture.writeFile('src/ch1c-main.ts', `
import { ch1cFoo } from './ch1c-lib.js';

export function ch1cOuter() {
  return ch1cFoo();
}
    `.trim());

    const outgoingResult = await executeCLI(
      ['call-hierarchy', 'ch1cOuter', '--path', fixture.rootPath, '--direction', 'outgoing', '--depth', '2', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(outgoingResult.exitCode).toBe(0);
    const outgoingOutput = JSON.parse(outgoingResult.stdout);
    const callees = outgoingOutput.outgoing.map((c: { callee: string }) => c.callee);
    expect(callees).toContain('ch1cFoo');
    expect(callees).toContain('ch1cBar');

    const incomingResult = await executeCLI(
      ['call-hierarchy', 'ch1cFoo', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(incomingResult.exitCode).toBe(0);
    const incomingOutput = JSON.parse(incomingResult.stdout);
    const callers = incomingOutput.incoming.map((c: { caller: string }) => c.caller);
    expect(callers).toContain('ch1cOuter');
  });

  it('對照組：跨檔 class method 的 incoming 仍應正確找到 caller（method-call fallback 收斂不得誤傷）', async () => {
    await fixture.writeFile('src/ch1d-base.ts', `
export class Ch1dBase {
  ch1dBaseMethod(): string {
    return 'base';
  }
}
    `.trim());
    await fixture.writeFile('src/ch1d-derived.ts', `
import { Ch1dBase } from './ch1d-base.js';
export class Ch1dDerived extends Ch1dBase {
  ch1dDerivedMethod(): string {
    return this.ch1dBaseMethod() + '-derived';
  }
}
    `.trim());
    await fixture.writeFile('src/ch1d-caller.ts', `
import { Ch1dDerived } from './ch1d-derived.js';
export function ch1dCallDerived(): string {
  const obj = new Ch1dDerived();
  return obj.ch1dDerivedMethod();
}
    `.trim());

    const result = await executeCLI(
      ['call-hierarchy', 'ch1dDerivedMethod', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const callers = output.incoming.map((c: { caller: string }) => c.caller);
    expect(callers).toContain('ch1dCallDerived');
  });
});
