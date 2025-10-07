/**
 * 循環依賴檢測器
 * 使用 Tarjan 算法檢測強連通分量和循環依賴
 */
import type { DependencyGraph } from './dependency-graph.js';
import type { CircularDependency, StronglyConnectedComponent, CycleDetectionOptions } from './types.js';
/**
 * 循環依賴檢測器類別
 */
export declare class CycleDetector {
    /**
     * 檢測圖中的所有循環依賴
     * @param graph 依賴圖
     * @param options 檢測選項
     * @returns 循環依賴列表
     */
    detectCycles(graph: DependencyGraph, options?: CycleDetectionOptions): CircularDependency[];
    /**
     * 使用 Tarjan 算法找出強連通分量
     * @param graph 依賴圖
     * @returns 強連通分量列表
     */
    findStronglyConnectedComponents(graph: DependencyGraph): StronglyConnectedComponent[];
    /**
     * 在強連通分量中找出循環路徑
     * @param graph 依賴圖
     * @param sccNodes SCC 中的節點
     * @returns 循環路徑列表
     */
    private findCyclePathsInSCC;
    /**
     * 找出從指定節點開始的最短循環路徑
     * @param graph 依賴圖
     * @param startNode 起始節點
     * @param sccNodes 限制搜尋範圍的節點
     * @returns 循環路徑或 null
     */
    private findShortestCyclePath;
    /**
     * 計算循環的複雜度
     * @param graph 依賴圖
     * @param cycleNodes 循環中的節點
     * @returns 複雜度分數
     */
    private calculateCycleComplexity;
    /**
     * 取得預設檢測選項
     * @param options 使用者提供的選項
     * @returns 合併後的選項
     */
    private getDefaultOptions;
    /**
     * 檢查圖中是否存在循環依賴
     * @param graph 依賴圖
     * @returns 是否存在循環
     */
    hasCycles(graph: DependencyGraph): boolean;
    /**
     * 取得循環依賴的摘要統計
     * @param graph 依賴圖
     * @returns 統計資訊
     */
    getCycleStatistics(graph: DependencyGraph): {
        totalCycles: number;
        averageCycleLength: number;
        maxCycleLength: number;
        cyclesBySeverity: Record<string, number>;
    };
    /**
     * 建議循環依賴的修復策略
     * @param cycles 循環依賴列表
     * @returns 修復建議
     */
    suggestFixStrategies(cycles: CircularDependency[]): Array<{
        cycle: string[];
        strategy: string;
        description: string;
        priority: 'high' | 'medium' | 'low';
    }>;
}
//# sourceMappingURL=cycle-detector.d.ts.map