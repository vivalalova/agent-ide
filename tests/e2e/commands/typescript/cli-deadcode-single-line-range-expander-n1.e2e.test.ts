/**
 * [audit-fix] N1：CLI deadcode 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * src/core/deadcode/range-expander.ts:100-226 的 expandRangeByStringMatching
 * fallback 路徑對 variable/constant 的刪除範圍以「整個物理行」為單位
 * （start = 該行行首，end = 該行行尾），沒有考慮同一物理行可能塞了多條
 * 獨立的宣告陳述式。當 dead 變數與仍在使用的變數寫在同一行時，刪除 dead
 * 變數會把同行的 notDead 宣告一起吃掉。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('[audit-fix] CLI deadcode 同物理行誤刪 regression（N1）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('同一物理行的 dead 變數與仍在使用的 export 變數：export 宣告不應被一併刪除', async () => {
    await fixture.writeFile('src/n1-source.ts', [
      'export const notDead = 1; const dead1 = 1;',
      ''
    ].join('\n'));
    await fixture.writeFile('src/n1-consumer.ts', [
      'import { notDead } from \'./n1-source.js\';',
      'export const useNotDead = notDead + 1;',
      ''
    ].join('\n'));

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const content = await fixture.readFile('src/n1-source.ts');

    // 硬斷言：notDead 仍被 n1-consumer.ts 引用，宣告本身不應被刪除
    // （現行 fallback 對 dead1 做整行刪除，會把同行的 notDead 一起吃掉）
    expect(content).toContain('notDead');

    // 次要斷言：dead1 理想上應被移除；若修法選擇保守跳過整行（不誤刪即合格），
    // 這條可能不成立，不作為本測試的硬性回歸判準。
    // expect(content).not.toContain('dead1');
  });
});
