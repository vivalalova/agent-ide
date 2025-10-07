/**
 * Performance Monitor 實作
 * 提供效能監控和指標收集功能
 */
/**
 * 預設效能監控器實作
 */
export class DefaultPerformanceMonitor {
    startTime = 0;
    startMemory = null;
    isMonitoring = false;
    memorySnapshots = [];
    /**
     * 開始監控
     */
    start() {
        this.startTime = Date.now();
        this.startMemory = process.memoryUsage();
        this.isMonitoring = true;
        this.memorySnapshots = [];
        // 記錄初始記憶體快照
        this.recordMemorySnapshot();
    }
    /**
     * 停止監控
     */
    stop() {
        if (!this.isMonitoring) {
            throw new Error('監控尚未開始');
        }
        const endTime = Date.now();
        const endMemory = process.memoryUsage();
        this.isMonitoring = false;
        // 記錄最終記憶體快照
        this.recordMemorySnapshot();
        const duration = endTime - this.startTime;
        const memoryUsage = this.startMemory ?
            endMemory.heapUsed - this.startMemory.heapUsed :
            endMemory.heapUsed;
        // 計算 CPU 使用率（簡化版本）
        const cpuUsage = this.estimateCpuUsage();
        return {
            duration,
            memoryUsage,
            cpuUsage,
            throughput: duration > 0 ? 1000 / duration : 0, // 每秒操作數
            latency: duration
        };
    }
    /**
     * 記錄記憶體快照
     */
    recordMemorySnapshot() {
        const memory = process.memoryUsage();
        const snapshot = {
            timestamp: new Date(),
            heapUsed: memory.heapUsed,
            heapTotal: memory.heapTotal,
            rss: memory.rss,
            external: memory.external,
            arrayBuffers: memory.arrayBuffers
        };
        this.memorySnapshots.push(snapshot);
        return snapshot;
    }
    /**
     * 獲取當前指標
     */
    getCurrentMetrics() {
        if (!this.isMonitoring) {
            throw new Error('監控尚未開始');
        }
        const currentTime = Date.now();
        const currentMemory = process.memoryUsage();
        const duration = currentTime - this.startTime;
        const memoryUsage = this.startMemory ?
            currentMemory.heapUsed - this.startMemory.heapUsed :
            currentMemory.heapUsed;
        return {
            duration,
            memoryUsage,
            cpuUsage: this.estimateCpuUsage(),
            throughput: duration > 0 ? 1000 / duration : 0,
            latency: duration
        };
    }
    /**
     * 獲取記憶體快照歷史
     */
    getMemorySnapshots() {
        return [...this.memorySnapshots];
    }
    /**
     * 清理快照
     */
    clearSnapshots() {
        this.memorySnapshots = [];
    }
    /**
     * 估算 CPU 使用率（簡化版本）
     */
    estimateCpuUsage() {
        if (this.memorySnapshots.length < 2) {
            return 0;
        }
        // 基於記憶體增長率和時間間隔的簡化 CPU 估算
        const recent = this.memorySnapshots.slice(-2);
        const timeDiff = recent[1].timestamp.getTime() - recent[0].timestamp.getTime();
        const memoryDiff = recent[1].heapUsed - recent[0].heapUsed;
        if (timeDiff <= 0)
            return 0;
        // 簡化的 CPU 使用率計算（基於記憶體分配速度）
        const allocationRate = memoryDiff / timeDiff; // 每毫秒的記憶體分配
        return Math.min(100, Math.max(0, allocationRate * 10000)); // 轉換為百分比
    }
}
/**
 * 批量效能監控器
 * 用於監控多個並行操作
 */
export class BatchPerformanceMonitor {
    monitors = new Map();
    /**
     * 開始監控特定操作
     */
    startOperation(operationId) {
        const monitor = new DefaultPerformanceMonitor();
        monitor.start();
        this.monitors.set(operationId, monitor);
    }
    /**
     * 停止監控特定操作
     */
    stopOperation(operationId) {
        const monitor = this.monitors.get(operationId);
        if (!monitor) {
            return null;
        }
        const metrics = monitor.stop();
        this.monitors.delete(operationId);
        return metrics;
    }
    /**
     * 獲取所有正在監控的操作
     */
    getActiveOperations() {
        return Array.from(this.monitors.keys());
    }
    /**
     * 獲取操作的當前指標
     */
    getOperationMetrics(operationId) {
        const monitor = this.monitors.get(operationId);
        return monitor ? monitor.getCurrentMetrics() : null;
    }
    /**
     * 停止所有監控
     */
    stopAll() {
        const results = new Map();
        for (const [operationId, monitor] of this.monitors) {
            try {
                results.set(operationId, monitor.stop());
            }
            catch (error) {
                // 忽略已停止的監控器
            }
        }
        this.monitors.clear();
        return results;
    }
    /**
     * 清理資源
     */
    dispose() {
        this.monitors.clear();
    }
}
/**
 * 全域效能監控器實例
 */
export const globalPerformanceMonitor = new DefaultPerformanceMonitor();
/**
 * 工具函式：測量函式執行時間
 */
export async function measureAsync(operation, operationName) {
    const monitor = new DefaultPerformanceMonitor();
    monitor.start();
    try {
        const result = await operation();
        const metrics = monitor.stop();
        if (operationName) {
            console.debug(`${operationName} 執行完成:`, {
                duration: `${metrics.duration}ms`,
                memory: `${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`,
                throughput: `${metrics.throughput?.toFixed(2)}/s`
            });
        }
        return { result, metrics };
    }
    catch (error) {
        monitor.stop(); // 確保清理
        throw error;
    }
}
/**
 * 工具函式：測量同步函式執行時間
 */
export function measureSync(operation, operationName) {
    const monitor = new DefaultPerformanceMonitor();
    monitor.start();
    try {
        const result = operation();
        const metrics = monitor.stop();
        if (operationName) {
            console.debug(`${operationName} 執行完成:`, {
                duration: `${metrics.duration}ms`,
                memory: `${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`
            });
        }
        return { result, metrics };
    }
    catch (error) {
        monitor.stop(); // 確保清理
        throw error;
    }
}
//# sourceMappingURL=monitor.js.map