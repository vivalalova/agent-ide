import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraph } from '@core/dependency/dependency-graph.js';
import { CycleDetector } from '@core/dependency/cycle-detector.js';
import { calculateCycleSeverity } from '@core/dependency/types.js';

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  describe('節點操作', () => {
    it('應該新增節點', () => {
      graph.addNode('/src/a.ts');
      expect(graph.hasNode('/src/a.ts')).toBe(true);
      expect(graph.getNodeCount()).toBe(1);
    });

    it('應該避免重複新增節點', () => {
      graph.addNode('/src/a.ts');
      graph.addNode('/src/a.ts');
      expect(graph.getNodeCount()).toBe(1);
    });

    it('應該拋出錯誤當節點路徑為空', () => {
      expect(() => graph.addNode('')).toThrow('檔案路徑不能為空');
      expect(() => graph.addNode('   ')).toThrow('檔案路徑不能為空');
    });

    it('應該移除節點及其相關邊', () => {
      graph.addNode('/src/a.ts');
      graph.addNode('/src/b.ts');
      graph.addDependency('/src/a.ts', '/src/b.ts');

      graph.removeNode('/src/a.ts');

      expect(graph.hasNode('/src/a.ts')).toBe(false);
      expect(graph.getNodeCount()).toBe(1);
      expect(graph.getEdgeCount()).toBe(0);
    });

    it('應該移除所有指向該節點的邊', () => {
      graph.addNode('/src/a.ts');
      graph.addNode('/src/b.ts');
      graph.addNode('/src/c.ts');
      graph.addDependency('/src/a.ts', '/src/c.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      graph.removeNode('/src/c.ts');

      expect(graph.getEdgeCount()).toBe(0);
      expect(graph.getDependencies('/src/a.ts')).toEqual([]);
      expect(graph.getDependencies('/src/b.ts')).toEqual([]);
    });

    it('應該安全處理移除不存在的節點', () => {
      expect(() => graph.removeNode('/src/nonexistent.ts')).not.toThrow();
      expect(graph.getNodeCount()).toBe(0);
    });
  });

  describe('邊操作', () => {
    it('應該新增依賴關係', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');

      expect(graph.hasDependency('/src/a.ts', '/src/b.ts')).toBe(true);
      expect(graph.getEdgeCount()).toBe(1);
    });

    it('應該自動新增不存在的節點', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');

      expect(graph.hasNode('/src/a.ts')).toBe(true);
      expect(graph.hasNode('/src/b.ts')).toBe(true);
      expect(graph.getNodeCount()).toBe(2);
    });

    it('應該移除依賴關係', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.removeDependency('/src/a.ts', '/src/b.ts');

      expect(graph.hasDependency('/src/a.ts', '/src/b.ts')).toBe(false);
      expect(graph.getEdgeCount()).toBe(0);
    });

    it('應該安全處理移除不存在的依賴', () => {
      expect(() => graph.removeDependency('/src/a.ts', '/src/b.ts')).not.toThrow();
    });

    it('應該正確處理自迴圈依賴', () => {
      graph.addDependency('/src/a.ts', '/src/a.ts');

      expect(graph.hasDependency('/src/a.ts', '/src/a.ts')).toBe(true);
      expect(graph.getDependencies('/src/a.ts')).toEqual(['/src/a.ts']);
      expect(graph.getDependents('/src/a.ts')).toEqual(['/src/a.ts']);
    });
  });

  describe('查詢操作', () => {
    beforeEach(() => {
      // 建立測試圖：a -> b -> c
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
    });

    it('應該取得直接依賴', () => {
      expect(graph.getDependencies('/src/a.ts')).toEqual(['/src/b.ts']);
      expect(graph.getDependencies('/src/b.ts')).toEqual(['/src/c.ts']);
      expect(graph.getDependencies('/src/c.ts')).toEqual([]);
    });

    it('應該取得直接依賴者', () => {
      expect(graph.getDependents('/src/a.ts')).toEqual([]);
      expect(graph.getDependents('/src/b.ts')).toEqual(['/src/a.ts']);
      expect(graph.getDependents('/src/c.ts')).toEqual(['/src/b.ts']);
    });

    it('應該取得傳遞依賴', () => {
      const transitiveDeps = graph.getTransitiveDependencies('/src/a.ts');
      expect(transitiveDeps).toContain('/src/b.ts');
      expect(transitiveDeps).toContain('/src/c.ts');
      expect(transitiveDeps.length).toBe(2);
    });

    it('應該取得傳遞依賴者', () => {
      const transitiveDependents = graph.getTransitiveDependents('/src/c.ts');
      expect(transitiveDependents).toContain('/src/a.ts');
      expect(transitiveDependents).toContain('/src/b.ts');
      expect(transitiveDependents.length).toBe(2);
    });

    it('應該處理循環依賴的傳遞依賴', () => {
      // 建立循環：a -> b -> c -> a
      graph.addDependency('/src/c.ts', '/src/a.ts');

      const transitiveDeps = graph.getTransitiveDependencies('/src/a.ts');
      expect(transitiveDeps).toContain('/src/a.ts');
      expect(transitiveDeps).toContain('/src/b.ts');
      expect(transitiveDeps).toContain('/src/c.ts');
    });

    it('應該回傳空陣列對不存在的節點', () => {
      expect(graph.getDependencies('/nonexistent.ts')).toEqual([]);
      expect(graph.getDependents('/nonexistent.ts')).toEqual([]);
    });

    it('應該取得節點資訊', () => {
      const nodeInfo = graph.getNodeInfo('/src/b.ts');

      expect(nodeInfo).toBeDefined();
      expect(nodeInfo?.filePath).toBe('/src/b.ts');
      expect(nodeInfo?.inDegree).toBe(1);
      expect(nodeInfo?.outDegree).toBe(1);
      expect(nodeInfo?.dependencies).toEqual(['/src/c.ts']);
      expect(nodeInfo?.dependents).toEqual(['/src/a.ts']);
    });

    it('應該回傳 undefined 對不存在的節點資訊', () => {
      expect(graph.getNodeInfo('/nonexistent.ts')).toBeUndefined();
    });
  });

  describe('圖統計', () => {
    it('應該正確計算空圖的統計資訊', () => {
      expect(graph.getNodeCount()).toBe(0);
      expect(graph.getEdgeCount()).toBe(0);
      expect(graph.isEmpty()).toBe(true);
    });

    it('應該正確計算節點和邊數量', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/a.ts', '/src/c.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      expect(graph.getNodeCount()).toBe(3);
      expect(graph.getEdgeCount()).toBe(3);
      expect(graph.isEmpty()).toBe(false);
    });

    it('應該取得所有節點', () => {
      graph.addNode('/src/a.ts');
      graph.addNode('/src/b.ts');
      graph.addNode('/src/c.ts');

      const nodes = graph.getAllNodes();
      expect(nodes).toHaveLength(3);
      expect(nodes).toContain('/src/a.ts');
      expect(nodes).toContain('/src/b.ts');
      expect(nodes).toContain('/src/c.ts');
    });

    it('應該取得所有邊', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      const edges = graph.getAllEdges();
      expect(edges).toHaveLength(2);
      expect(edges[0]).toMatchObject({
        from: '/src/a.ts',
        to: '/src/b.ts',
        weight: 1
      });
    });
  });

  describe('拓撲排序', () => {
    it('應該正確排序無環圖', () => {
      // a -> b -> c, d -> e
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/d.ts', '/src/e.ts');

      const result = graph.topologicalSort();

      expect(result.hasCycle).toBe(false);
      expect(result.sortedFiles).toHaveLength(5);
      expect(result.cycleFiles).toBeUndefined();

      // 檢查順序：a 必須在 b 之前，b 必須在 c 之前
      const aIndex = result.sortedFiles.indexOf('/src/a.ts');
      const bIndex = result.sortedFiles.indexOf('/src/b.ts');
      const cIndex = result.sortedFiles.indexOf('/src/c.ts');

      expect(aIndex).toBeLessThan(bIndex);
      expect(bIndex).toBeLessThan(cIndex);
    });

    it('應該檢測循環依賴', () => {
      // a -> b -> c -> a
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/a.ts');

      const result = graph.topologicalSort();

      expect(result.hasCycle).toBe(true);
      expect(result.cycleFiles).toBeDefined();
      expect(result.cycleFiles).toHaveLength(3);
    });

    it('應該正確處理空圖', () => {
      const result = graph.topologicalSort();

      expect(result.hasCycle).toBe(false);
      expect(result.sortedFiles).toEqual([]);
    });

    it('應該正確處理單一節點', () => {
      graph.addNode('/src/a.ts');

      const result = graph.topologicalSort();

      expect(result.hasCycle).toBe(false);
      expect(result.sortedFiles).toEqual(['/src/a.ts']);
    });

    it('應該檢測自迴圈', () => {
      graph.addDependency('/src/a.ts', '/src/a.ts');

      const result = graph.topologicalSort();

      expect(result.hasCycle).toBe(true);
      expect(result.cycleFiles).toContain('/src/a.ts');
    });
  });

  describe('圖連通性', () => {
    it('應該識別連通圖', () => {
      // a -> b -> c
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      expect(graph.isConnected()).toBe(true);
    });

    it('應該識別不連通圖', () => {
      // a -> b, c -> d (兩個獨立的子圖)
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');

      expect(graph.isConnected()).toBe(false);
    });

    it('應該認為空圖是連通的', () => {
      expect(graph.isConnected()).toBe(true);
    });

    it('應該認為單節點圖是連通的', () => {
      graph.addNode('/src/a.ts');
      expect(graph.isConnected()).toBe(true);
    });

    it('應該處理反向連接', () => {
      // a -> b <- c (透過反向邊也是連通的)
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/c.ts', '/src/b.ts');

      expect(graph.isConnected()).toBe(true);
    });
  });

  describe('孤立節點', () => {
    it('應該找出孤立節點', () => {
      graph.addNode('/src/a.ts'); // 孤立
      graph.addDependency('/src/b.ts', '/src/c.ts'); // 有連接
      graph.addNode('/src/d.ts'); // 孤立

      const orphaned = graph.getOrphanedNodes();

      expect(orphaned).toHaveLength(2);
      expect(orphaned).toContain('/src/a.ts');
      expect(orphaned).toContain('/src/d.ts');
    });

    it('應該回傳空陣列當沒有孤立節點', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');

      const orphaned = graph.getOrphanedNodes();

      expect(orphaned).toEqual([]);
    });

    it('應該回傳空陣列對空圖', () => {
      expect(graph.getOrphanedNodes()).toEqual([]);
    });

    it('應該不認為有連接的節點是孤立的', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/c.ts', '/src/b.ts');

      // b 有入邊，a 有出邊，c 有出邊
      const orphaned = graph.getOrphanedNodes();

      expect(orphaned).toEqual([]);
    });
  });

  describe('序列化與反序列化', () => {
    it('應該正確序列化圖', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      const serialized = graph.serialize();

      expect(serialized.nodes).toHaveLength(3);
      expect(serialized.edges).toHaveLength(2);
      expect(serialized.metadata?.nodeCount).toBe(3);
      expect(serialized.metadata?.edgeCount).toBe(2);
    });

    it('應該正確反序列化圖', () => {
      const serialized = {
        nodes: ['/src/a.ts', '/src/b.ts', '/src/c.ts'],
        edges: [
          { from: '/src/a.ts', to: '/src/b.ts', weight: 1 },
          { from: '/src/b.ts', to: '/src/c.ts', weight: 1 }
        ]
      };

      const deserializedGraph = DependencyGraph.deserialize(serialized);

      expect(deserializedGraph.getNodeCount()).toBe(3);
      expect(deserializedGraph.getEdgeCount()).toBe(2);
      expect(deserializedGraph.hasDependency('/src/a.ts', '/src/b.ts')).toBe(true);
    });

    it('應該拋出錯誤對無效的序列化資料', () => {
      const invalidData1 = { nodes: null, edges: [] };
      const invalidData2 = { nodes: [], edges: null };
      const invalidData3 = { edges: [] } as any;

      expect(() => DependencyGraph.deserialize(invalidData1 as any)).toThrow('無效的序列化資料格式');
      expect(() => DependencyGraph.deserialize(invalidData2 as any)).toThrow('無效的序列化資料格式');
      expect(() => DependencyGraph.deserialize(invalidData3)).toThrow('無效的序列化資料格式');
    });

    it('應該拋出錯誤對無效的邊資料', () => {
      const invalidEdgeData = {
        nodes: ['/src/a.ts'],
        edges: [{ from: null, to: '/src/b.ts' }]
      };

      expect(() => DependencyGraph.deserialize(invalidEdgeData as any)).toThrow('邊資料格式無效');
    });

    it('應該透過序列化實現深拷貝', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      const cloned = graph.clone();

      // 修改原圖
      graph.addDependency('/src/b.ts', '/src/c.ts');

      // 檢查克隆圖未受影響
      expect(cloned.getEdgeCount()).toBe(1);
      expect(graph.getEdgeCount()).toBe(2);
    });
  });

  describe('清空與複製', () => {
    it('應該清空圖', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      graph.clear();

      expect(graph.getNodeCount()).toBe(0);
      expect(graph.getEdgeCount()).toBe(0);
      expect(graph.isEmpty()).toBe(true);
    });

    it('應該正確複製圖', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      const cloned = graph.clone();

      expect(cloned.getNodeCount()).toBe(graph.getNodeCount());
      expect(cloned.getEdgeCount()).toBe(graph.getEdgeCount());
      expect(cloned.hasDependency('/src/a.ts', '/src/b.ts')).toBe(true);
    });

    it('複製的圖應該獨立於原圖', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      const cloned = graph.clone();

      // 修改原圖
      graph.addNode('/src/d.ts');

      expect(graph.getNodeCount()).toBe(3);
      expect(cloned.getNodeCount()).toBe(2);
    });
  });
});

describe('CycleDetector', () => {
  let detector: CycleDetector;
  let graph: DependencyGraph;

  beforeEach(() => {
    detector = new CycleDetector();
    graph = new DependencyGraph();
  });

  describe('循環檢測', () => {
    it('應該檢測簡單循環 A -> B -> A', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0].length).toBe(2);
    });

    it('應該檢測三節點循環 A -> B -> C -> A', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/a.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0].length).toBe(3);
    });

    it('應該回傳空陣列對無環圖', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles).toEqual([]);
    });

    it('應該檢測自迴圈當 ignoreSelfLoops 為 false', () => {
      graph.addDependency('/src/a.ts', '/src/a.ts');

      const cycles = detector.detectCycles(graph, {
        ignoreSelfLoops: false,
        maxCycleLength: 20,
        reportAllCycles: false
      });

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0].cycle).toEqual(['/src/a.ts']);
      expect(cycles[0].length).toBe(1);
    });

    it('應該忽略自迴圈當 ignoreSelfLoops 為 true', () => {
      graph.addDependency('/src/a.ts', '/src/a.ts');

      const cycles = detector.detectCycles(graph, {
        ignoreSelfLoops: true,
        maxCycleLength: 20,
        reportAllCycles: false
      });

      expect(cycles).toEqual([]);
    });

    it('應該預設忽略自迴圈', () => {
      graph.addDependency('/src/a.ts', '/src/a.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles).toEqual([]);
    });

    it('應該尊重 maxCycleLength 限制', () => {
      // 建立長度為 5 的循環
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');
      graph.addDependency('/src/d.ts', '/src/e.ts');
      graph.addDependency('/src/e.ts', '/src/a.ts');

      const cyclesWithLimit3 = detector.detectCycles(graph, {
        maxCycleLength: 3,
        reportAllCycles: false,
        ignoreSelfLoops: true
      });

      expect(cyclesWithLimit3).toEqual([]);

      const cyclesWithLimit10 = detector.detectCycles(graph, {
        maxCycleLength: 10,
        reportAllCycles: false,
        ignoreSelfLoops: true
      });

      expect(cyclesWithLimit10.length).toBeGreaterThan(0);
    });

    it('應該拋出錯誤當 maxCycleLength 小於等於 0', () => {
      expect(() => detector.detectCycles(graph, {
        maxCycleLength: 0,
        reportAllCycles: false,
        ignoreSelfLoops: true
      })).toThrow('最大循環長度必須大於 0');

      expect(() => detector.detectCycles(graph, {
        maxCycleLength: -1,
        reportAllCycles: false,
        ignoreSelfLoops: true
      })).toThrow('最大循環長度必須大於 0');
    });

    it('應該正確計算循環嚴重程度', () => {
      // 短循環 (length <= 3): low
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');

      const shortCycle = detector.detectCycles(graph);
      expect(shortCycle[0].severity).toBe('low');

      // 中等循環 (4 <= length <= 6): medium
      const graph2 = new DependencyGraph();
      graph2.addDependency('/src/a.ts', '/src/b.ts');
      graph2.addDependency('/src/b.ts', '/src/c.ts');
      graph2.addDependency('/src/c.ts', '/src/d.ts');
      graph2.addDependency('/src/d.ts', '/src/a.ts');

      const mediumCycle = detector.detectCycles(graph2);
      expect(mediumCycle[0].severity).toBe('medium');
    });

    it('應該處理複雜的多個循環', () => {
      // 循環 1: a -> b -> a
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');

      // 循環 2: c -> d -> e -> c
      graph.addDependency('/src/c.ts', '/src/d.ts');
      graph.addDependency('/src/d.ts', '/src/e.ts');
      graph.addDependency('/src/e.ts', '/src/c.ts');

      const cycles = detector.detectCycles(graph, {
        reportAllCycles: true,
        maxCycleLength: 20,
        ignoreSelfLoops: true
      });

      expect(cycles.length).toBeGreaterThanOrEqual(2);
    });

    it('應該在 reportAllCycles=false 時只回傳第一個循環', () => {
      // 建立多個循環
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');
      graph.addDependency('/src/d.ts', '/src/c.ts');

      const cycles = detector.detectCycles(graph, {
        reportAllCycles: false,
        maxCycleLength: 20,
        ignoreSelfLoops: true
      });

      expect(cycles.length).toBeLessThanOrEqual(2); // 每個 SCC 一個
    });
  });

  describe('強連通分量檢測', () => {
    it('應該找出單一 SCC', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/a.ts');

      const sccs = detector.findStronglyConnectedComponents(graph);

      const largeSCC = sccs.find(scc => scc.size > 1);
      expect(largeSCC).toBeDefined();
      expect(largeSCC!.size).toBe(3);
    });

    it('應該找出多個獨立的 SCC', () => {
      // SCC 1: a -> b -> a
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');

      // SCC 2: c -> d -> c
      graph.addDependency('/src/c.ts', '/src/d.ts');
      graph.addDependency('/src/d.ts', '/src/c.ts');

      // 獨立節點 e
      graph.addNode('/src/e.ts');

      const sccs = detector.findStronglyConnectedComponents(graph);

      expect(sccs.length).toBeGreaterThanOrEqual(3);
      expect(sccs.filter(scc => scc.size > 1).length).toBe(2);
    });

    it('應該處理無環圖（每個節點是自己的 SCC）', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      const sccs = detector.findStronglyConnectedComponents(graph);

      expect(sccs.every(scc => scc.size === 1)).toBe(true);
    });

    it('應該處理空圖', () => {
      const sccs = detector.findStronglyConnectedComponents(graph);

      expect(sccs).toEqual([]);
    });

    it('應該計算 SCC 的複雜度', () => {
      // 建立一個複雜的循環
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/a.ts');
      graph.addDependency('/src/a.ts', '/src/c.ts'); // 額外的內部連接

      const sccs = detector.findStronglyConnectedComponents(graph);
      const scc = sccs.find(s => s.size > 1);

      expect(scc).toBeDefined();
      expect(scc!.cycleComplexity).toBeGreaterThan(0);
    });
  });

  describe('hasCycles 快速檢測', () => {
    it('應該回傳 true 對有環圖', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');

      expect(detector.hasCycles(graph)).toBe(true);
    });

    it('應該回傳 false 對無環圖', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      expect(detector.hasCycles(graph)).toBe(false);
    });

    it('應該回傳 false 對空圖', () => {
      expect(detector.hasCycles(graph)).toBe(false);
    });
  });

  describe('循環統計', () => {
    it('應該計算正確的統計資訊', () => {
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
      expect(stats.cyclesBySeverity).toBeDefined();
    });

    it('應該回傳零統計對無環圖', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');

      const stats = detector.getCycleStatistics(graph);

      expect(stats.totalCycles).toBe(0);
      expect(stats.averageCycleLength).toBe(0);
      expect(stats.maxCycleLength).toBe(0);
      expect(stats.cyclesBySeverity).toEqual({ low: 0, medium: 0, high: 0 });
    });

    it('應該正確分類嚴重程度', () => {
      // 建立不同長度的循環
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts'); // length 2 -> low

      const stats = detector.getCycleStatistics(graph);

      expect(stats.cyclesBySeverity.low +
             stats.cyclesBySeverity.medium +
             stats.cyclesBySeverity.high).toBe(stats.totalCycles);
    });
  });

  describe('修復策略建議', () => {
    it('應該建議移除自我引用對長度 1 的循環', () => {
      graph.addDependency('/src/a.ts', '/src/a.ts');
      const cycles = detector.detectCycles(graph, { ignoreSelfLoops: false, maxCycleLength: 20, reportAllCycles: false });

      const suggestions = detector.suggestFixStrategies(cycles);

      expect(suggestions[0].strategy).toBe('remove_self_reference');
      expect(suggestions[0].priority).toBe('low');
    });

    it('應該建議提取共同依賴對長度 2 的循環', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');
      const cycles = detector.detectCycles(graph);

      const suggestions = detector.suggestFixStrategies(cycles);

      expect(suggestions[0].strategy).toBe('extract_common_dependency');
    });

    it('應該建議依賴倒置對中等長度循環', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/a.ts');
      const cycles = detector.detectCycles(graph);

      const suggestions = detector.suggestFixStrategies(cycles);

      expect(suggestions[0].strategy).toBe('dependency_inversion');
    });

    it('應該建議架構重構對長循環', () => {
      // 建立長度 > 5 的循環
      for (let i = 0; i < 7; i++) {
        const current = `/src/${String.fromCharCode(97 + i)}.ts`;
        const next = `/src/${String.fromCharCode(97 + ((i + 1) % 7))}.ts`;
        graph.addDependency(current, next);
      }
      const cycles = detector.detectCycles(graph);

      const suggestions = detector.suggestFixStrategies(cycles);

      expect(suggestions[0].strategy).toBe('architectural_refactoring');
      expect(suggestions[0].priority).toBe('high');
    });

    it('應該為所有循環提供建議', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');
      graph.addDependency('/src/d.ts', '/src/c.ts');

      const cycles = detector.detectCycles(graph, { reportAllCycles: true, maxCycleLength: 20, ignoreSelfLoops: true });
      const suggestions = detector.suggestFixStrategies(cycles);

      expect(suggestions.length).toBe(cycles.length);
      expect(suggestions.every(s => s.strategy && s.description && s.priority)).toBe(true);
    });
  });

  describe('邊界條件', () => {
    it('應該處理非常大的圖', () => {
      // 建立 100 個節點的線性圖
      for (let i = 0; i < 99; i++) {
        graph.addDependency(`/src/file${i}.ts`, `/src/file${i + 1}.ts`);
      }

      expect(() => detector.detectCycles(graph)).not.toThrow();
      expect(detector.hasCycles(graph)).toBe(false);
    });

    it('應該處理密集連接的圖', () => {
      // 建立完全圖（每個節點連接到其他所有節點）
      const nodes = ['/src/a.ts', '/src/b.ts', '/src/c.ts', '/src/d.ts'];

      for (const from of nodes) {
        for (const to of nodes) {
          if (from !== to) {
            graph.addDependency(from, to);
          }
        }
      }

      expect(detector.hasCycles(graph)).toBe(true);
      const sccs = detector.findStronglyConnectedComponents(graph);
      expect(sccs.some(scc => scc.size === nodes.length)).toBe(true);
    });

    it('應該處理單向長鏈', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');
      graph.addDependency('/src/d.ts', '/src/e.ts');

      const cycles = detector.detectCycles(graph);

      expect(cycles).toEqual([]);
      expect(detector.hasCycles(graph)).toBe(false);
    });

    it('應該處理複雜的 SCC 結構', () => {
      // 建立一個複雜的圖，包含多條路徑
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/a.ts', '/src/c.ts');
      graph.addDependency('/src/b.ts', '/src/d.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');
      graph.addDependency('/src/d.ts', '/src/a.ts'); // 創建循環

      const sccs = detector.findStronglyConnectedComponents(graph);
      const largeSCC = sccs.find(scc => scc.size > 1);

      expect(largeSCC).toBeDefined();
      expect(largeSCC!.size).toBeGreaterThanOrEqual(4);
    });

    it('應該處理孤立的 SCC 和連接的 SCC', () => {
      // SCC 1: 孤立的循環
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');

      // SCC 2: 連接到 SCC 1 的節點
      graph.addDependency('/src/c.ts', '/src/a.ts');

      const sccs = detector.findStronglyConnectedComponents(graph);

      expect(sccs.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('calculateCycleSeverity', () => {
  it('應該回傳 low 對長度 <= 3', () => {
    expect(calculateCycleSeverity(1)).toBe('low');
    expect(calculateCycleSeverity(2)).toBe('low');
    expect(calculateCycleSeverity(3)).toBe('low');
  });

  it('應該回傳 medium 對長度 4-6', () => {
    expect(calculateCycleSeverity(4)).toBe('medium');
    expect(calculateCycleSeverity(5)).toBe('medium');
    expect(calculateCycleSeverity(6)).toBe('medium');
  });

  it('應該回傳 high 對長度 > 6', () => {
    expect(calculateCycleSeverity(7)).toBe('high');
    expect(calculateCycleSeverity(10)).toBe('high');
    expect(calculateCycleSeverity(100)).toBe('high');
  });
});
