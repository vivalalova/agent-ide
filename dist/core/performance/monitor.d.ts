/**
 * Performance Monitor 實作
 * 提供效能監控和指標收集功能
 */
import { PerformanceMonitor, PerformanceMetrics, MemorySnapshot } from './interfaces.js';
/**
 * 預設效能監控器實作
 */
export declare class DefaultPerformanceMonitor implements PerformanceMonitor {
    private startTime;
    private startMemory;
    private isMonitoring;
    private memorySnapshots;
    /**
     * 開始監控
     */
    start(): void;
    /**
     * 停止監控
     */
    stop(): PerformanceMetrics;
    /**
     * 記錄記憶體快照
     */
    recordMemorySnapshot(): MemorySnapshot;
    /**
     * 獲取當前指標
     */
    getCurrentMetrics(): PerformanceMetrics;
    /**
     * 獲取記憶體快照歷史
     */
    getMemorySnapshots(): MemorySnapshot[];
    /**
     * 清理快照
     */
    clearSnapshots(): void;
    /**
     * 估算 CPU 使用率（簡化版本）
     */
    private estimateCpuUsage;
}
/**
 * 批量效能監控器
 * 用於監控多個並行操作
 */
export declare class BatchPerformanceMonitor {
    private monitors;
    /**
     * 開始監控特定操作
     */
    startOperation(operationId: string): void;
    /**
     * 停止監控特定操作
     */
    stopOperation(operationId: string): PerformanceMetrics | null;
    /**
     * 獲取所有正在監控的操作
     */
    getActiveOperations(): string[];
    /**
     * 獲取操作的當前指標
     */
    getOperationMetrics(operationId: string): PerformanceMetrics | null;
    /**
     * 停止所有監控
     */
    stopAll(): Map<string, PerformanceMetrics>;
    /**
     * 清理資源
     */
    dispose(): void;
}
/**
 * 全域效能監控器實例
 */
export declare const globalPerformanceMonitor: DefaultPerformanceMonitor;
/**
 * 工具函式：測量函式執行時間
 */
export declare function measureAsync<T>(operation: () => Promise<T>, operationName?: string): Promise<{
    result: T;
    metrics: PerformanceMetrics;
}>;
/**
 * 工具函式：測量同步函式執行時間
 */
export declare function measureSync<T>(operation: () => T, operationName?: string): {
    result: T;
    metrics: PerformanceMetrics;
};
//# sourceMappingURL=monitor.d.ts.map