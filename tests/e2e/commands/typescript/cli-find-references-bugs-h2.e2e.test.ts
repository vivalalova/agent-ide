/**
 * CLI find-references 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * H2：find-references 用 --at 定位到 default export 函式定義時，漏掉對應的
 *     default import 引用（import 行本身與呼叫行皆未回報），只回報定義自身。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI find-references 缺陷 regression（H2）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('H2：--at 定位 default export 函式定義時，應找到 default import 的引用', async () => {
    await fixture.writeFile('src/h2-lib.ts', [
      'export default function h2Greet(): number {',
      '  return 1;',
      '}'
    ].join('\n') + '\n');
    await fixture.writeFile('src/h2-use.ts', [
      'import h2Hello from \'./h2-lib.js\';',
      '',
      'export const h2R = h2Hello();'
    ].join('\n') + '\n');

    const result = await executeCLI(
      [
        'find-references',
        'h2Greet',
        '--path',
        fixture.rootPath,
        '--at',
        'src/h2-lib.ts:1:25',
        '--format',
        'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const h2UseReferences = output.references.filter((r: any) => r.file.endsWith('h2-use.ts'));

    // Bug：目前 h2-use.ts 完全零筆引用（import 與呼叫皆漏掉）
    // 正確：import 行（第 1 行）與呼叫行（第 3 行）都應被找到
    expect(h2UseReferences.some((r: any) => r.line === 1)).toBe(true);
    expect(h2UseReferences.some((r: any) => r.line === 3)).toBe(true);
    expect(h2UseReferences.length).toBeGreaterThanOrEqual(2);
  });
});
