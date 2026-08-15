/**
 * CLI find-references 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * J2：src/interfaces/cli/commands/nearest-lexical-declaration.ts:120 的 fallback
 *     `findAncestor(isBlock || isSourceFile)` 跳過 CaseClause/CaseBlock
 *     （ts.isBlock 對 CaseBlock 回 false），case 內無大括號的 let/const 宣告
 *     的詞法 scope 因此被誤算成外層函式 Block，導致 switch 之外對外層同名符號
 *     （例如 import 進來的同名 binding）的引用被誤判為遮蔽而漏報。
 *
 * 實測觀察（修復前）：`find-references --at` 對 j2-b.ts 只回報 1 筆引用
 * （import 那行），switch 前後兩個 `console.log(shadowSwJ2)`（指向 import
 * 進來的外層符號）完全消失於結果中；case 內部宣告與其後的 console.log
 * 則正確被排除（它們屬於另一個同名區域變數，本非目標）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI find-references 缺陷 regression（J2）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('J2：switch-case 內無大括號宣告不應遮蔽 switch 前後對外層符號的引用', async () => {
    await fixture.writeFile('src/j2-a.ts', 'export const shadowSwJ2 = 1;\n');
    await fixture.writeFile('src/j2-b.ts', [
      'import { shadowSwJ2 } from \'./j2-a\';',
      '',
      'export function useSwJ2(n: number) {',
      '  console.log(shadowSwJ2);',
      '  switch (n) {',
      '    case 1:',
      '      let shadowSwJ2 = 5;',
      '      console.log(shadowSwJ2);',
      '      break;',
      '  }',
      '  console.log(shadowSwJ2);',
      '}'
    ].join('\n'));

    const result = await executeCLI(
      [
        'find-references',
        'shadowSwJ2',
        '--path',
        fixture.rootPath,
        '--at',
        'src/j2-a.ts:1:14',
        '--format',
        'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const bRefs: any[] = output.references.filter((r: any) => r.file.endsWith('j2-b.ts'));

    // import 這一行必須被找到
    expect(bRefs.some((r) => r.context.includes('import { shadowSwJ2 }'))).toBe(true);

    // switch 之前的 console.log 指向 import 進來的外層符號，必須被找到
    expect(
      bRefs.filter((r) => r.context.includes('console.log(shadowSwJ2)')).length
    ).toBeGreaterThanOrEqual(2);

    // case 內部宣告與其後的 console.log 屬於 case 區域變數，與目標符號無關，不應被列入
    expect(bRefs.some((r) => r.context.includes('let shadowSwJ2 = 5;'))).toBe(false);
  });
});
