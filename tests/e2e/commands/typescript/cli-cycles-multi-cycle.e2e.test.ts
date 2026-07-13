/**
 * CLI cycles 同一 SCC 內多環缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * G5：同一個 SCC（強連通元件）內若存在多條不同的簡單環，目前只報一條，
 *     另一條會消失。fixture 中 a↔b、a↔c 是兩條獨立的環（共享節點 a），
 *     但實測結果 cyclesFound=1，只報 c↔a，a↔b 消失。
 *     預期契約：同一 SCC 內的每條簡單環都要各自回報
 *     （cyclesFound=2，且兩條環的節點集合分別涵蓋 {a,b} 與 {a,c}）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI cycles 同一 SCC 內多環缺陷（G5，reproduction）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('a↔b 與 a↔c 兩條獨立的環都應被回報，不得只報其中一條', async () => {
    await fixture.writeFile('src/g5-cycle-a.ts', `import { b } from './g5-cycle-b.js';
import { c } from './g5-cycle-c.js';
export const a = 1;
export const useB = b;
export const useC = c;
`);
    await fixture.writeFile('src/g5-cycle-b.ts', `import { a } from './g5-cycle-a.js';
export const b = a + 1;
`);
    await fixture.writeFile('src/g5-cycle-c.ts', `import { a } from './g5-cycle-a.js';
export const c = a + 2;
`);

    const result = await executeCLI(
      ['cycles', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);
    expect(Array.isArray(output.cycles)).toBe(true);

    const cyclesWithA = output.cycles.filter((cyc: { cycle: string[] }) =>
      cyc.cycle.some((f) => f.includes('g5-cycle-a.ts'))
    );

    const abCycle = cyclesWithA.find((cyc: { cycle: string[] }) =>
      cyc.cycle.some((f) => f.includes('g5-cycle-b.ts')) &&
      !cyc.cycle.some((f) => f.includes('g5-cycle-c.ts'))
    );
    const acCycle = cyclesWithA.find((cyc: { cycle: string[] }) =>
      cyc.cycle.some((f) => f.includes('g5-cycle-c.ts')) &&
      !cyc.cycle.some((f) => f.includes('g5-cycle-b.ts'))
    );

    // 實測錯誤結果：只報 c↔a 一條，a↔b 消失
    // 正確行為：a↔b 與 a↔c 兩條環都要各自出現
    expect(abCycle).toBeDefined();
    expect(acCycle).toBeDefined();

    // 實測錯誤結果：cyclesFound=1
    // 正確行為：兩條環都報，cyclesFound=2
    expect(output.summary.cyclesFound).toBe(2);
  });
});
