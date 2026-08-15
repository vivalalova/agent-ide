/**
 * CLI change-signature 命令 E2E 測試 - [audit-fix] F1-1
 *
 * 缺陷：src/interfaces/cli/commands/change-signature.command.ts:443-450 用
 * `paramPart.indexOf('=')` 切割 --add 的「型別」與「預設值」，型別本身含
 * `=>`（箭頭函式型別）時，`=>` 中的 `=` 被誤判為預設值分隔符，導致型別被
 * 攔腰截斷、預設值變成殘缺片段（如 `>void`），即使該參數根本沒有指定預設值。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as ts from 'typescript';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI change-signature - --add 箭頭函式型別解析 [audit-fix] F1-1', () => {
  let fixture: FixtureContext;

  function expectValidTypeScript(sourceText: string): void {
    const sourceFile = ts.createSourceFile('generated.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    expect(sourceFile.parseDiagnostics).toEqual([]);
  }

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[audit-fix] F1-1：--add 箭頭函式型別（無預設值）不應被 => 的 = 誤判截斷', async () => {
    const testFile = `${fixture.rootPath}/regression-f1-1-no-default.ts`;
    await fixture.memfs.writeFile(testFile, `
function runF11NoDefault(): void {
}

runF11NoDefault();
`.trim());

    const result = await executeCLI(
      [
        'change-signature', testFile, 'runF11NoDefault',
        '-p', fixture.rootPath,
        '--add', 'cb:(x:number)=>void',
        '--call-site-value', 'cb=() => {}',
        '--no-cache', '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
    expect(updated).toContain('function runF11NoDefault(cb: (x: number) => void): void');
    expectValidTypeScript(updated);
  });

  it('[audit-fix] F1-1：--add 箭頭函式型別＋箭頭函式預設值應正確切出型別與預設值', async () => {
    const testFile = `${fixture.rootPath}/regression-f1-1-with-default.ts`;
    await fixture.memfs.writeFile(testFile, `
function runF11WithDefault(): void {
}

runF11WithDefault();
`.trim());

    const result = await executeCLI(
      [
        'change-signature', testFile, 'runF11WithDefault',
        '-p', fixture.rootPath,
        '--add', 'onDone:()=>void=()=>{}',
        '--no-cache', '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
    expect(updated).toContain('function runF11WithDefault(onDone: () => void = () => {}): void');
    expectValidTypeScript(updated);
  });

  it('[audit-fix] F1-1 對照（保護性）：--add 一般型別含預設值仍應正常運作', async () => {
    const testFile = `${fixture.rootPath}/regression-f1-1-guard-plain-default.ts`;
    await fixture.memfs.writeFile(testFile, `
interface RequestOptionsF11Guard {
  cache: boolean;
}

function fetchDataF11Guard(url: string): string {
  return url;
}

const responseF11Guard = fetchDataF11Guard('/api');
`.trim());

    const result = await executeCLI(
      [
        'change-signature', testFile, 'fetchDataF11Guard',
        '-p', fixture.rootPath,
        '--add', 'options:RequestOptionsF11Guard={ cache: false }',
        '--no-cache', '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
    expect(updated).toContain('function fetchDataF11Guard(url: string, options: RequestOptionsF11Guard = { cache: false }): string');
    expectValidTypeScript(updated);
  });
});
