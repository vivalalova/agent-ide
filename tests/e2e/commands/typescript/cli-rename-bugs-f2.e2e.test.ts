/**
 * CLI rename 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * F2：language-service.ts 的 findImportBindingPosition 只比對符號名稱，
 *     未驗證 import 的來源模組是否確實對應目標定義。因此：
 *     1. 另一檔案 import 的是「同名但不同來源模組」的符號時，仍被誤判為
 *        對目標符號的 import 綁定，rename 卻沒有實際更新該檔案（bug a）。
 *     2. namespace import（`import * as ns from './a'`）底下的
 *        `ns.member()` 呼叫未被辨識為對目標符號的引用，rename 未更新（bug b）。
 *
 * 本測試由 rename 修復者自報限制。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename 缺陷 regression（F2）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('F2a：import 錨定不辨識來源模組，不應誤改 import 自不同來源同名符號的檔案', async () => {
    await fixture.writeFile('src/f2a-a.ts', 'export function dupFnF2() { return \'a\'; }\n');
    await fixture.writeFile('src/f2a-c.ts', 'export function dupFnF2() { return \'c\'; }\n');
    await fixture.writeFile('src/f2a-b.ts', [
      'import { dupFnF2 } from \'./f2a-c\';',
      '',
      'dupFnF2();'
    ].join('\n'));

    const bBefore = await fixture.readFile('src/f2a-b.ts');

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'dupFnF2', '--to', 'renamedFnF2',
        '--at', 'src/f2a-a.ts:1:17',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // 正向：a.ts 自身的定義應被重新命名
    const aAfter = await fixture.readFile('src/f2a-a.ts');
    expect(aAfter).toContain('renamedFnF2');
    expect(aAfter).not.toContain('dupFnF2');

    // Bug：b.ts import 的是 c.ts 的 dupFnF2（不同來源模組的同名函式），
    // 完全不應被改動
    const bAfter = await fixture.readFile('src/f2a-b.ts');
    expect(bAfter).toBe(bBefore);
  });

  it('F2b：namespace import 底下的 ns.member() 呼叫應被同步重新命名', async () => {
    await fixture.writeFile('src/f2b-a.ts', 'export function nsFnF2() {}\n');
    await fixture.writeFile('src/f2b-b.ts', [
      'import * as aMod from \'./f2b-a\';',
      '',
      'aMod.nsFnF2();'
    ].join('\n'));

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'nsFnF2', '--to', 'renamedNsF2',
        '--at', 'src/f2b-a.ts:1:17',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // 正向：a.ts 自身的定義應被重新命名
    const aAfter = await fixture.readFile('src/f2b-a.ts');
    expect(aAfter).toContain('renamedNsF2');
    expect(aAfter).not.toContain('nsFnF2');

    // Bug：b.ts 的 aMod.nsFnF2() 呼叫未被辨識為引用，未同步改名
    const bAfter = await fixture.readFile('src/f2b-b.ts');
    expect(bAfter).toContain('aMod.renamedNsF2()');
    expect(bAfter).not.toContain('aMod.nsFnF2()');
  });

  it('R2-1：barrel re-export（export { x } from "./a"）的 specifier 應同步重新命名', async () => {
    await fixture.writeFile('src/r21-a.ts', 'export const barrelValR21 = 1;\n');
    await fixture.writeFile('src/r21-barrel.ts', 'export { barrelValR21 } from \'./r21-a\';\n');

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'barrelValR21', '--to', 'renamedBarrelR21',
        '--at', 'src/r21-a.ts:1:14',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // 正向：a.ts 自身的定義應被重新命名
    const aAfter = await fixture.readFile('src/r21-a.ts');
    expect(aAfter).toContain('renamedBarrelR21');
    expect(aAfter).not.toContain('barrelValR21');

    // Bug：barrel.ts 的 re-export specifier（ExportDeclaration）沒有對應的匯入錨點，
    // findImportBindingPosition 只掃 ImportDeclaration，此檔被靜默跳過
    const barrelAfter = await fixture.readFile('src/r21-barrel.ts');
    expect(barrelAfter).toContain('renamedBarrelR21');
    expect(barrelAfter).not.toContain('barrelValR21');
  });
});
