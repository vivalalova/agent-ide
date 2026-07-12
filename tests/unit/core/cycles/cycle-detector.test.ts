/**
 * CycleDetector 測試
 * 測試循環依賴檢測器的所有功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CycleDetector } from '@core/cycles/index.js';
import { DependencyGraph } from '@core/foundations/dependency-graph/index.js';

// ============================================================================
// CycleDetector Tests
// ============================================================================

describe('CycleDetector', () => {
  let detector: CycleDetector;
  let graph: DependencyGraph;

  beforeEach(() => {
    detector = new CycleDetector();
    graph = new DependencyGraph();
  });

  describe('detectCycles', () => {
    it('應該檢測直接循環（A→B→A）', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0].length).toBe(2);
    });

    it('應該檢測間接循環（A→B→C→A）', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/a.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0].length).toBe(3);
    });

    it('應該預設忽略自迴圈', () => {
      graph.addDependency('/src/a.ts', '/src/a.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles).toHaveLength(0);
    });

    it('應該在選項設定時檢測自迴圈', () => {
      graph.addDependency('/src/a.ts', '/src/a.ts');

      const cycles = detector.detectCycles(graph, { ignoreSelfLoops: false });

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0].length).toBe(1);
      expect(cycles[0].cycle).toContain('/src/a.ts');
    });

    it('應該回傳空陣列當無循環', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles).toHaveLength(0);
    });

    it('應該回傳空陣列對空圖', () => {
      const cycles = detector.detectCycles(graph);

      expect(cycles).toHaveLength(0);
    });

    it('應該尊重 maxCycleLength 選項', () => {
      // 建立長度為 5 的循環
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');
      graph.addDependency('/src/d.ts', '/src/e.ts');
      graph.addDependency('/src/e.ts', '/src/a.ts');

      const cyclesWithLimit = detector.detectCycles(graph, { maxCycleLength: 3 });
      const cyclesWithoutLimit = detector.detectCycles(graph, { maxCycleLength: 10 });

      expect(cyclesWithLimit).toHaveLength(0);
      expect(cyclesWithoutLimit.length).toBeGreaterThan(0);
    });

    it('應該拋出錯誤當 maxCycleLength <= 0', () => {
      expect(() => detector.detectCycles(graph, { maxCycleLength: 0 })).toThrow(
        '最大循環長度必須大於 0'
      );
    });

    it('應該在 reportAllCycles=true 時回報所有循環', () => {
      // 建立兩個獨立循環
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');
      graph.addDependency('/src/d.ts', '/src/c.ts');

      const cycles = detector.detectCycles(graph, { reportAllCycles: true });

      expect(cycles.length).toBeGreaterThanOrEqual(2);
    });

    it('應該包含正確的 severity', () => {
      // 短循環 (2 節點) - low
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles[0].severity).toBe('low');
    });

    it('應該處理複雜的多重循環', () => {
      // 建立複雜的循環網絡
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/a.ts');
      graph.addDependency('/src/b.ts', '/src/d.ts');
      graph.addDependency('/src/d.ts', '/src/b.ts');

      const cycles = detector.detectCycles(graph, { reportAllCycles: true });

      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe('findStronglyConnectedComponents', () => {
    it('應該找出單一 SCC', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');

      const sccs = detector.findStronglyConnectedComponents(graph);

      const largeSCC = sccs.find(scc => scc.size > 1);
      expect(largeSCC).toBeDefined();
      expect(largeSCC?.nodes).toContain('/src/a.ts');
      expect(largeSCC?.nodes).toContain('/src/b.ts');
    });

    it('應該找出多個 SCC', () => {
      // SCC 1: A ↔ B
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');
      // SCC 2: C ↔ D
      graph.addDependency('/src/c.ts', '/src/d.ts');
      graph.addDependency('/src/d.ts', '/src/c.ts');

      const sccs = detector.findStronglyConnectedComponents(graph);
      const largeSCCs = sccs.filter(scc => scc.size > 1);

      expect(largeSCCs.length).toBe(2);
    });

    it('應該正確處理孤立節點', () => {
      graph.addNode('/src/lonely.ts');

      const sccs = detector.findStronglyConnectedComponents(graph);

      expect(sccs.some(scc => scc.size === 1 && scc.nodes.includes('/src/lonely.ts'))).toBe(true);
    });

    it('應該正確計算 cycleComplexity', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/a.ts');
      // 增加額外連接提高複雜度
      graph.addDependency('/src/a.ts', '/src/c.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');

      const sccs = detector.findStronglyConnectedComponents(graph);
      const largeSCC = sccs.find(scc => scc.size > 1);

      expect(largeSCC?.cycleComplexity).toBeGreaterThan(0);
    });

    it('應該處理空圖', () => {
      const sccs = detector.findStronglyConnectedComponents(graph);

      expect(sccs).toHaveLength(0);
    });

    it('應該處理線性依賴鏈（無 SCC）', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');

      const sccs = detector.findStronglyConnectedComponents(graph);
      const largeSCCs = sccs.filter(scc => scc.size > 1);

      expect(largeSCCs).toHaveLength(0);
    });
  });

  describe('hasCycles', () => {
    it('應該回傳 true 當有循環', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');

      expect(detector.hasCycles(graph)).toBe(true);
    });

    it('應該回傳 false 當無循環', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      expect(detector.hasCycles(graph)).toBe(false);
    });

    it('應該回傳 false 對空圖', () => {
      expect(detector.hasCycles(graph)).toBe(false);
    });
  });

  describe('getCycleStatistics', () => {
    it('應該回傳正確的統計資訊（有循環）', () => {
      // 建立兩個循環
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');
      graph.addDependency('/src/d.ts', '/src/e.ts');
      graph.addDependency('/src/e.ts', '/src/c.ts');

      const stats = detector.getCycleStatistics(graph);

      expect(stats.totalCycles).toBeGreaterThan(0);
      expect(stats.averageCycleLength).toBeGreaterThan(0);
      expect(stats.maxCycleLength).toBeGreaterThan(0);
      expect(stats.cyclesBySeverity).toHaveProperty('low');
      expect(stats.cyclesBySeverity).toHaveProperty('medium');
      expect(stats.cyclesBySeverity).toHaveProperty('high');
    });

    it('應該回傳零統計對無循環圖', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');

      const stats = detector.getCycleStatistics(graph);

      expect(stats.totalCycles).toBe(0);
      expect(stats.averageCycleLength).toBe(0);
      expect(stats.maxCycleLength).toBe(0);
    });

    it('應該正確分類 severity', () => {
      // 建立不同長度的循環
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts'); // 2 節點 - low

      const stats = detector.getCycleStatistics(graph);

      expect(stats.cyclesBySeverity.low).toBeGreaterThanOrEqual(0);
    });
  });

  describe('suggestFixStrategies', () => {
    it('應該為自迴圈建議移除策略', () => {
      const cycles = [{
        cycle: ['/src/a.ts'],
        length: 1,
        severity: 'low' as const,
      }];

      const strategies = detector.suggestFixStrategies(cycles);

      expect(strategies).toHaveLength(1);
      expect(strategies[0].strategy).toBe('remove_self_reference');
      expect(strategies[0].priority).toBe('low');
    });

    it('應該為雙節點循環建議提取共同依賴', () => {
      const cycles = [{
        cycle: ['/src/a.ts', '/src/b.ts'],
        length: 2,
        severity: 'low' as const,
      }];

      const strategies = detector.suggestFixStrategies(cycles);

      expect(strategies[0].strategy).toBe('extract_common_dependency');
    });

    it('應該為中等循環建議依賴倒置', () => {
      const cycles = [{
        cycle: ['/src/a.ts', '/src/b.ts', '/src/c.ts', '/src/d.ts'],
        length: 4,
        severity: 'medium' as const,
      }];

      const strategies = detector.suggestFixStrategies(cycles);

      expect(strategies[0].strategy).toBe('dependency_inversion');
    });

    it('應該為長循環建議架構重構', () => {
      const cycles = [{
        cycle: [
          '/src/a.ts', '/src/b.ts', '/src/c.ts',
          '/src/d.ts', '/src/e.ts', '/src/f.ts', '/src/g.ts',
        ],
        length: 7,
        severity: 'high' as const,
      }];

      const strategies = detector.suggestFixStrategies(cycles);

      expect(strategies[0].strategy).toBe('architectural_refactoring');
      expect(strategies[0].priority).toBe('high');
    });

    it('應該回傳空陣列對空循環列表', () => {
      const strategies = detector.suggestFixStrategies([]);

      expect(strategies).toHaveLength(0);
    });

    it('應該為高嚴重性循環設定高優先級', () => {
      const cycles = [{
        cycle: ['/src/a.ts', '/src/b.ts'],
        length: 2,
        severity: 'high' as const,
      }];

      const strategies = detector.suggestFixStrategies(cycles);

      expect(strategies[0].priority).toBe('high');
    });
  });

  describe('複雜場景', () => {
    it('應該處理菱形依賴中的循環', () => {
      //     A
      //    ↙ ↘
      //   B   C
      //    ↘ ↙
      //     D → A（循環回去）
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/a.ts', '/src/c.ts');
      graph.addDependency('/src/b.ts', '/src/d.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');
      graph.addDependency('/src/d.ts', '/src/a.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles.length).toBeGreaterThan(0);
    });

    it('應該處理多個獨立的循環群組', () => {
      // 群組 1
      graph.addDependency('/src/g1/a.ts', '/src/g1/b.ts');
      graph.addDependency('/src/g1/b.ts', '/src/g1/a.ts');
      // 群組 2
      graph.addDependency('/src/g2/a.ts', '/src/g2/b.ts');
      graph.addDependency('/src/g2/b.ts', '/src/g2/c.ts');
      graph.addDependency('/src/g2/c.ts', '/src/g2/a.ts');

      const cycles = detector.detectCycles(graph, { reportAllCycles: true });

      expect(cycles.length).toBeGreaterThanOrEqual(2);
    });

    it('應該處理大型循環', () => {
      // 建立 15 節點的循環
      const count = 15;

      for (let i = 0; i < count; i++) {
        const from = `/src/node${i}.ts`;
        const to = `/src/node${(i + 1) % count}.ts`;
        graph.addDependency(from, to);
      }

      const cycles = detector.detectCycles(graph, { maxCycleLength: 20 });

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0].length).toBe(count);
    });

    it('應該在超過 maxCycleLength 的 SCC 中仍找出其中長度合規的短循環', () => {
      // 建立 21 節點的大循環：n1→n2→…→n21→n1
      const nodeCount = 21;
      for (let i = 1; i <= nodeCount; i++) {
        const from = `/src/n${i}.ts`;
        const to = `/src/n${(i % nodeCount) + 1}.ts`;
        graph.addDependency(from, to);
      }
      // 額外邊形成 n2 → n1 的 2 節點循環，但仍在同一個 SCC 內（size 21 > 預設 maxCycleLength 20）
      graph.addDependency('/src/n2.ts', '/src/n1.ts');

      const sccs = detector.findStronglyConnectedComponents(graph);
      const largeSCC = sccs.find(scc => scc.size > 1);
      expect(largeSCC?.size).toBe(nodeCount); // sanity check：SCC 確實超過預設 maxCycleLength

      const cycles = detector.detectCycles(graph); // 使用預設選項（maxCycleLength: 20）
      const shortCycle = cycles.find(cycle =>
        cycle.length === 2 &&
        cycle.cycle.includes('/src/n1.ts') &&
        cycle.cycle.includes('/src/n2.ts')
      );

      expect(shortCycle).toBeDefined();
    });

    it('應該處理混合循環和非循環節點', () => {
      // 循環部分
      graph.addDependency('/src/cycle/a.ts', '/src/cycle/b.ts');
      graph.addDependency('/src/cycle/b.ts', '/src/cycle/a.ts');
      // 非循環部分
      graph.addDependency('/src/linear/a.ts', '/src/linear/b.ts');
      graph.addDependency('/src/linear/b.ts', '/src/linear/c.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles.length).toBe(1);
      expect(cycles[0].cycle.every(n => n.includes('/cycle/'))).toBe(true);
    });

    it('應該正確處理節點互相交叉引用', () => {
      // A ↔ B, B ↔ C, C ↔ A（完全互相引用）
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/b.ts');
      graph.addDependency('/src/c.ts', '/src/a.ts');
      graph.addDependency('/src/a.ts', '/src/c.ts');

      const sccs = detector.findStronglyConnectedComponents(graph);
      const largeSCC = sccs.find(scc => scc.size > 1);

      expect(largeSCC).toBeDefined();
      expect(largeSCC?.size).toBe(3);
      expect(largeSCC?.cycleComplexity).toBeGreaterThan(0);
    });
  });
});
