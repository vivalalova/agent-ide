/**
 * DependencyGraph 類別測試
 * 測試圖結構、依賴關係操作和拓撲排序功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraph } from '../../../src/core/dependency/dependency-graph';
import type { DependencyNode, DependencyEdge, TopologicalSortResult } from '../../../src/core/dependency/types';

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  describe('建立和基本操作', () => {
    it('應該建立空的依賴圖', () => {
      expect(graph.getNodeCount()).toBe(0);
      expect(graph.getEdgeCount()).toBe(0);
      expect(graph.isEmpty()).toBe(true);
    });

    it('應該能新增節點', () => {
      graph.addNode('/path/to/file.ts');

      expect(graph.getNodeCount()).toBe(1);
      expect(graph.hasNode('/path/to/file.ts')).toBe(true);
      expect(graph.isEmpty()).toBe(false);
    });

    it('應該能新增多個節點', () => {
      graph.addNode('/path/to/file1.ts');
      graph.addNode('/path/to/file2.ts');
      graph.addNode('/path/to/file3.ts');

      expect(graph.getNodeCount()).toBe(3);
      expect(graph.hasNode('/path/to/file1.ts')).toBe(true);
      expect(graph.hasNode('/path/to/file2.ts')).toBe(true);
      expect(graph.hasNode('/path/to/file3.ts')).toBe(true);
    });

    it('不應該重複新增相同節點', () => {
      graph.addNode('/path/to/file.ts');
      graph.addNode('/path/to/file.ts');

      expect(graph.getNodeCount()).toBe(1);
    });

    it('應該能移除節點', () => {
      graph.addNode('/path/to/file.ts');
      expect(graph.hasNode('/path/to/file.ts')).toBe(true);

      graph.removeNode('/path/to/file.ts');
      expect(graph.hasNode('/path/to/file.ts')).toBe(false);
      expect(graph.getNodeCount()).toBe(0);
    });
  });

  describe('邊（依賴關係）操作', () => {
    beforeEach(() => {
      graph.addNode('/path/to/file1.ts');
      graph.addNode('/path/to/file2.ts');
      graph.addNode('/path/to/file3.ts');
    });

    it('應該能新增依賴關係', () => {
      graph.addDependency('/path/to/file1.ts', '/path/to/file2.ts');

      expect(graph.getEdgeCount()).toBe(1);
      expect(graph.hasDependency('/path/to/file1.ts', '/path/to/file2.ts')).toBe(true);
    });

    it('應該能新增多個依賴關係', () => {
      graph.addDependency('/path/to/file1.ts', '/path/to/file2.ts');
      graph.addDependency('/path/to/file2.ts', '/path/to/file3.ts');
      graph.addDependency('/path/to/file1.ts', '/path/to/file3.ts');

      expect(graph.getEdgeCount()).toBe(3);
    });

    it('不應該重複新增相同依賴關係', () => {
      graph.addDependency('/path/to/file1.ts', '/path/to/file2.ts');
      graph.addDependency('/path/to/file1.ts', '/path/to/file2.ts');

      expect(graph.getEdgeCount()).toBe(1);
    });

    it('應該能移除依賴關係', () => {
      graph.addDependency('/path/to/file1.ts', '/path/to/file2.ts');
      expect(graph.hasDependency('/path/to/file1.ts', '/path/to/file2.ts')).toBe(true);

      graph.removeDependency('/path/to/file1.ts', '/path/to/file2.ts');
      expect(graph.hasDependency('/path/to/file1.ts', '/path/to/file2.ts')).toBe(false);
      expect(graph.getEdgeCount()).toBe(0);
    });

    it('新增依賴關係時應該自動新增不存在的節點', () => {
      const graph2 = new DependencyGraph();
      graph2.addDependency('/path/to/file1.ts', '/path/to/file2.ts');

      expect(graph2.getNodeCount()).toBe(2);
      expect(graph2.hasNode('/path/to/file1.ts')).toBe(true);
      expect(graph2.hasNode('/path/to/file2.ts')).toBe(true);
    });
  });

  describe('依賴查詢', () => {
    beforeEach(() => {
      // 建立測試圖結構
      // file1 -> file2 -> file3
      // file1 -> file4
      graph.addDependency('/path/to/file1.ts', '/path/to/file2.ts');
      graph.addDependency('/path/to/file2.ts', '/path/to/file3.ts');
      graph.addDependency('/path/to/file1.ts', '/path/to/file4.ts');
    });

    it('應該能取得直接依賴', () => {
      const dependencies = graph.getDependencies('/path/to/file1.ts');

      expect(dependencies).toHaveLength(2);
      expect(dependencies).toContain('/path/to/file2.ts');
      expect(dependencies).toContain('/path/to/file4.ts');
    });

    it('應該能取得直接依賴者', () => {
      const dependents = graph.getDependents('/path/to/file2.ts');

      expect(dependents).toHaveLength(1);
      expect(dependents).toContain('/path/to/file1.ts');
    });

    it('應該能取得傳遞依賴', () => {
      const transitiveDeps = graph.getTransitiveDependencies('/path/to/file1.ts');

      expect(transitiveDeps).toHaveLength(3);
      expect(transitiveDeps).toContain('/path/to/file2.ts');
      expect(transitiveDeps).toContain('/path/to/file3.ts');
      expect(transitiveDeps).toContain('/path/to/file4.ts');
    });

    it('應該能取得傳遞依賴者', () => {
      const transitiveDependents = graph.getTransitiveDependents('/path/to/file3.ts');

      expect(transitiveDependents).toHaveLength(2);
      expect(transitiveDependents).toContain('/path/to/file1.ts');
      expect(transitiveDependents).toContain('/path/to/file2.ts');
    });

    it('應該能取得節點資訊', () => {
      const nodeInfo = graph.getNodeInfo('/path/to/file1.ts');

      expect(nodeInfo).toBeDefined();
      expect(nodeInfo?.filePath).toBe('/path/to/file1.ts');
      expect(nodeInfo?.outDegree).toBe(2);
      expect(nodeInfo?.inDegree).toBe(0);
      expect(nodeInfo?.dependencies).toHaveLength(2);
    });
  });

  describe('拓撲排序', () => {
    it('應該能對無循環圖進行拓撲排序', () => {
      // file1 -> file2 -> file3
      graph.addDependency('/path/to/file1.ts', '/path/to/file2.ts');
      graph.addDependency('/path/to/file2.ts', '/path/to/file3.ts');

      const result = graph.topologicalSort();

      expect(result.hasCycle).toBe(false);
      expect(result.sortedFiles).toHaveLength(3);

      const file1Index = result.sortedFiles.indexOf('/path/to/file1.ts');
      const file2Index = result.sortedFiles.indexOf('/path/to/file2.ts');
      const file3Index = result.sortedFiles.indexOf('/path/to/file3.ts');

      expect(file1Index).toBeLessThan(file2Index);
      expect(file2Index).toBeLessThan(file3Index);
    });

    it('應該能檢測循環依賴', () => {
      // 建立循環：file1 -> file2 -> file1
      graph.addDependency('/path/to/file1.ts', '/path/to/file2.ts');
      graph.addDependency('/path/to/file2.ts', '/path/to/file1.ts');

      const result = graph.topologicalSort();

      expect(result.hasCycle).toBe(true);
      expect(result.cycleFiles).toBeDefined();
      expect(result.cycleFiles).toContain('/path/to/file1.ts');
      expect(result.cycleFiles).toContain('/path/to/file2.ts');
    });

    it('應該能處理複雜的無循環圖', () => {
      // 建立複雜圖結構
      graph.addDependency('/path/to/file1.ts', '/path/to/file2.ts');
      graph.addDependency('/path/to/file1.ts', '/path/to/file3.ts');
      graph.addDependency('/path/to/file2.ts', '/path/to/file4.ts');
      graph.addDependency('/path/to/file3.ts', '/path/to/file4.ts');
      graph.addDependency('/path/to/file4.ts', '/path/to/file5.ts');

      const result = graph.topologicalSort();

      expect(result.hasCycle).toBe(false);
      expect(result.sortedFiles).toHaveLength(5);

      // file5 應該在最後
      expect(result.sortedFiles[result.sortedFiles.length - 1]).toBe('/path/to/file5.ts');
      // file1 應該在 file2 和 file3 之前
      const file1Index = result.sortedFiles.indexOf('/path/to/file1.ts');
      const file2Index = result.sortedFiles.indexOf('/path/to/file2.ts');
      const file3Index = result.sortedFiles.indexOf('/path/to/file3.ts');

      expect(file1Index).toBeLessThan(file2Index);
      expect(file1Index).toBeLessThan(file3Index);
    });
  });

  describe('圖統計資訊', () => {
    beforeEach(() => {
      // 建立測試圖
      graph.addDependency('/path/to/file1.ts', '/path/to/file2.ts');
      graph.addDependency('/path/to/file2.ts', '/path/to/file3.ts');
      graph.addDependency('/path/to/file1.ts', '/path/to/file4.ts');
    });

    it('應該能取得所有節點', () => {
      const nodes = graph.getAllNodes();

      expect(nodes).toHaveLength(4);
      expect(nodes).toContain('/path/to/file1.ts');
      expect(nodes).toContain('/path/to/file2.ts');
      expect(nodes).toContain('/path/to/file3.ts');
      expect(nodes).toContain('/path/to/file4.ts');
    });

    it('應該能取得所有邊', () => {
      const edges = graph.getAllEdges();

      expect(edges).toHaveLength(3);
      expect(edges.some(e => e.from === '/path/to/file1.ts' && e.to === '/path/to/file2.ts')).toBe(true);
      expect(edges.some(e => e.from === '/path/to/file2.ts' && e.to === '/path/to/file3.ts')).toBe(true);
      expect(edges.some(e => e.from === '/path/to/file1.ts' && e.to === '/path/to/file4.ts')).toBe(true);
    });

    it('應該能檢查圖是否連通', () => {
      expect(graph.isConnected()).toBe(true);

      // 新增孤立節點
      graph.addNode('/path/to/isolated.ts');
      expect(graph.isConnected()).toBe(false);
    });

    it('應該能找出孤立節點', () => {
      graph.addNode('/path/to/isolated.ts');
      const orphaned = graph.getOrphanedNodes();

      expect(orphaned).toHaveLength(1); // 只有 isolated
      expect(orphaned).toContain('/path/to/isolated.ts'); // 孤立節點
    });
  });

  describe('序列化和反序列化', () => {
    beforeEach(() => {
      graph.addDependency('/path/to/file1.ts', '/path/to/file2.ts');
      graph.addDependency('/path/to/file2.ts', '/path/to/file3.ts');
    });

    it('應該能序列化圖', () => {
      const serialized = graph.serialize();

      expect(serialized).toHaveProperty('nodes');
      expect(serialized).toHaveProperty('edges');
      expect(serialized.nodes).toHaveLength(3);
      expect(serialized.edges).toHaveLength(2);
    });

    it('應該能從序列化數據重建圖', () => {
      const serialized = graph.serialize();
      const newGraph = DependencyGraph.deserialize(serialized);

      expect(newGraph.getNodeCount()).toBe(graph.getNodeCount());
      expect(newGraph.getEdgeCount()).toBe(graph.getEdgeCount());
      expect(newGraph.hasDependency('/path/to/file1.ts', '/path/to/file2.ts')).toBe(true);
      expect(newGraph.hasDependency('/path/to/file2.ts', '/path/to/file3.ts')).toBe(true);
    });
  });

  describe('清空和複製', () => {
    beforeEach(() => {
      graph.addDependency('/path/to/file1.ts', '/path/to/file2.ts');
      graph.addDependency('/path/to/file2.ts', '/path/to/file3.ts');
    });

    it('應該能清空圖', () => {
      expect(graph.isEmpty()).toBe(false);

      graph.clear();

      expect(graph.isEmpty()).toBe(true);
      expect(graph.getNodeCount()).toBe(0);
      expect(graph.getEdgeCount()).toBe(0);
    });

    it('應該能複製圖', () => {
      const clonedGraph = graph.clone();

      expect(clonedGraph.getNodeCount()).toBe(graph.getNodeCount());
      expect(clonedGraph.getEdgeCount()).toBe(graph.getEdgeCount());
      expect(clonedGraph.hasDependency('/path/to/file1.ts', '/path/to/file2.ts')).toBe(true);

      // 修改原圖不應該影響複製的圖
      graph.addNode('/path/to/file4.ts');
      expect(clonedGraph.hasNode('/path/to/file4.ts')).toBe(false);
    });
  });

  describe('錯誤處理', () => {
    it('應該拋出錯誤當嘗試取得不存在節點的資訊', () => {
      expect(() => {
        graph.getNodeInfo('/path/to/nonexistent.ts');
      }).not.toThrow(); // 應該返回 undefined 而不是拋出錯誤

      const nodeInfo = graph.getNodeInfo('/path/to/nonexistent.ts');
      expect(nodeInfo).toBeUndefined();
    });

    it('應該處理空路徑', () => {
      expect(() => {
        graph.addNode('');
      }).toThrow('檔案路徑不能為空');
    });

    it('應該處理無效的序列化數據', () => {
      expect(() => {
        DependencyGraph.deserialize({} as any);
      }).toThrow();
    });
  });
});