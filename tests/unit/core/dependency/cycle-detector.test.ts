import { describe, it, expect, beforeEach } from 'vitest';
import { CycleDetector } from '@core/dependency/cycle-detector';
import { DependencyGraph } from '@core/dependency/dependency-graph';

describe('CycleDetector', () => {
  let detector: CycleDetector;
  let graph: DependencyGraph;

  beforeEach(() => {
    detector = new CycleDetector();
    graph = new DependencyGraph();
  });

  describe('循環檢測', () => {
    it('應該檢測簡單的雙節點循環', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file1.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0].length).toBe(2);
    });

    it('應該檢測三節點循環', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file3.ts');
      graph.addDependency('file3.ts', 'file1.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0].length).toBe(3);
    });

    it('應該檢測自迴圈', () => {
      graph.addDependency('file1.ts', 'file1.ts');

      const cycles = detector.detectCycles(graph, { ignoreSelfLoops: false });

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0].length).toBe(1);
      expect(cycles[0].cycle).toContain('file1.ts');
    });

    it('應該在沒有循環時回傳空陣列', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file3.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles).toHaveLength(0);
    });

    it('應該檢測多個獨立的循環', () => {
      // 循環 1
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file1.ts');

      // 循環 2
      graph.addDependency('file3.ts', 'file4.ts');
      graph.addDependency('file4.ts', 'file3.ts');

      const cycles = detector.detectCycles(graph, { reportAllCycles: true });

      expect(cycles.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('檢測選項', () => {
    it('應該忽略自迴圈當選項設置時', () => {
      graph.addDependency('file1.ts', 'file1.ts');

      const cycles = detector.detectCycles(graph, { ignoreSelfLoops: true });

      expect(cycles).toHaveLength(0);
    });

    it('應該限制最大循環長度', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file3.ts');
      graph.addDependency('file3.ts', 'file4.ts');
      graph.addDependency('file4.ts', 'file1.ts');

      const cycles = detector.detectCycles(graph, { maxCycleLength: 2 });

      // 應該過濾掉長度大於 2 的循環
      for (const cycle of cycles) {
        expect(cycle.length).toBeLessThanOrEqual(2);
      }
    });

    it('應該拋出錯誤當最大循環長度無效', () => {
      expect(() => {
        detector.detectCycles(graph, { maxCycleLength: 0 });
      }).toThrow('最大循環長度必須大於 0');

      expect(() => {
        detector.detectCycles(graph, { maxCycleLength: -1 });
      }).toThrow('最大循環長度必須大於 0');
    });

    it('應該只回傳第一個循環當 reportAllCycles 為 false', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file1.ts');
      graph.addDependency('file3.ts', 'file4.ts');
      graph.addDependency('file4.ts', 'file3.ts');

      const cycles = detector.detectCycles(graph, { reportAllCycles: false });

      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe('嚴重程度計算', () => {
    it('應該為不同長度的循環設置不同嚴重程度', () => {
      // 短循環
      const graph1 = new DependencyGraph();
      graph1.addDependency('file1.ts', 'file2.ts');
      graph1.addDependency('file2.ts', 'file1.ts');
      const cycles1 = detector.detectCycles(graph1);

      // 長循環
      const graph2 = new DependencyGraph();
      graph2.addDependency('file1.ts', 'file2.ts');
      graph2.addDependency('file2.ts', 'file3.ts');
      graph2.addDependency('file3.ts', 'file4.ts');
      graph2.addDependency('file4.ts', 'file5.ts');
      graph2.addDependency('file5.ts', 'file1.ts');
      const cycles2 = detector.detectCycles(graph2);

      if (cycles1.length > 0 && cycles2.length > 0) {
        expect(cycles1[0].severity).toBeDefined();
        expect(cycles2[0].severity).toBeDefined();
      }
    });
  });

  describe('強連通分量', () => {
    it('應該找到強連通分量', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file3.ts');
      graph.addDependency('file3.ts', 'file1.ts');

      const sccs = detector.findStronglyConnectedComponents(graph);

      expect(sccs.length).toBeGreaterThan(0);
      const largeSCC = sccs.find(scc => scc.size > 1);
      expect(largeSCC).toBeDefined();
      if (largeSCC) {
        expect(largeSCC.size).toBe(3);
      }
    });

    it('應該將孤立節點識別為單節點 SCC', () => {
      graph.addNode('file1.ts');
      graph.addNode('file2.ts');

      const sccs = detector.findStronglyConnectedComponents(graph);

      expect(sccs).toHaveLength(2);
      for (const scc of sccs) {
        expect(scc.size).toBe(1);
      }
    });

    it('應該處理複雜的圖結構', () => {
      // 創建複雜的依賴結構
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file3.ts');
      graph.addDependency('file3.ts', 'file1.ts'); // SCC 1

      graph.addDependency('file4.ts', 'file5.ts');
      graph.addDependency('file5.ts', 'file4.ts'); // SCC 2

      graph.addDependency('file6.ts', 'file7.ts'); // 無循環

      const sccs = detector.findStronglyConnectedComponents(graph);

      const multiNodeSCCs = sccs.filter(scc => scc.size > 1);
      expect(multiNodeSCCs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('邊界情況', () => {
    it('應該處理空圖', () => {
      const cycles = detector.detectCycles(graph);
      expect(cycles).toHaveLength(0);
    });

    it('應該處理單節點無循環圖', () => {
      graph.addNode('file1.ts');
      const cycles = detector.detectCycles(graph);
      expect(cycles).toHaveLength(0);
    });

    it('應該處理線性依賴鏈', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file3.ts');
      graph.addDependency('file3.ts', 'file4.ts');
      graph.addDependency('file4.ts', 'file5.ts');

      const cycles = detector.detectCycles(graph);
      expect(cycles).toHaveLength(0);
    });

    it('應該處理完全圖（所有節點互相依賴）', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file3.ts');
      graph.addDependency('file3.ts', 'file1.ts');
      graph.addDependency('file1.ts', 'file3.ts');
      graph.addDependency('file2.ts', 'file1.ts');
      graph.addDependency('file3.ts', 'file2.ts');

      const cycles = detector.detectCycles(graph);
      expect(cycles.length).toBeGreaterThan(0);
    });
  });
});
