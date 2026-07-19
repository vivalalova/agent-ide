/**
 * DependencyGraph 測試
 * 測試依賴圖資料結構的所有功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraph, type SerializedGraph } from '@core/foundations/dependency-graph/index.js';

// ============================================================================
// DependencyGraph Tests
// ============================================================================

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  describe('constructor', () => {
    it('應該建立空的依賴圖', () => {
      expect(graph.getNodeCount()).toBe(0);
      expect(graph.getEdgeCount()).toBe(0);
      expect(graph.isEmpty()).toBe(true);
    });
  });

  describe('addNode', () => {
    it('應該新增節點', () => {
      graph.addNode('/src/a.ts');

      expect(graph.hasNode('/src/a.ts')).toBe(true);
      expect(graph.getNodeCount()).toBe(1);
    });

    it('應該忽略重複的節點', () => {
      graph.addNode('/src/a.ts');
      graph.addNode('/src/a.ts');

      expect(graph.getNodeCount()).toBe(1);
    });

    it('應該拋出錯誤當路徑為空', () => {
      expect(() => graph.addNode('')).toThrow('檔案路徑不能為空');
    });

    it('應該拋出錯誤當路徑只有空白', () => {
      expect(() => graph.addNode('   ')).toThrow('檔案路徑不能為空');
    });
  });

  describe('removeNode', () => {
    it('應該移除節點', () => {
      graph.addNode('/src/a.ts');
      graph.removeNode('/src/a.ts');

      expect(graph.hasNode('/src/a.ts')).toBe(false);
      expect(graph.getNodeCount()).toBe(0);
    });

    it('應該移除節點時一併移除相關邊', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/c.ts', '/src/b.ts');

      graph.removeNode('/src/b.ts');

      expect(graph.hasNode('/src/b.ts')).toBe(false);
      expect(graph.getDependencies('/src/a.ts')).toEqual([]);
      expect(graph.getDependencies('/src/c.ts')).toEqual([]);
    });

    it('應該安全處理移除不存在的節點', () => {
      expect(() => graph.removeNode('/nonexistent.ts')).not.toThrow();
    });

    it('應該正確更新反向鄰接列表', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      graph.removeNode('/src/b.ts');

      expect(graph.getDependents('/src/c.ts')).toEqual([]);
    });

    it('應該使移除節點後的傳遞查詢不再回傳快取結果', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      // 先建立正向與反向傳遞查詢快取。
      expect(graph.getTransitiveDependencies('/src/a.ts')).toEqual([
        '/src/b.ts',
        '/src/c.ts'
      ]);
      expect(graph.getTransitiveDependents('/src/c.ts')).toEqual([
        '/src/b.ts',
        '/src/a.ts'
      ]);

      graph.removeNode('/src/b.ts');

      expect(graph.getTransitiveDependencies('/src/a.ts')).toEqual([]);
      expect(graph.getTransitiveDependents('/src/c.ts')).toEqual([]);
    });

    it('[audit-fix regression] 移除節點後傳遞快取的反向索引不得殘留 stale 項目', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      // 觸發正向與反向傳遞查詢快取寫入，讓反向索引累積 entry。
      graph.getTransitiveDependencies('/src/a.ts');
      graph.getTransitiveDependents('/src/c.ts');

      graph.removeNode('/src/b.ts');

      // removeNode 使快取整體失效時，兩個反向索引（transitiveDepReverseIndex /
      // transitiveDeptsReverseIndex）必須跟著同步清空；否則 stale 項目會在
      // 長生命週期 graph 中無界累積，且日後同名 key 重寫時
      // invalidateTransitiveCaches 查表會依殘留項目過度失效不相干的快取。
      const internals = graph as unknown as {
        transitiveDepReverseIndex: Map<string, Set<string>>;
        transitiveDeptsReverseIndex: Map<string, Set<string>>;
      };
      expect(internals.transitiveDepReverseIndex.size).toBe(0);
      expect(internals.transitiveDeptsReverseIndex.size).toBe(0);
    });
  });

  describe('addDependency', () => {
    it('應該新增依賴關係', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');

      expect(graph.hasDependency('/src/a.ts', '/src/b.ts')).toBe(true);
      expect(graph.getEdgeCount()).toBe(1);
    });

    it('應該自動新增不存在的節點', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');

      expect(graph.hasNode('/src/a.ts')).toBe(true);
      expect(graph.hasNode('/src/b.ts')).toBe(true);
    });

    it('應該正確更新反向鄰接列表', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');

      expect(graph.getDependents('/src/b.ts')).toContain('/src/a.ts');
    });
  });

  describe('removeDependency', () => {
    it('應該移除依賴關係', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.removeDependency('/src/a.ts', '/src/b.ts');

      expect(graph.hasDependency('/src/a.ts', '/src/b.ts')).toBe(false);
      expect(graph.getEdgeCount()).toBe(0);
    });

    it('應該安全處理移除不存在的依賴', () => {
      expect(() => graph.removeDependency('/src/a.ts', '/src/b.ts')).not.toThrow();
    });

    it('應該保留節點當移除依賴', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.removeDependency('/src/a.ts', '/src/b.ts');

      expect(graph.hasNode('/src/a.ts')).toBe(true);
      expect(graph.hasNode('/src/b.ts')).toBe(true);
    });
  });

  describe('hasNode', () => {
    it('應該回傳 true 當節點存在', () => {
      graph.addNode('/src/a.ts');

      expect(graph.hasNode('/src/a.ts')).toBe(true);
    });

    it('應該回傳 false 當節點不存在', () => {
      expect(graph.hasNode('/src/a.ts')).toBe(false);
    });
  });

  describe('hasDependency', () => {
    it('應該回傳 true 當依賴存在', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');

      expect(graph.hasDependency('/src/a.ts', '/src/b.ts')).toBe(true);
    });

    it('應該回傳 false 當依賴不存在', () => {
      graph.addNode('/src/a.ts');
      graph.addNode('/src/b.ts');

      expect(graph.hasDependency('/src/a.ts', '/src/b.ts')).toBe(false);
    });

    it('應該回傳 false 當節點不存在', () => {
      expect(graph.hasDependency('/src/a.ts', '/src/b.ts')).toBe(false);
    });
  });

  describe('getNodeCount', () => {
    it('應該回傳正確的節點數量', () => {
      graph.addNode('/src/a.ts');
      graph.addNode('/src/b.ts');
      graph.addNode('/src/c.ts');

      expect(graph.getNodeCount()).toBe(3);
    });
  });

  describe('getEdgeCount', () => {
    it('應該回傳正確的邊數量', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/a.ts', '/src/c.ts');

      expect(graph.getEdgeCount()).toBe(3);
    });
  });

  describe('isEmpty', () => {
    it('應該回傳 true 對空圖', () => {
      expect(graph.isEmpty()).toBe(true);
    });

    it('應該回傳 false 對非空圖', () => {
      graph.addNode('/src/a.ts');

      expect(graph.isEmpty()).toBe(false);
    });
  });

  describe('getDependencies', () => {
    it('應該回傳直接依賴列表', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/a.ts', '/src/c.ts');

      const deps = graph.getDependencies('/src/a.ts');

      expect(deps).toHaveLength(2);
      expect(deps).toContain('/src/b.ts');
      expect(deps).toContain('/src/c.ts');
    });

    it('應該回傳空陣列當節點無依賴', () => {
      graph.addNode('/src/a.ts');

      expect(graph.getDependencies('/src/a.ts')).toEqual([]);
    });

    it('應該回傳空陣列當節點不存在', () => {
      expect(graph.getDependencies('/nonexistent.ts')).toEqual([]);
    });
  });

  describe('getDependents', () => {
    it('應該回傳直接依賴者列表', () => {
      graph.addDependency('/src/a.ts', '/src/c.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      const dependents = graph.getDependents('/src/c.ts');

      expect(dependents).toHaveLength(2);
      expect(dependents).toContain('/src/a.ts');
      expect(dependents).toContain('/src/b.ts');
    });

    it('應該回傳空陣列當節點無依賴者', () => {
      graph.addNode('/src/a.ts');

      expect(graph.getDependents('/src/a.ts')).toEqual([]);
    });

    it('應該回傳空陣列當節點不存在', () => {
      expect(graph.getDependents('/nonexistent.ts')).toEqual([]);
    });
  });

  describe('getTransitiveDependencies', () => {
    it('應該回傳傳遞依賴', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');

      const transitive = graph.getTransitiveDependencies('/src/a.ts');

      expect(transitive).toHaveLength(3);
      expect(transitive).toContain('/src/b.ts');
      expect(transitive).toContain('/src/c.ts');
      expect(transitive).toContain('/src/d.ts');
    });

    it('應該處理菱形依賴（避免重複）', () => {
      // A → B → D
      // A → C → D
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/a.ts', '/src/c.ts');
      graph.addDependency('/src/b.ts', '/src/d.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');

      const transitive = graph.getTransitiveDependencies('/src/a.ts');

      expect(transitive).toHaveLength(3);
      expect(transitive).toContain('/src/b.ts');
      expect(transitive).toContain('/src/c.ts');
      expect(transitive).toContain('/src/d.ts');
    });

    it('應該處理循環依賴', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/a.ts');

      const transitive = graph.getTransitiveDependencies('/src/a.ts');

      // 循環依賴時，傳遞依賴可能包含所有節點（包括自己透過循環到達）
      expect(transitive).toContain('/src/b.ts');
      expect(transitive).toContain('/src/c.ts');
      // 由於 c → a，a 也可能被加入（取決於實作）
      expect(transitive.length).toBeGreaterThanOrEqual(2);
    });

    it('應該回傳空陣列當節點無依賴', () => {
      graph.addNode('/src/a.ts');

      expect(graph.getTransitiveDependencies('/src/a.ts')).toEqual([]);
    });

    it('應該在雙節點循環中排除起點本身', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');

      const transitive = graph.getTransitiveDependencies('/src/a.ts');

      expect(transitive).toEqual(['/src/b.ts']);
    });
  });

  describe('getTransitiveDependents', () => {
    it('應該回傳傳遞依賴者', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');

      const transitive = graph.getTransitiveDependents('/src/d.ts');

      expect(transitive).toHaveLength(3);
      expect(transitive).toContain('/src/a.ts');
      expect(transitive).toContain('/src/b.ts');
      expect(transitive).toContain('/src/c.ts');
    });

    it('應該處理菱形依賴', () => {
      // A → B → D
      // A → C → D
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/a.ts', '/src/c.ts');
      graph.addDependency('/src/b.ts', '/src/d.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');

      const transitive = graph.getTransitiveDependents('/src/d.ts');

      expect(transitive).toHaveLength(3);
    });

    it('應該處理循環依賴', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/a.ts');

      const transitive = graph.getTransitiveDependents('/src/a.ts');

      // 循環依賴時，傳遞依賴者可能包含所有節點
      expect(transitive.length).toBeGreaterThanOrEqual(2);
    });

    it('應該在雙節點循環中排除起點本身', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');

      const transitive = graph.getTransitiveDependents('/src/a.ts');

      expect(transitive).toEqual(['/src/b.ts']);
    });
  });

  describe('getNodeInfo', () => {
    it('應該回傳節點資訊', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/d.ts', '/src/b.ts');

      const info = graph.getNodeInfo('/src/b.ts');

      expect(info).toBeDefined();
      expect(info?.filePath).toBe('/src/b.ts');
      expect(info?.inDegree).toBe(2);  // a 和 d 依賴 b
      expect(info?.outDegree).toBe(1); // b 依賴 c
      expect(info?.dependencies).toContain('/src/c.ts');
      expect(info?.dependents).toContain('/src/a.ts');
      expect(info?.dependents).toContain('/src/d.ts');
    });

    it('應該回傳 undefined 當節點不存在', () => {
      expect(graph.getNodeInfo('/nonexistent.ts')).toBeUndefined();
    });
  });

  describe('topologicalSort', () => {
    it('應該正確排序無循環圖', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      const result = graph.topologicalSort();

      expect(result.hasCycle).toBe(false);
      expect(result.sortedFiles).toHaveLength(3);
      expect(result.cycleFiles).toBeUndefined();

      // a 應該在 b 之前，b 應該在 c 之前
      const aIndex = result.sortedFiles.indexOf('/src/a.ts');
      const bIndex = result.sortedFiles.indexOf('/src/b.ts');
      const cIndex = result.sortedFiles.indexOf('/src/c.ts');

      expect(aIndex).toBeLessThan(bIndex);
      expect(bIndex).toBeLessThan(cIndex);
    });

    it('應該檢測循環依賴', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addDependency('/src/c.ts', '/src/a.ts');

      const result = graph.topologicalSort();

      expect(result.hasCycle).toBe(true);
      expect(result.cycleFiles).toBeDefined();
      expect(result.cycleFiles?.length).toBeGreaterThan(0);
    });

    it('應該處理空圖', () => {
      const result = graph.topologicalSort();

      expect(result.hasCycle).toBe(false);
      expect(result.sortedFiles).toEqual([]);
    });

    it('應該處理孤立節點', () => {
      graph.addNode('/src/a.ts');
      graph.addNode('/src/b.ts');

      const result = graph.topologicalSort();

      expect(result.hasCycle).toBe(false);
      expect(result.sortedFiles).toHaveLength(2);
    });

    it('應該正確識別循環中的檔案', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/a.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');

      const result = graph.topologicalSort();

      expect(result.hasCycle).toBe(true);
      expect(result.cycleFiles).toContain('/src/a.ts');
      expect(result.cycleFiles).toContain('/src/b.ts');
      // c 和 d 不在循環中，應該在 sortedFiles 中
    });
  });

  describe('getAllNodes', () => {
    it('應該回傳所有節點', () => {
      graph.addNode('/src/a.ts');
      graph.addNode('/src/b.ts');
      graph.addNode('/src/c.ts');

      const nodes = graph.getAllNodes();

      expect(nodes).toHaveLength(3);
      expect(nodes).toContain('/src/a.ts');
      expect(nodes).toContain('/src/b.ts');
      expect(nodes).toContain('/src/c.ts');
    });
  });

  describe('getAllEdges', () => {
    it('應該回傳所有邊', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      const edges = graph.getAllEdges();

      expect(edges).toHaveLength(2);
      expect(edges).toContainEqual(expect.objectContaining({
        from: '/src/a.ts',
        to: '/src/b.ts',
        weight: 1,
        dependencyType: 'import',
      }));
      expect(edges).toContainEqual(expect.objectContaining({
        from: '/src/b.ts',
        to: '/src/c.ts',
        weight: 1,
        dependencyType: 'import',
      }));
    });
  });

  describe('isConnected', () => {
    it('應該回傳 true 對空圖', () => {
      expect(graph.isConnected()).toBe(true);
    });

    it('應該回傳 true 對連通圖', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      expect(graph.isConnected()).toBe(true);
    });

    it('應該回傳 false 對非連通圖', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addNode('/src/c.ts'); // 孤立節點

      expect(graph.isConnected()).toBe(false);
    });

    it('應該檢測弱連通（考慮雙向）', () => {
      // A → B ← C（弱連通）
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/c.ts', '/src/b.ts');

      expect(graph.isConnected()).toBe(true);
    });

    it('應該回傳 true 對單一節點', () => {
      graph.addNode('/src/a.ts');

      expect(graph.isConnected()).toBe(true);
    });
  });

  describe('getOrphanedNodes', () => {
    it('應該回傳孤立節點', () => {
      graph.addNode('/src/orphan.ts');
      graph.addDependency('/src/a.ts', '/src/b.ts');

      const orphaned = graph.getOrphanedNodes();

      expect(orphaned).toHaveLength(1);
      expect(orphaned).toContain('/src/orphan.ts');
    });

    it('應該不包含有依賴的節點', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');

      const orphaned = graph.getOrphanedNodes();

      expect(orphaned).not.toContain('/src/a.ts');
      expect(orphaned).not.toContain('/src/b.ts');
    });

    it('應該回傳空陣列當無孤立節點', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');

      expect(graph.getOrphanedNodes()).toEqual([]);
    });
  });

  describe('serialize / deserialize', () => {
    it('應該正確序列化圖', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      const serialized = graph.serialize();

      expect(serialized.nodes).toHaveLength(3);
      expect(serialized.edges).toHaveLength(2);
      expect(serialized.metadata?.nodeCount).toBe(3);
      expect(serialized.metadata?.edgeCount).toBe(2);
      expect(serialized.metadata?.serializedAt).toBeDefined();
    });

    it('應該正確反序列化圖', () => {
      const data: SerializedGraph = {
        nodes: ['/src/a.ts', '/src/b.ts', '/src/c.ts'],
        edges: [
          { from: '/src/a.ts', to: '/src/b.ts', weight: 1 },
          { from: '/src/b.ts', to: '/src/c.ts', weight: 1 },
        ],
      };

      const restored = DependencyGraph.deserialize(data);

      expect(restored.getNodeCount()).toBe(3);
      expect(restored.getEdgeCount()).toBe(2);
      expect(restored.hasDependency('/src/a.ts', '/src/b.ts')).toBe(true);
      expect(restored.hasDependency('/src/b.ts', '/src/c.ts')).toBe(true);
    });

    it('應該完整往返（serialize → deserialize）', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');
      graph.addNode('/src/orphan.ts');

      const serialized = graph.serialize();
      const restored = DependencyGraph.deserialize(serialized);

      expect(restored.getNodeCount()).toBe(graph.getNodeCount());
      expect(restored.getEdgeCount()).toBe(graph.getEdgeCount());
      expect(restored.hasNode('/src/orphan.ts')).toBe(true);
    });

    it('應該拋出錯誤當資料格式無效（缺少 nodes）', () => {
      const invalidData = { edges: [] } as unknown as SerializedGraph;

      expect(() => DependencyGraph.deserialize(invalidData)).toThrow('無效的序列化資料格式');
    });

    it('應該拋出錯誤當資料格式無效（缺少 edges）', () => {
      const invalidData = { nodes: [] } as unknown as SerializedGraph;

      expect(() => DependencyGraph.deserialize(invalidData)).toThrow('無效的序列化資料格式');
    });

    it('應該拋出錯誤當邊資料格式無效', () => {
      const invalidData: SerializedGraph = {
        nodes: ['/src/a.ts'],
        edges: [{ from: '', to: '/src/a.ts', weight: 1 }],
      };

      expect(() => DependencyGraph.deserialize(invalidData)).toThrow('邊資料格式無效');
    });
  });

  describe('clear', () => {
    it('應該清空圖', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.clear();

      expect(graph.isEmpty()).toBe(true);
      expect(graph.getNodeCount()).toBe(0);
      expect(graph.getEdgeCount()).toBe(0);
    });
  });

  describe('clone', () => {
    it('應該建立深拷貝', () => {
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/b.ts', '/src/c.ts');

      const cloned = graph.clone();

      expect(cloned.getNodeCount()).toBe(graph.getNodeCount());
      expect(cloned.getEdgeCount()).toBe(graph.getEdgeCount());

      // 修改原圖不應影響克隆
      graph.addNode('/src/d.ts');
      expect(cloned.hasNode('/src/d.ts')).toBe(false);

      // 修改克隆不應影響原圖
      cloned.addNode('/src/e.ts');
      expect(graph.hasNode('/src/e.ts')).toBe(false);
    });
  });

  describe('複雜場景', () => {
    it('應該處理大量節點', () => {
      for (let i = 0; i < 100; i++) {
        graph.addNode(`/src/file${i}.ts`);
      }

      expect(graph.getNodeCount()).toBe(100);
    });

    it('應該處理大量邊', () => {
      // 建立完全圖（每個節點連接到所有其他節點）
      const nodes = Array.from({ length: 10 }, (_, i) => `/src/file${i}.ts`);

      for (const from of nodes) {
        for (const to of nodes) {
          if (from !== to) {
            graph.addDependency(from, to);
          }
        }
      }

      expect(graph.getNodeCount()).toBe(10);
      expect(graph.getEdgeCount()).toBe(90); // n * (n-1)
    });

    it('應該處理深層依賴鏈', () => {
      const depth = 50;

      for (let i = 0; i < depth - 1; i++) {
        graph.addDependency(`/src/level${i}.ts`, `/src/level${i + 1}.ts`);
      }

      const transitive = graph.getTransitiveDependencies('/src/level0.ts');

      expect(transitive).toHaveLength(depth - 1);
    });

    it('應該處理複雜菱形依賴網絡', () => {
      // 建立複雜的菱形依賴網絡
      //     A
      //    / \
      //   B   C
      //   |\ /|
      //   | X |
      //   |/ \|
      //   D   E
      //    \ /
      //     F
      graph.addDependency('/src/a.ts', '/src/b.ts');
      graph.addDependency('/src/a.ts', '/src/c.ts');
      graph.addDependency('/src/b.ts', '/src/d.ts');
      graph.addDependency('/src/b.ts', '/src/e.ts');
      graph.addDependency('/src/c.ts', '/src/d.ts');
      graph.addDependency('/src/c.ts', '/src/e.ts');
      graph.addDependency('/src/d.ts', '/src/f.ts');
      graph.addDependency('/src/e.ts', '/src/f.ts');

      const transitive = graph.getTransitiveDependencies('/src/a.ts');

      expect(transitive).toHaveLength(5); // b, c, d, e, f
      expect(transitive).toContain('/src/f.ts');

      const result = graph.topologicalSort();

      expect(result.hasCycle).toBe(false);
    });
  });
});
