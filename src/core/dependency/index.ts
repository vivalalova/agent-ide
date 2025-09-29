/**
 * 依賴關係分析模組統一匯出
 */

// 核心類別
export { DependencyAnalyzer } from './dependency-analyzer.js';
export { DependencyGraph } from './dependency-graph.js';
export { CycleDetector } from './cycle-detector.js';

// 型別定義
export type {
  FileDependencies,
  ProjectDependencies,
  DependencyStats,
  CircularDependency,
  StronglyConnectedComponent,
  DependencyEdge,
  DependencyNode,
  ImpactAnalysisResult,
  TopologicalSortResult,
  DependencyAnalysisOptions,
  DependencyQueryOptions,
  CycleDetectionOptions,
  PathResolutionResult,
  DependencyAnalyzerConfig
} from './types.js';

// 工廠函式和工具函式
export {
  createDefaultAnalysisOptions,
  createDefaultQueryOptions,
  createDefaultCycleDetectionOptions,
  createDefaultAnalyzerConfig,
  calculateCycleSeverity,
  isFileDependencies,
  isProjectDependencies,
  isCircularDependency
} from './types.js';

// 重新匯出共享型別
export type { Dependency } from '../../shared/types/index.js';
export { DependencyType } from '../../shared/types/index.js';

/**
 * 建立依賴分析器的便利函式
 * @param options 分析選項
 * @returns 配置好的依賴分析器實例
 */
export function createDependencyAnalyzer(
  options?: any
) {
  const { DependencyAnalyzer } = require('./dependency-analyzer');
  return new DependencyAnalyzer(options);
}

/**
 * 建立循環檢測器的便利函式
 * @returns 循環檢測器實例
 */
export function createCycleDetector() {
  const { CycleDetector } = require('./cycle-detector');
  return new CycleDetector();
}

/**
 * 建立依賴圖的便利函式
 * @returns 空的依賴圖實例
 */
export function createDependencyGraph() {
  const { DependencyGraph } = require('./dependency-graph');
  return new DependencyGraph();
}