/**
 * 依賴關係分析相關型別定義
 */
import { Dependency } from '../../shared/types/index.js';
/**
 * 檔案依賴資訊
 */
export interface FileDependencies {
    readonly filePath: string;
    readonly dependencies: readonly Dependency[];
    readonly lastModified: Date;
}
/**
 * 專案依賴資訊
 */
export interface ProjectDependencies {
    readonly projectPath: string;
    readonly fileDependencies: readonly FileDependencies[];
    readonly analyzedAt: Date;
}
/**
 * 依賴統計資訊
 */
export interface DependencyStats {
    readonly totalFiles: number;
    readonly totalDependencies: number;
    readonly averageDependenciesPerFile: number;
    readonly maxDependenciesInFile: number;
    readonly circularDependencies: number;
    readonly orphanedFiles: number;
}
/**
 * 循環依賴資訊
 */
export interface CircularDependency {
    readonly cycle: readonly string[];
    readonly length: number;
    readonly severity: 'low' | 'medium' | 'high';
}
/**
 * 強連通分量
 */
export interface StronglyConnectedComponent {
    readonly nodes: readonly string[];
    readonly size: number;
    readonly cycleComplexity: number;
}
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
 * 影響分析結果
 */
export interface ImpactAnalysisResult {
    readonly targetFile: string;
    readonly directlyAffected: readonly string[];
    readonly transitivelyAffected: readonly string[];
    readonly affectedTests: readonly string[];
    readonly impactScore: number;
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
 * 依賴分析選項
 */
export interface DependencyAnalysisOptions {
    readonly includeNodeModules: boolean;
    readonly followSymlinks: boolean;
    readonly maxDepth: number;
    readonly excludePatterns: readonly string[];
    readonly includePatterns: readonly string[];
}
/**
 * 依賴查詢選項
 */
export interface DependencyQueryOptions {
    readonly includeTransitive: boolean;
    readonly maxDepth: number;
    readonly direction: 'dependencies' | 'dependents' | 'both';
}
/**
 * 循環檢測選項
 */
export interface CycleDetectionOptions {
    readonly maxCycleLength: number;
    readonly reportAllCycles: boolean;
    readonly ignoreSelfLoops: boolean;
}
/**
 * 路徑解析結果
 */
export interface PathResolutionResult {
    readonly resolvedPath: string;
    readonly isRelative: boolean;
    readonly exists: boolean;
    readonly extension: string;
}
/**
 * 依賴分析器配置
 */
export interface DependencyAnalyzerConfig {
    readonly analysisOptions: DependencyAnalysisOptions;
    readonly queryOptions: DependencyQueryOptions;
    readonly cycleDetectionOptions: CycleDetectionOptions;
    readonly cacheEnabled: boolean;
    readonly concurrency: number;
}
/**
 * 擴展的依賴分析選項（包含 concurrency）
 */
export interface ExtendedDependencyAnalysisOptions extends DependencyAnalysisOptions {
    readonly concurrency?: number;
}
/**
 * 建立預設依賴分析選項
 */
export declare function createDefaultAnalysisOptions(): DependencyAnalysisOptions;
/**
 * 建立預設查詢選項
 */
export declare function createDefaultQueryOptions(): DependencyQueryOptions;
/**
 * 建立預設循環檢測選項
 */
export declare function createDefaultCycleDetectionOptions(): CycleDetectionOptions;
/**
 * 建立預設分析器配置
 */
export declare function createDefaultAnalyzerConfig(): DependencyAnalyzerConfig;
/**
 * 計算循環依賴嚴重程度
 */
export declare function calculateCycleSeverity(cycleLength: number): 'low' | 'medium' | 'high';
/**
 * FileDependencies 型別守衛
 */
export declare function isFileDependencies(value: unknown): value is FileDependencies;
/**
 * ProjectDependencies 型別守衛
 */
export declare function isProjectDependencies(value: unknown): value is ProjectDependencies;
/**
 * CircularDependency 型別守衛
 */
export declare function isCircularDependency(value: unknown): value is CircularDependency;
//# sourceMappingURL=types.d.ts.map