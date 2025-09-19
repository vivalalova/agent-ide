/**
 * CycleDetector 類別測試
 * 測試循環依賴檢測、強連通分量識別功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CycleDetector } from '../../../src/core/dependency/cycle-detector';
import { DependencyGraph } from '../../../src/core/dependency/dependency-graph';
import type { 
  CircularDependency, 
  StronglyConnectedComponent,
  CycleDetectionOptions 
} from '../../../src/core/dependency/types';

describe('CycleDetector', () => {
  let detector: CycleDetector;
  let graph: DependencyGraph;

  beforeEach(() => {
    detector = new CycleDetector();
    graph = new DependencyGraph();
  });

  describe('基本循環檢測', () => {
    it('應該檢測簡單的二元循環', () => {
      // A -> B -> A
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'A');
      
      const cycles = detector.detectCycles(graph);
      
      expect(cycles).toHaveLength(1);
      expect(cycles[0].cycle).toHaveLength(2);
      expect(cycles[0].cycle).toContain('A');
      expect(cycles[0].cycle).toContain('B');
      expect(cycles[0].severity).toBe('low');
    });

    it('應該檢測三元循環', () => {
      // A -> B -> C -> A
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'C');
      graph.addDependency('C', 'A');
      
      const cycles = detector.detectCycles(graph);
      
      expect(cycles).toHaveLength(1);
      expect(cycles[0].cycle).toHaveLength(3);
      expect(cycles[0].cycle).toContain('A');
      expect(cycles[0].cycle).toContain('B');
      expect(cycles[0].cycle).toContain('C');
      expect(cycles[0].severity).toBe('low');
    });

    it('應該檢測複雜循環', () => {
      // A -> B -> C -> D -> B (B-C-D 形成循環)
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'C');
      graph.addDependency('C', 'D');
      graph.addDependency('D', 'B');
      
      const cycles = detector.detectCycles(graph);
      
      expect(cycles).toHaveLength(1);
      expect(cycles[0].cycle).toHaveLength(3);
      expect(cycles[0].cycle).toContain('B');
      expect(cycles[0].cycle).toContain('C');
      expect(cycles[0].cycle).toContain('D');
    });

    it('應該檢測多個獨立循環', () => {
      // 循環1: A -> B -> A
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'A');
      
      // 循環2: C -> D -> E -> C
      graph.addDependency('C', 'D');
      graph.addDependency('D', 'E');
      graph.addDependency('E', 'C');
      
      const cycles = detector.detectCycles(graph);
      
      expect(cycles).toHaveLength(2);
      
      const cycleLengths = cycles.map(c => c.cycle.length).sort();
      expect(cycleLengths).toEqual([2, 3]);
    });

    it('應該正確處理無循環圖', () => {
      // A -> B -> C (無循環)
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'C');
      
      const cycles = detector.detectCycles(graph);
      
      expect(cycles).toHaveLength(0);
    });
  });

  describe('自迴圈檢測', () => {
    it('應該檢測自迴圈', () => {
      // A -> A
      graph.addDependency('A', 'A');
      
      const options: CycleDetectionOptions = {
        maxCycleLength: 20,
        reportAllCycles: true,
        ignoreSelfLoops: false
      };
      
      const cycles = detector.detectCycles(graph, options);
      
      expect(cycles).toHaveLength(1);
      expect(cycles[0].cycle).toEqual(['A']);
      expect(cycles[0].severity).toBe('low');
    });

    it('應該能忽略自迴圈當選項設定時', () => {
      graph.addDependency('A', 'A');
      
      const options: CycleDetectionOptions = {
        maxCycleLength: 20,
        reportAllCycles: true,
        ignoreSelfLoops: true
      };
      
      const cycles = detector.detectCycles(graph, options);
      
      expect(cycles).toHaveLength(0);
    });
  });

  describe('循環嚴重程度評估', () => {
    it('應該將短循環標記為低嚴重程度', () => {
      // A -> B -> C -> A (長度 3)
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'C');
      graph.addDependency('C', 'A');
      
      const cycles = detector.detectCycles(graph);
      
      expect(cycles[0].severity).toBe('low');
    });

    it('應該將中等循環標記為中等嚴重程度', () => {
      // 建立長度為 5 的循環
      const files = ['A', 'B', 'C', 'D', 'E'];
      for (let i = 0; i < files.length; i++) {
        const next = (i + 1) % files.length;
        graph.addDependency(files[i], files[next]);
      }
      
      const cycles = detector.detectCycles(graph);
      
      expect(cycles[0].severity).toBe('medium');
    });

    it('應該將長循環標記為高嚴重程度', () => {
      // 建立長度為 8 的循環
      const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      for (let i = 0; i < files.length; i++) {
        const next = (i + 1) % files.length;
        graph.addDependency(files[i], files[next]);
      }
      
      const cycles = detector.detectCycles(graph);
      
      expect(cycles[0].severity).toBe('high');
    });
  });

  describe('強連通分量檢測', () => {
    it('應該找出簡單的強連通分量', () => {
      // A -> B -> A
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'A');
      
      const sccs = detector.findStronglyConnectedComponents(graph);
      
      expect(sccs).toHaveLength(1);
      expect(sccs[0].nodes).toHaveLength(2);
      expect(sccs[0].nodes).toContain('A');
      expect(sccs[0].nodes).toContain('B');
      expect(sccs[0].size).toBe(2);
    });

    it('應該找出複雜圖中的所有強連通分量', () => {
      // 建立包含多個 SCC 的圖
      // SCC1: A -> B -> A
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'A');
      
      // SCC2: C -> D -> E -> C
      graph.addDependency('C', 'D');
      graph.addDependency('D', 'E');
      graph.addDependency('E', 'C');
      
      // 連接兩個 SCC：B -> C
      graph.addDependency('B', 'C');
      
      const sccs = detector.findStronglyConnectedComponents(graph);
      
      expect(sccs).toHaveLength(2);
      
      const sccSizes = sccs.map(scc => scc.size).sort();
      expect(sccSizes).toEqual([2, 3]);
    });

    it('應該正確處理無循環圖（每個節點為單獨 SCC）', () => {
      // A -> B -> C
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'C');
      
      const sccs = detector.findStronglyConnectedComponents(graph);
      
      expect(sccs).toHaveLength(3);
      sccs.forEach(scc => {
        expect(scc.size).toBe(1);
      });
    });
  });

  describe('循環路徑追蹤', () => {
    it('應該提供完整的循環路徑', () => {
      // A -> B -> C -> A
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'C');
      graph.addDependency('C', 'A');
      
      const cycles = detector.detectCycles(graph);
      
      expect(cycles[0].cycle).toHaveLength(3);
      
      // 檢查循環路徑的連續性
      const cycle = cycles[0].cycle;
      for (let i = 0; i < cycle.length; i++) {
        const current = cycle[i];
        const next = cycle[(i + 1) % cycle.length];
        expect(graph.hasDependency(current, next)).toBe(true);
      }
    });

    it('應該找出循環路徑', () => {
      // 建立包含循環的圖
      // A -> B -> C -> A
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'C');
      graph.addDependency('C', 'A');
      
      const cycles = detector.detectCycles(graph);
      
      expect(cycles).toHaveLength(1);
      expect(cycles[0].cycle).toHaveLength(3);
      expect(cycles[0].cycle).toContain('A');
      expect(cycles[0].cycle).toContain('B');
      expect(cycles[0].cycle).toContain('C');
    });
  });

  describe('檢測選項', () => {
    it('應該限制最大循環長度', () => {
      // 建立長度為 5 的循環
      const files = ['A', 'B', 'C', 'D', 'E'];
      for (let i = 0; i < files.length; i++) {
        const next = (i + 1) % files.length;
        graph.addDependency(files[i], files[next]);
      }
      
      const options: CycleDetectionOptions = {
        maxCycleLength: 3,
        reportAllCycles: true,
        ignoreSelfLoops: false
      };
      
      const cycles = detector.detectCycles(graph, options);
      
      expect(cycles).toHaveLength(0); // 循環長度超過限制，不應該回報
    });

    it('應該能報告所有循環當選項啟用時', () => {
      // 建立包含嵌套循環的複雜圖
      // A -> B -> A (小循環)
      // A -> C -> D -> A (大循環，包含 A)
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'A');
      graph.addDependency('A', 'C');
      graph.addDependency('C', 'D');
      graph.addDependency('D', 'A');
      
      const options: CycleDetectionOptions = {
        maxCycleLength: 20,
        reportAllCycles: true,
        ignoreSelfLoops: false
      };
      
      const cycles = detector.detectCycles(graph, options);
      
      expect(cycles.length).toBeGreaterThanOrEqual(2); // 應該報告多個循環
    });
  });

  describe('效能測試', () => {
    it('應該在合理時間內處理大圖', () => {
      // 建立相對大的圖（50個節點）
      const nodeCount = 50;
      
      for (let i = 0; i < nodeCount - 1; i++) {
        graph.addDependency(`node${i}`, `node${i + 1}`);
      }
      
      // 新增一些循環
      graph.addDependency(`node${nodeCount - 1}`, 'node0'); // 大循環，但長度超過限制
      graph.addDependency('node10', 'node5'); // 小循環（長度6）
      
      const options: CycleDetectionOptions = {
        maxCycleLength: 100, // 提高限制讓大循環也能被檢測到
        reportAllCycles: true,
        ignoreSelfLoops: true
      };
      
      const startTime = Date.now();
      const cycles = detector.detectCycles(graph, options);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(1000); // 應該在1秒內完成
      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe('錯誤處理', () => {
    it('應該處理空圖', () => {
      const cycles = detector.detectCycles(graph);
      
      expect(cycles).toHaveLength(0);
    });

    it('應該處理只有一個節點的圖', () => {
      graph.addNode('A');
      
      const cycles = detector.detectCycles(graph);
      
      expect(cycles).toHaveLength(0);
    });

    it('應該驗證檢測選項', () => {
      const invalidOptions: CycleDetectionOptions = {
        maxCycleLength: -1,
        reportAllCycles: true,
        ignoreSelfLoops: false
      };
      
      expect(() => {
        detector.detectCycles(graph, invalidOptions);
      }).toThrow('最大循環長度必須大於 0');
    });
  });

  describe('循環複雜度計算', () => {
    it('應該計算循環的複雜度', () => {
      // 建立具有多個入口的複雜循環
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'C');
      graph.addDependency('C', 'A');
      graph.addDependency('D', 'B'); // 外部進入循環
      graph.addDependency('C', 'E'); // 從循環出去
      
      const sccs = detector.findStronglyConnectedComponents(graph);
      const cyclicScc = sccs.find(scc => scc.size > 1);
      
      expect(cyclicScc).toBeDefined();
      expect(cyclicScc!.cycleComplexity).toBeGreaterThan(0);
    });
  });
});