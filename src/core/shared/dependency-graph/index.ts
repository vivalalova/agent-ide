/**
 * 依賴圖模組統一匯出
 */

import { DependencyGraph } from './dependency-graph.js';

export { DependencyGraph };

export type {
  DependencyNode,
  DependencyEdge,
  TopologicalSortResult,
  SerializedGraph
} from './types.js';

/**
 * 建立依賴圖的便利函式
 * @returns 空的依賴圖實例
 */
export function createDependencyGraph(): DependencyGraph {
  return new DependencyGraph();
}
