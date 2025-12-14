/**
 * 依賴圖相關型別定義
 */

/**
 * 依賴圖邊
 */
export interface DependencyEdge {
  readonly from: string;
  readonly to: string;
  readonly weight: number;
  readonly dependencyType: 'import' | 'require' | 'include';
}

/**
 * 依賴圖節點
 */
export interface DependencyNode {
  readonly filePath: string;
  readonly inDegree: number;
  readonly outDegree: number;
  readonly dependencies: readonly string[];
  readonly dependents: readonly string[];
}

/**
 * 拓撲排序結果
 */
export interface TopologicalSortResult {
  readonly sortedFiles: readonly string[];
  readonly hasCycle: boolean;
  readonly cycleFiles?: readonly string[];
}

/**
 * 圖的序列化格式
 */
export interface SerializedGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string; weight: number }>;
  metadata?: Record<string, unknown>;
}
