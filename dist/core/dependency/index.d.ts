/**
 * 依賴關係分析模組統一匯出
 */
export { DependencyAnalyzer } from './dependency-analyzer.js';
export { DependencyGraph } from './dependency-graph.js';
export { CycleDetector } from './cycle-detector.js';
export type { FileDependencies, ProjectDependencies, DependencyStats, CircularDependency, StronglyConnectedComponent, DependencyEdge, DependencyNode, ImpactAnalysisResult, TopologicalSortResult, DependencyAnalysisOptions, DependencyQueryOptions, CycleDetectionOptions, PathResolutionResult, DependencyAnalyzerConfig } from './types.js';
export { createDefaultAnalysisOptions, createDefaultQueryOptions, createDefaultCycleDetectionOptions, createDefaultAnalyzerConfig, calculateCycleSeverity, isFileDependencies, isProjectDependencies, isCircularDependency } from './types.js';
export type { Dependency } from '../../shared/types/index.js';
export { DependencyType } from '../../shared/types/index.js';
/**
 * 建立依賴分析器的便利函式
 * @param options 分析選項
 * @returns 配置好的依賴分析器實例
 */
export declare function createDependencyAnalyzer(options?: any): any;
/**
 * 建立循環檢測器的便利函式
 * @returns 循環檢測器實例
 */
export declare function createCycleDetector(): any;
/**
 * 建立依賴圖的便利函式
 * @returns 空的依賴圖實例
 */
export declare function createDependencyGraph(): any;
//# sourceMappingURL=index.d.ts.map