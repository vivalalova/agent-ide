/**
 * audit-fix CH5 regression（先紅後綠）
 *
 * outgoing depth>1 遞迴展開（`findCalleeDefinition`）在同檔、無 import binding 可判定時，
 * 直接用 `findFunctionDefinition(call.callee, [callerFile])` 全檔搜尋同名宣告，沒有檢查
 * 呼叫點的識別符是否被更近的參數/區域宣告遮蔽：
 *
 *   function foo() { return topLevelOnly(); }
 *   function topLevelOnly() { return 1; }
 *   function outer(foo: () => number) { return foo(); }  // 這個 foo() 呼叫的是參數
 *   function bar2() { return outer(() => 42); }
 *
 * depth>1 展開 bar2 → outer → foo() 時，會誤判 outer 內的 foo() 呼叫到頂層同名函式 foo，
 * 進而把 foo 內部呼叫的 topLevelOnly 也遞迴展開進來，但 outer 呼叫的其實是自己的參數。
 *
 * 修法：找到候選定義後，重用 incoming 路徑同一套詞法錨定判斷
 * （isSameFileCallSiteAnchoredToDefinition）驗證呼叫點識別符確實綁定到該候選定義，
 * 被更近的宣告遮蔽則不予展開。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix CH5：depth>1 同檔 fallback 忽略 lexical shadow', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('depth=3 outgoing 不應把被參數遮蔽的同名頂層函式遞迴展開', async () => {
    await fixture.writeFile('src/ch5-main.ts', `
function ch5Foo() {
  return ch5TopLevelOnly();
}

function ch5TopLevelOnly() {
  return 1;
}

function ch5Outer(ch5Foo: () => number) {
  return ch5Foo();
}

export function ch5Bar2() {
  return ch5Outer(() => 42);
}
    `.trim());

    const result = await executeCLI(
      ['call-hierarchy', 'ch5Bar2', '--path', fixture.rootPath, '--direction', 'outgoing', '--depth', '3', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const callees = output.outgoing.map((c: { callee: string }) => c.callee);
    expect(callees).toContain('ch5Outer');
    // Bug：outer 內 ch5Foo() 呼叫的是參數，遞迴誤展開成頂層 ch5Foo，連帶帶出 ch5TopLevelOnly
    expect(callees).not.toContain('ch5TopLevelOnly');
  });

  it('對照組：無遮蔽的同檔多層遞迴仍應正確展開', async () => {
    await fixture.writeFile('src/ch5b-main.ts', `
function ch5bFoo() {
  return 1;
}

function ch5bMiddle() {
  return ch5bFoo();
}

export function ch5bEntry() {
  return ch5bMiddle();
}
    `.trim());

    const result = await executeCLI(
      ['call-hierarchy', 'ch5bEntry', '--path', fixture.rootPath, '--direction', 'outgoing', '--depth', '3', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const callees = output.outgoing.map((c: { callee: string }) => c.callee);
    expect(callees).toContain('ch5bMiddle');
    expect(callees).toContain('ch5bFoo');
  });
});
