/**
 * CycleDetector.detectCycles Benchmark
 * 測量循環依賴檢測的效能 baseline（不同圖規模）
 */

import { bench, describe } from 'vitest';
import { CycleDetector } from '@core/cycles/index.js';
import { DependencyGraph } from '@core/foundations/dependency-graph/index.js';

const detector = new CycleDetector();

function buildChainGraph(size: number): DependencyGraph {
  const graph = new DependencyGraph();
  for (let i = 0; i < size; i++) {
    graph.addDependency(`/src/file${i}.ts`, `/src/file${i + 1}.ts`);
  }
  // 建立循環
  graph.addDependency(`/src/file${size}.ts`, '/src/file0.ts');
  return graph;
}

function buildDenseGraph(size: number): DependencyGraph {
  const graph = new DependencyGraph();
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (i !== j) {
        graph.addDependency(`/src/file${i}.ts`, `/src/file${j}.ts`);
      }
    }
  }
  return graph;
}

function buildTreeWithCycles(depth: number, breadth: number): DependencyGraph {
  const graph = new DependencyGraph();
  let id = 0;

  function addLevel(parentId: number, currentDepth: number): void {
    if (currentDepth >= depth) {return;}
    for (let i = 0; i < breadth; i++) {
      const childId = ++id;
      graph.addDependency(`/src/file${parentId}.ts`, `/src/file${childId}.ts`);
      if (currentDepth === depth - 1) {
        // 葉節點連回根節點造成循環
        graph.addDependency(`/src/file${childId}.ts`, '/src/file0.ts');
      }
      addLevel(childId, currentDepth + 1);
    }
  }

  addLevel(0, 0);
  return graph;
}

describe('CycleDetector', () => {
  describe('chain graph (single cycle)', () => {
    bench('10 nodes', () => {
      detector.detectCycles(buildChainGraph(10));
    });

    bench('50 nodes', () => {
      detector.detectCycles(buildChainGraph(50));
    });

    bench('200 nodes', () => {
      detector.detectCycles(buildChainGraph(200));
    });
  });

  describe('dense graph (many cycles)', () => {
    bench('10 nodes', () => {
      detector.detectCycles(buildDenseGraph(10));
    });

    bench('20 nodes', () => {
      detector.detectCycles(buildDenseGraph(20));
    });

    bench('30 nodes', () => {
      detector.detectCycles(buildDenseGraph(30));
    });
  });

  describe('tree with leaf-to-root cycles', () => {
    bench('depth=3, breadth=3 (39 nodes)', () => {
      detector.detectCycles(buildTreeWithCycles(3, 3));
    });

    bench('depth=4, breadth=3 (120 nodes)', () => {
      detector.detectCycles(buildTreeWithCycles(4, 3));
    });

    bench('depth=3, breadth=5 (155 nodes)', () => {
      detector.detectCycles(buildTreeWithCycles(3, 5));
    });
  });

  describe('statistics', () => {
    bench('getCycleStatistics (50-node chain)', () => {
      detector.getCycleStatistics(buildChainGraph(50));
    });

    bench('hasCycles (200-node chain)', () => {
      detector.hasCycles(buildChainGraph(200));
    });
  });
});
