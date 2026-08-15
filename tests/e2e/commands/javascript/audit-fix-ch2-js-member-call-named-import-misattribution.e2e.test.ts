/**
 * audit-fix CH2 regression（先紅後綠）
 *
 * JS/Babel 路徑同 CH1（`findBabelImportedBinding` 的 ImportSpecifier 分支）：
 * `receiver.foo()` 的 callee 只是屬性名，與具名 import 的 local 名同名純屬巧合，卻被誤判
 * 成呼叫該 import，造成 outgoing depth>1 誤展開、incoming 誤收無關 caller。
 *
 * 修法：ImportSpecifier 分支加 `!call.isMethodCall` 守衛（與 TS 分支同守衛，同一份修法）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix CH2：JS member call 誤吃同名具名 import', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('outgoing depth>1 不應把 globalThis.foo() 誤展開成 import foo 內部的呼叫鏈', async () => {
    await fixture.writeFile('src/ch2js-lib.js', [
      'export function ch2jsBar() {',
      '  return 1;',
      '}',
      '',
      'export function ch2jsFoo() {',
      '  return ch2jsBar();',
      '}'
    ].join('\n'));
    await fixture.writeFile('src/ch2js-main.js', [
      'import { ch2jsFoo } from \'./ch2js-lib.js\';',
      '',
      'export function ch2jsOuter() {',
      '  return ch2jsInner();',
      '}',
      '',
      'function ch2jsInner() {',
      '  return globalThis.ch2jsFoo();',
      '}'
    ].join('\n'));

    const result = await executeCLI(
      ['call-hierarchy', 'ch2jsOuter', '--path', fixture.rootPath, '--direction', 'outgoing', '--depth', '3', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const callees = output.outgoing.map((c: { callee: string }) => c.callee);
    expect(callees).toContain('ch2jsInner');
    expect(callees).toContain('ch2jsFoo');
    // Bug：globalThis.ch2jsFoo() 誤判成呼叫 import 的 ch2jsFoo，把 ch2jsBar 也遞迴展開進來
    expect(callees).not.toContain('ch2jsBar');
  });

  it('incoming 不應把呼叫 globalThis.foo() 的函式算成 import foo 的 caller', async () => {
    await fixture.writeFile('src/ch2jsb-lib.js', [
      'export function ch2jsbFoo() {',
      '  return 1;',
      '}'
    ].join('\n'));
    await fixture.writeFile('src/ch2jsb-main.js', [
      'import { ch2jsbFoo } from \'./ch2jsb-lib.js\';',
      '',
      'export function ch2jsbCaller() {',
      '  return globalThis.ch2jsbFoo();',
      '}'
    ].join('\n'));

    const result = await executeCLI(
      ['call-hierarchy', 'ch2jsbFoo', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.incoming).toHaveLength(0);
  });

  it('對照組：直接呼叫（非 member call）的 import foo 仍應正確展開/歸戶', async () => {
    await fixture.writeFile('src/ch2jsc-lib.js', [
      'export function ch2jscBar() {',
      '  return 1;',
      '}',
      '',
      'export function ch2jscFoo() {',
      '  return ch2jscBar();',
      '}'
    ].join('\n'));
    await fixture.writeFile('src/ch2jsc-main.js', [
      'import { ch2jscFoo } from \'./ch2jsc-lib.js\';',
      '',
      'export function ch2jscOuter() {',
      '  return ch2jscFoo();',
      '}'
    ].join('\n'));

    const outgoingResult = await executeCLI(
      ['call-hierarchy', 'ch2jscOuter', '--path', fixture.rootPath, '--direction', 'outgoing', '--depth', '2', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(outgoingResult.exitCode).toBe(0);
    const outgoingOutput = JSON.parse(outgoingResult.stdout);
    const callees = outgoingOutput.outgoing.map((c: { callee: string }) => c.callee);
    expect(callees).toContain('ch2jscFoo');
    expect(callees).toContain('ch2jscBar');

    const incomingResult = await executeCLI(
      ['call-hierarchy', 'ch2jscFoo', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(incomingResult.exitCode).toBe(0);
    const incomingOutput = JSON.parse(incomingResult.stdout);
    const callers = incomingOutput.incoming.map((c: { caller: string }) => c.caller);
    expect(callers).toContain('ch2jscOuter');
  });
});
