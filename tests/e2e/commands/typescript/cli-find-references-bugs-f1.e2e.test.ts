/**
 * CLI find-references 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * F1：symbol-reference-filter.ts 的 directNames 裸名稱比對只排除成員存取
 *     （`x.name`），未排除 interface/object literal 的屬性鍵（`{ name: ... }`
 *     的 property signature 與 property key）。同名但無關的 interface 屬性
 *     簽名鍵與 object literal 鍵因此被誤報為對目標符號的引用。
 *
 * 本測試由 rename 修復者以 filterReferencesToSelectedSymbol 實測證實
 * （rename 缺陷 R2 使用同一套底層 --at 過濾機制）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI find-references 缺陷 regression（F1）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('F1：interface 屬性簽名鍵與 object literal 鍵不應被誤報為對同名符號的引用', async () => {
    await fixture.writeFile('src/f1-a.ts', 'export const uniqueTotalF1 = 0;\n');
    await fixture.writeFile('src/f1-b.ts', [
      'import { uniqueTotalF1 } from \'./f1-a\';',
      '',
      'console.log(uniqueTotalF1);',
      '',
      'interface OrderF1 {',
      '  uniqueTotalF1: number;',
      '}',
      '',
      'const orderF1: OrderF1 = { uniqueTotalF1: 5 };',
      'console.log(orderF1.uniqueTotalF1);'
    ].join('\n'));

    const result = await executeCLI(
      [
        'find-references',
        'uniqueTotalF1',
        '--path',
        fixture.rootPath,
        '--at',
        'src/f1-a.ts:1:14',
        '--format',
        'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // 正向：真實的 import 與裸名稱使用必須被找到
    expect(
      output.references.some(
        (r: any) => r.file.endsWith('f1-b.ts') && r.context.includes('import { uniqueTotalF1 }')
      )
    ).toBe(true);
    expect(
      output.references.some(
        (r: any) => r.file.endsWith('f1-b.ts') && r.context.includes('console.log(uniqueTotalF1);')
      )
    ).toBe(true);

    // Bug：interface OrderF1 的屬性簽名鍵 `uniqueTotalF1: number;` 與目標符號無關，
    // 不應被誤報為引用
    expect(
      output.references.some(
        (r: any) => r.file.endsWith('f1-b.ts') && r.context.includes('uniqueTotalF1: number;')
      )
    ).toBe(false);

    // Bug：object literal 的鍵 `{ uniqueTotalF1: 5 }` 與目標符號無關，不應被誤報為引用
    expect(
      output.references.some(
        (r: any) => r.file.endsWith('f1-b.ts') && r.context.includes('{ uniqueTotalF1: 5 }')
      )
    ).toBe(false);

    // 已知會被排除：成員存取 orderF1.uniqueTotalF1 一併斷言
    expect(
      output.references.some(
        (r: any) => r.file.endsWith('f1-b.ts') && r.context.includes('orderF1.uniqueTotalF1')
      )
    ).toBe(false);
  });
});
