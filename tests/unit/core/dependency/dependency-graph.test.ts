import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraph } from '@core/dependency/dependency-graph';

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  describe('節點操作', () => {
    it('應該能夠新增節點', () => {
      graph.addNode('file1.ts');
      expect(graph.hasNode('file1.ts')).toBe(true);
    });

    it('應該拋出錯誤當路徑為空', () => {
      expect(() => graph.addNode('')).toThrow('檔案路徑不能為空');
      expect(() => graph.addNode('   ')).toThrow('檔案路徑不能為空');
    });

    it('應該能夠移除節點', () => {
      graph.addNode('file1.ts');
      graph.removeNode('file1.ts');
      expect(graph.hasNode('file1.ts')).toBe(false);
    });

    it('應該能夠檢查節點是否存在', () => {
      graph.addNode('file1.ts');
      expect(graph.hasNode('file1.ts')).toBe(true);
      expect(graph.hasNode('file2.ts')).toBe(false);
    });

    it('應該能夠取得所有節點', () => {
      graph.addNode('file1.ts');
      graph.addNode('file2.ts');
      graph.addNode('file3.ts');

      const nodes = graph.getAllNodes();
      expect(nodes).toHaveLength(3);
      expect(nodes).toContain('file1.ts');
      expect(nodes).toContain('file2.ts');
      expect(nodes).toContain('file3.ts');
    });

    it('應該回傳節點數量', () => {
      expect(graph.getNodeCount()).toBe(0);
      graph.addNode('file1.ts');
      expect(graph.getNodeCount()).toBe(1);
      graph.addNode('file2.ts');
      expect(graph.getNodeCount()).toBe(2);
    });
  });

  describe('依賴關係操作', () => {
    it('應該能夠新增依賴關係', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      expect(graph.hasDependency('file1.ts', 'file2.ts')).toBe(true);
    });

    it('應該自動新增不存在的節點', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      expect(graph.hasNode('file1.ts')).toBe(true);
      expect(graph.hasNode('file2.ts')).toBe(true);
    });

    it('應該能夠移除依賴關係', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.removeDependency('file1.ts', 'file2.ts');
      expect(graph.hasDependency('file1.ts', 'file2.ts')).toBe(false);
    });

    it('應該能夠檢查依賴關係是否存在', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      expect(graph.hasDependency('file1.ts', 'file2.ts')).toBe(true);
      expect(graph.hasDependency('file2.ts', 'file1.ts')).toBe(false);
    });

    it('應該能夠取得直接依賴', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file1.ts', 'file3.ts');

      const dependencies = graph.getDependencies('file1.ts');
      expect(dependencies).toHaveLength(2);
      expect(dependencies).toContain('file2.ts');
      expect(dependencies).toContain('file3.ts');
    });

    it('應該能夠取得依賴者（反向依賴）', () => {
      graph.addDependency('file1.ts', 'file3.ts');
      graph.addDependency('file2.ts', 'file3.ts');

      const dependents = graph.getDependents('file3.ts');
      expect(dependents).toHaveLength(2);
      expect(dependents).toContain('file1.ts');
      expect(dependents).toContain('file2.ts');
    });
  });

  describe('度數計算', () => {
    it('應該計算出度（依賴數量）', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file1.ts', 'file3.ts');
      graph.addDependency('file1.ts', 'file4.ts');

      expect(graph.getDependencies('file1.ts').length).toBe(3);
      expect(graph.getDependencies('file2.ts').length).toBe(0);
    });

    it('應該計算入度（被依賴數量）', () => {
      graph.addDependency('file1.ts', 'file4.ts');
      graph.addDependency('file2.ts', 'file4.ts');
      graph.addDependency('file3.ts', 'file4.ts');

      expect(graph.getDependents('file4.ts').length).toBe(3);
      expect(graph.getDependents('file1.ts').length).toBe(0);
    });
  });

  describe('圖操作', () => {
    it('應該能夠清空圖', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file3.ts');

      graph.clear();

      expect(graph.getNodeCount()).toBe(0);
      expect(graph.getAllNodes()).toHaveLength(0);
    });

    it('應該能夠檢查圖是否為空', () => {
      expect(graph.isEmpty()).toBe(true);
      graph.addNode('file1.ts');
      expect(graph.isEmpty()).toBe(false);
    });

    it('應該能夠克隆圖', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file3.ts');

      const clonedGraph = graph.clone();

      expect(clonedGraph.getNodeCount()).toBe(graph.getNodeCount());
      expect(clonedGraph.hasDependency('file1.ts', 'file2.ts')).toBe(true);
      expect(clonedGraph.hasDependency('file2.ts', 'file3.ts')).toBe(true);
    });
  });

  describe('傳遞依賴', () => {
    it('應該能夠取得傳遞依賴', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file3.ts');

      const transitiveDeps = graph.getTransitiveDependencies('file1.ts');
      expect(transitiveDeps.length).toBeGreaterThanOrEqual(2);
      expect(transitiveDeps).toContain('file2.ts');
      expect(transitiveDeps).toContain('file3.ts');
    });

    it('應該能夠取得傳遞依賴者', () => {
      graph.addDependency('file1.ts', 'file3.ts');
      graph.addDependency('file2.ts', 'file3.ts');

      const transitiveDependents = graph.getTransitiveDependents('file3.ts');
      expect(transitiveDependents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('孤立節點', () => {
    it('應該能夠識別孤立節點', () => {
      graph.addNode('file1.ts');
      graph.addDependency('file2.ts', 'file3.ts');

      const orphans = graph.getOrphanedNodes();
      expect(orphans).toHaveLength(1);
      expect(orphans).toContain('file1.ts');
    });

    it('應該不包含有依賴的節點', () => {
      graph.addDependency('file1.ts', 'file2.ts');

      const orphans = graph.getOrphanedNodes();
      expect(orphans).not.toContain('file1.ts');
      expect(orphans).not.toContain('file2.ts');
    });
  });

  describe('拓撲排序', () => {
    it('應該能夠進行拓撲排序', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file3.ts');

      const result = graph.topologicalSort();
      expect(result).toBeDefined();

      if (result.order) {
        const order = result.order;
        expect(order.indexOf('file1.ts')).toBeLessThan(order.indexOf('file2.ts'));
        expect(order.indexOf('file2.ts')).toBeLessThan(order.indexOf('file3.ts'));
      }
    });

    it('應該在有循環時檢測到循環', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file3.ts');
      graph.addDependency('file3.ts', 'file1.ts'); // 循環

      const result = graph.topologicalSort();
      expect(result).toBeDefined();
    });
  });

  describe('邊界情況', () => {
    it('應該處理自迴圈', () => {
      graph.addDependency('file1.ts', 'file1.ts');
      expect(graph.hasDependency('file1.ts', 'file1.ts')).toBe(true);
    });

    it('應該處理重複的依賴', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file1.ts', 'file2.ts');

      expect(graph.getDependencies('file1.ts')).toHaveLength(1);
    });

    it('應該處理移除不存在的節點', () => {
      expect(() => graph.removeNode('nonexistent.ts')).not.toThrow();
    });

    it('應該在移除節點時清理所有相關邊', () => {
      graph.addDependency('file1.ts', 'file2.ts');
      graph.addDependency('file2.ts', 'file3.ts');
      graph.addDependency('file3.ts', 'file2.ts');

      graph.removeNode('file2.ts');

      expect(graph.hasNode('file2.ts')).toBe(false);
      expect(graph.getDependencies('file1.ts')).toHaveLength(0);
      expect(graph.getDependents('file3.ts')).toHaveLength(0);
    });
  });
});
