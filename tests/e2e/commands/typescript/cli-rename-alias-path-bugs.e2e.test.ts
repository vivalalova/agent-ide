/**
 * CLI rename 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * N2-b：別名 import（`import { x as y } from '...'`）重新命名符號 x 時，
 *       import specifier 與別名綁定完全未同步更新，遺留對已改名、不存在的
 *       舊符號名稱的 import specifier；呼叫端 `y()` 因此指向失效的別名綁定
 *       （斷鏈）。正確行為應只更新 specifier 為新名稱、保留使用者自訂別名
 *       `y` 不動，呼叫端 `y()` 完全不需改動。
 *
 * 此缺陷與 --path 是否為絕對路徑無關（絕對路徑下即可重現），
 * 故走 memfs E2E；「定義端漏改」的相關缺陷（N2-a，僅相對路徑下重現）
 * 見 tests/unit/interfaces/cli/rename-relative-workspace-path-bugs.test.ts。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename 缺陷 regression（N2-b：別名 import 塌陷）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('rename 別名 import 的來源符號時，應保留使用者自訂別名，呼叫端不變動', async () => {
    await fixture.writeFile('src/n2-target.ts', [
      'export function fetchData(): string {',
      '  return \'data\';',
      '}'
    ].join('\n') + '\n');

    await fixture.writeFile('src/n2-use.ts', [
      'import { fetchData as fd } from \'./n2-target\';',
      '',
      'export function run(): string {',
      '  return fd();',
      '}'
    ].join('\n') + '\n');

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'fetchData', '--to', 'loadData',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // 正向：定義端本身應正確重新命名（絕對路徑下不受 N2-a 影響）
    const targetAfter = await fixture.readFile('src/n2-target.ts');
    expect(targetAfter).toContain('export function loadData');
    expect(targetAfter).not.toContain('fetchData');

    // Bug：import specifier 應同步改成新名稱、別名 `fd` 維持不變；
    // 呼叫端 `fd()` 維持不動。目前 specifier 完全未更新（遺留對已改名、
    // 不存在符號的 import），呼叫端因此指向失效的別名綁定。
    const useAfter = await fixture.readFile('src/n2-use.ts');
    expect(useAfter).toContain('import { loadData as fd } from \'./n2-target\';');
    expect(useAfter).toContain('return fd();');
    expect(useAfter).not.toContain('loadData as loadData');
    expect(useAfter).not.toContain('return loadData();');
  });
});
