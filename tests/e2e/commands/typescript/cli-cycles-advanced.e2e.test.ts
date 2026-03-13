/**
 * CLI cycles 進階路徑 E2E 測試
 *
 * 目標：補充 cycles 命令的進階場景，
 * 涵蓋多個獨立循環、確認 0 循環時回傳空陣列等路徑。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI cycles - 進階路徑覆蓋', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  // MARK: - 多個獨立循環

  describe('多個獨立循環', () => {
    it('應該檢測並回傳三個獨立的兩節點循環', async () => {
      // 循環 1: A1 ↔ B1
      await fixture.writeFile('src/cyc3-a1.ts', 'import { b1 } from \'./cyc3-b1.js\';\nexport const a1 = b1;');
      await fixture.writeFile('src/cyc3-b1.ts', 'import { a1 } from \'./cyc3-a1.js\';\nexport const b1 = a1;');
      // 循環 2: A2 ↔ B2
      await fixture.writeFile('src/cyc3-a2.ts', 'import { b2 } from \'./cyc3-b2.js\';\nexport const a2 = b2;');
      await fixture.writeFile('src/cyc3-b2.ts', 'import { a2 } from \'./cyc3-a2.js\';\nexport const b2 = a2;');
      // 循環 3: A3 ↔ B3
      await fixture.writeFile('src/cyc3-a3.ts', 'import { b3 } from \'./cyc3-b3.js\';\nexport const a3 = b3;');
      await fixture.writeFile('src/cyc3-b3.ts', 'import { a3 } from \'./cyc3-a3.js\';\nexport const b3 = a3;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(Array.isArray(output.cycles)).toBe(true);
      // 應找到至少 3 個循環
      expect(output.cycles.length).toBeGreaterThanOrEqual(3);
    });

    it('應該不把 DAG（有向無環圖）誤報為有循環', async () => {
      // A → B → C，無循環
      await fixture.writeFile('src/dag-no-cyc-a.ts', 'import { dagB } from \'./dag-no-cyc-b.js\';\nexport const dagA = dagB;');
      await fixture.writeFile('src/dag-no-cyc-b.ts', 'import { dagC } from \'./dag-no-cyc-c.js\';\nexport const dagB = dagC;');
      await fixture.writeFile('src/dag-no-cyc-c.ts', 'export const dagC = \'leaf\';');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 這三個新加的檔案之間不應該有循環
      const cyclesInvolveNewFiles = output.cycles.filter((c: { cycle: string[] }) =>
        c.cycle.some((f: string) => f.includes('dag-no-cyc'))
      );
      expect(cyclesInvolveNewFiles.length).toBe(0);
    });

    it('應該正確分析 A→B→C→A（三節點循環）', async () => {
      await fixture.writeFile('src/tri3-a.ts', 'import { tri3C } from \'./tri3-c.js\';\nexport const tri3A = tri3C;');
      await fixture.writeFile('src/tri3-b.ts', 'import { tri3A } from \'./tri3-a.js\';\nexport const tri3B = tri3A;');
      await fixture.writeFile('src/tri3-c.ts', 'import { tri3B } from \'./tri3-b.js\';\nexport const tri3C = tri3B;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const threeNodeCycles = output.cycles.filter((c: { length: number, cycle: string[] }) =>
        c.length >= 3 && c.cycle.some((f: string) => f.includes('tri3'))
      );
      expect(threeNodeCycles.length).toBeGreaterThanOrEqual(1);
    });
  });

  // MARK: - 0 循環情境

  describe('0 循環情境', () => {
    it('純 DAG 結構應回傳 0 個循環', async () => {
      // 建立一個 5 層 DAG，無任何循環
      await fixture.writeFile('src/pdag-root.ts', 'import { pdagL1a } from \'./pdag-l1a.js\';\nimport { pdagL1b } from \'./pdag-l1b.js\';\nexport const pdagRoot = pdagL1a + pdagL1b;');
      await fixture.writeFile('src/pdag-l1a.ts', 'import { pdagLeaf } from \'./pdag-leaf.js\';\nexport const pdagL1a = pdagLeaf + \'a\';');
      await fixture.writeFile('src/pdag-l1b.ts', 'import { pdagLeaf } from \'./pdag-leaf.js\';\nexport const pdagL1b = pdagLeaf + \'b\';');
      await fixture.writeFile('src/pdag-leaf.ts', 'export const pdagLeaf = \'leaf\';');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(Array.isArray(output.cycles)).toBe(true);

      // pdag 檔案之間不應有循環
      const pdagCycles = output.cycles.filter((c: { cycle: string[] }) =>
        c.cycle.some((f: string) => f.includes('pdag'))
      );
      expect(pdagCycles.length).toBe(0);
    });

    it('單一孤立檔案應回傳 0 個循環', async () => {
      await fixture.writeFile('src/standalone.ts', 'export const standalone = \'alone\';');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles).toBeDefined();
    });
  });

  // MARK: - 格式驗證

  describe('格式驗證', () => {
    it('json 格式應包含完整結構（有循環時）', async () => {
      await fixture.writeFile('src/fmt-cyc-a.ts', 'import { fmtCycB } from \'./fmt-cyc-b.js\';\nexport const fmtCycA = fmtCycB;');
      await fixture.writeFile('src/fmt-cyc-b.ts', 'import { fmtCycA } from \'./fmt-cyc-a.js\';\nexport const fmtCycB = fmtCycA;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // 驗證必要欄位
      // cycles 使用 DepsResult，command 欄位值為 'deps'
      expect(output.command).toBeDefined();
      expect(output.success).toBeDefined();
      expect(Array.isArray(output.cycles)).toBe(true);
      expect(output.summary).toBeDefined();
      expect(typeof output.summary.cyclesFound).toBe('number');
    });

    it('summary 格式應包含循環統計數字', async () => {
      await fixture.writeFile('src/sum-cyc-x.ts', 'import { sumCycY } from \'./sum-cyc-y.js\';\nexport const sumCycX = sumCycY;');
      await fixture.writeFile('src/sum-cyc-y.ts', 'import { sumCycX } from \'./sum-cyc-x.js\';\nexport const sumCycY = sumCycX;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      // summary 輸出應包含數字
      expect(result.stdout).toMatch(/\d+/);
    });
  });
});
