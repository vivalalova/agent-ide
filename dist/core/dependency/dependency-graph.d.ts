/**
 * 依賴圖實作
 * 提供有向圖資料結構來表示檔案間的依賴關係
 */
import type { DependencyNode, DependencyEdge, TopologicalSortResult } from './types.js';
/**
 * 圖的序列化格式
 */
export interface SerializedGraph {
    nodes: string[];
    edges: Array<{
        from: string;
        to: string;
        weight: number;
    }>;
    metadata?: Record<string, any>;
}
/**
 * 依賴圖類別
 * 使用鄰接列表實作有向圖
 */
export declare class DependencyGraph {
    private adjacencyList;
    private reverseAdjacencyList;
    private nodes;
    /**
     * 建立空的依賴圖
     */
    constructor();
    /**
     * 新增節點到圖中
     * @param filePath 檔案路徑
     */
    addNode(filePath: string): void;
    /**
     * 移除節點及其所有相關邊
     * @param filePath 檔案路徑
     */
    removeNode(filePath: string): void;
    /**
     * 新增依賴關係（邊）
     * @param from 依賴源檔案
     * @param to 被依賴檔案
     */
    addDependency(from: string, to: string): void;
    /**
     * 移除依賴關係
     * @param from 依賴源檔案
     * @param to 被依賴檔案
     */
    removeDependency(from: string, to: string): void;
    /**
     * 檢查是否存在節點
     * @param filePath 檔案路徑
     * @returns 是否存在該節點
     */
    hasNode(filePath: string): boolean;
    /**
     * 檢查是否存在依賴關係
     * @param from 依賴源檔案
     * @param to 被依賴檔案
     * @returns 是否存在該依賴關係
     */
    hasDependency(from: string, to: string): boolean;
    /**
     * 取得節點數量
     * @returns 節點總數
     */
    getNodeCount(): number;
    /**
     * 取得邊數量
     * @returns 邊總數
     */
    getEdgeCount(): number;
    /**
     * 檢查圖是否為空
     * @returns 是否為空圖
     */
    isEmpty(): boolean;
    /**
     * 取得節點的直接依賴
     * @param filePath 檔案路徑
     * @returns 直接依賴列表
     */
    getDependencies(filePath: string): string[];
    /**
     * 取得節點的直接依賴者
     * @param filePath 檔案路徑
     * @returns 直接依賴者列表
     */
    getDependents(filePath: string): string[];
    /**
     * 取得節點的傳遞依賴
     * @param filePath 檔案路徑
     * @returns 傳遞依賴列表
     */
    getTransitiveDependencies(filePath: string): string[];
    /**
     * 取得節點的傳遞依賴者
     * @param filePath 檔案路徑
     * @returns 傳遞依賴者列表
     */
    getTransitiveDependents(filePath: string): string[];
    /**
     * 取得節點資訊
     * @param filePath 檔案路徑
     * @returns 節點資訊或 undefined
     */
    getNodeInfo(filePath: string): DependencyNode | undefined;
    /**
     * 拓撲排序
     * @returns 排序結果，包含是否有循環
     */
    topologicalSort(): TopologicalSortResult;
    /**
     * 取得所有節點
     * @returns 節點列表
     */
    getAllNodes(): string[];
    /**
     * 取得所有邊
     * @returns 邊列表
     */
    getAllEdges(): DependencyEdge[];
    /**
     * 檢查圖是否連通（弱連通）
     * @returns 是否連通
     */
    isConnected(): boolean;
    /**
     * 找出孤立節點（沒有任何依賴關係的節點）
     * @returns 孤立節點列表
     */
    getOrphanedNodes(): string[];
    /**
     * 序列化圖為 JSON 格式
     * @returns 序列化後的圖資料
     */
    serialize(): SerializedGraph;
    /**
     * 從序列化資料重建圖
     * @param data 序列化的圖資料
     * @returns 重建的圖實例
     */
    static deserialize(data: SerializedGraph): DependencyGraph;
    /**
     * 清空圖
     */
    clear(): void;
    /**
     * 複製圖
     * @returns 圖的深拷貝
     */
    clone(): DependencyGraph;
}
//# sourceMappingURL=dependency-graph.d.ts.map