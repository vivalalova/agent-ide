/**
 * Performance Memory Manager
 * 提供記憶體監控、管理和優化功能
 */
/**
 * 預設記憶體管理配置
 */
export const DEFAULT_MEMORY_CONFIG = {
    thresholds: {
        warning: 256 * 1024 * 1024, // 256MB
        error: 512 * 1024 * 1024, // 512MB
        gcThreshold: 128 * 1024 * 1024 // 128MB
    },
    monitoringInterval: 5000, // 5秒
    maxSnapshots: 100,
    autoGc: true,
    leakDetection: true
};
/**
 * 記憶體事件類型
 */
export var MemoryEventType;
(function (MemoryEventType) {
    MemoryEventType["WARNING"] = "warning";
    MemoryEventType["ERROR"] = "error";
    MemoryEventType["GC_TRIGGERED"] = "gc_triggered";
    MemoryEventType["LEAK_DETECTED"] = "leak_detected";
    MemoryEventType["LIMIT_EXCEEDED"] = "limit_exceeded";
})(MemoryEventType || (MemoryEventType = {}));
/**
 * 效能記憶體管理器
 */
export class PerformanceMemoryManager {
    config;
    snapshots = [];
    listeners = new Map();
    monitoringTimer;
    isMonitoring = false;
    gcCount = 0;
    peakSnapshot;
    constructor(config = {}) {
        this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
        // 初始化事件監聽器映射
        Object.values(MemoryEventType).forEach(type => {
            this.listeners.set(type, []);
        });
        // 監聽 Node.js GC 事件（如果可用）
        if (global.gc) {
            const originalGc = global.gc;
            global.gc = async () => {
                this.gcCount++;
                this.emitEvent(MemoryEventType.GC_TRIGGERED, '手動觸發垃圾回收');
                return originalGc();
            };
        }
    }
    /**
     * 開始記憶體監控
     */
    startMonitoring() {
        if (this.isMonitoring) {
            return;
        }
        this.isMonitoring = true;
        this.recordSnapshot(); // 記錄初始快照
        this.monitoringTimer = setInterval(() => {
            this.checkMemoryUsage();
        }, this.config.monitoringInterval);
    }
    /**
     * 停止記憶體監控
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }
        this.isMonitoring = false;
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = undefined;
        }
    }
    /**
     * 記錄記憶體快照
     */
    recordSnapshot() {
        const memory = process.memoryUsage();
        const snapshot = {
            timestamp: new Date(),
            heapUsed: memory.heapUsed,
            heapTotal: memory.heapTotal,
            rss: memory.rss,
            external: memory.external,
            arrayBuffers: memory.arrayBuffers
        };
        this.snapshots.push(snapshot);
        // 維護快照數量限制
        if (this.snapshots.length > this.config.maxSnapshots) {
            this.snapshots.shift();
        }
        // 更新峰值
        if (!this.peakSnapshot || snapshot.heapUsed > this.peakSnapshot.heapUsed) {
            this.peakSnapshot = { ...snapshot };
        }
        return snapshot;
    }
    /**
     * 獲取當前記憶體快照
     */
    getCurrentSnapshot() {
        return this.recordSnapshot();
    }
    /**
     * 獲取記憶體使用統計
     */
    getUsageStats() {
        if (this.snapshots.length === 0) {
            this.recordSnapshot();
        }
        const current = this.snapshots[this.snapshots.length - 1];
        const peak = this.peakSnapshot || current;
        const average = this.calculateAverageSnapshot();
        const leakDetection = this.detectMemoryLeak();
        return {
            current,
            peak,
            average,
            gcCount: this.gcCount,
            leakDetection
        };
    }
    /**
     * 檢查記憶體使用量
     */
    checkMemoryUsage() {
        const snapshot = this.recordSnapshot();
        const { thresholds } = this.config;
        // 檢查記憶體限制
        if (this.config.memoryLimit && snapshot.heapUsed > this.config.memoryLimit) {
            this.emitEvent(MemoryEventType.LIMIT_EXCEEDED, `記憶體使用超過限制: ${this.formatBytes(snapshot.heapUsed)}/${this.formatBytes(this.config.memoryLimit)}`);
        }
        // 檢查錯誤閾值
        if (snapshot.heapUsed > thresholds.error) {
            this.emitEvent(MemoryEventType.ERROR, `記憶體使用過高: ${this.formatBytes(snapshot.heapUsed)}`);
            if (this.config.autoGc) {
                this.triggerGarbageCollection();
            }
        }
        // 檢查警告閾值
        else if (snapshot.heapUsed > thresholds.warning) {
            this.emitEvent(MemoryEventType.WARNING, `記憶體使用警告: ${this.formatBytes(snapshot.heapUsed)}`);
        }
        // 檢查是否需要觸發 GC
        if (this.config.autoGc &&
            thresholds.gcThreshold &&
            snapshot.heapUsed > thresholds.gcThreshold) {
            this.triggerGarbageCollection();
        }
        // 記憶體洩漏檢測
        if (this.config.leakDetection) {
            const leakInfo = this.detectMemoryLeak();
            if (leakInfo.suspected) {
                this.emitEvent(MemoryEventType.LEAK_DETECTED, `疑似記憶體洩漏，增長率: ${this.formatBytes(leakInfo.growthRate)}/秒`, leakInfo);
            }
        }
    }
    /**
     * 觸發垃圾回收
     */
    triggerGarbageCollection() {
        if (!global.gc) {
            console.warn('垃圾回收不可用，請使用 --expose-gc 參數啟動 Node.js');
            return false;
        }
        try {
            global.gc();
            this.gcCount++;
            this.emitEvent(MemoryEventType.GC_TRIGGERED, '自動觸發垃圾回收');
            return true;
        }
        catch (error) {
            console.error('垃圾回收失敗:', error);
            return false;
        }
    }
    /**
     * 檢測記憶體洩漏
     */
    detectMemoryLeak() {
        if (this.snapshots.length < 10) {
            return { suspected: false, growthRate: 0, stableTime: 0 };
        }
        // 計算最近 10 個快照的記憶體增長率
        const recentSnapshots = this.snapshots.slice(-10);
        const timeSpan = recentSnapshots[recentSnapshots.length - 1].timestamp.getTime() -
            recentSnapshots[0].timestamp.getTime();
        const memoryGrowth = recentSnapshots[recentSnapshots.length - 1].heapUsed -
            recentSnapshots[0].heapUsed;
        const growthRate = timeSpan > 0 ? (memoryGrowth / timeSpan) * 1000 : 0; // 每秒位元組
        // 檢查記憶體是否持續增長（簡化的洩漏檢測）
        const isGrowing = growthRate > 1024 * 10; // 每秒增長超過 10KB
        const stableTime = this.calculateStableTime();
        return {
            suspected: isGrowing && stableTime < 30000, // 30秒內不穩定
            growthRate,
            stableTime
        };
    }
    /**
     * 計算記憶體穩定時間
     */
    calculateStableTime() {
        if (this.snapshots.length < 5) {
            return 0;
        }
        const recent = this.snapshots.slice(-5);
        const variance = this.calculateVariance(recent.map(s => s.heapUsed));
        const threshold = 1024 * 1024; // 1MB
        return variance < threshold ?
            recent[recent.length - 1].timestamp.getTime() - recent[0].timestamp.getTime() :
            0;
    }
    /**
     * 計算變異數
     */
    calculateVariance(values) {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return variance;
    }
    /**
     * 計算平均記憶體快照
     */
    calculateAverageSnapshot() {
        if (this.snapshots.length === 0) {
            return this.getCurrentSnapshot();
        }
        const sum = this.snapshots.reduce((acc, snapshot) => ({
            heapUsed: acc.heapUsed + snapshot.heapUsed,
            heapTotal: acc.heapTotal + snapshot.heapTotal,
            rss: acc.rss + snapshot.rss,
            external: acc.external + snapshot.external,
            arrayBuffers: acc.arrayBuffers + snapshot.arrayBuffers
        }), {
            heapUsed: 0,
            heapTotal: 0,
            rss: 0,
            external: 0,
            arrayBuffers: 0
        });
        const count = this.snapshots.length;
        return {
            timestamp: new Date(),
            heapUsed: Math.round(sum.heapUsed / count),
            heapTotal: Math.round(sum.heapTotal / count),
            rss: Math.round(sum.rss / count),
            external: Math.round(sum.external / count),
            arrayBuffers: Math.round(sum.arrayBuffers / count)
        };
    }
    /**
     * 註冊事件監聽器
     */
    on(eventType, listener) {
        const listeners = this.listeners.get(eventType);
        if (listeners) {
            listeners.push(listener);
        }
    }
    /**
     * 移除事件監聽器
     */
    off(eventType, listener) {
        const listeners = this.listeners.get(eventType);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
    }
    /**
     * 發送事件
     */
    emitEvent(type, message, data) {
        const event = {
            type,
            timestamp: new Date(),
            snapshot: this.getCurrentSnapshot(),
            message,
            data
        };
        const listeners = this.listeners.get(type);
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(event);
                }
                catch (error) {
                    console.error('記憶體事件監聽器錯誤:', error);
                }
            });
        }
    }
    /**
     * 獲取記憶體快照歷史
     */
    getSnapshots() {
        return [...this.snapshots];
    }
    /**
     * 清理快照歷史
     */
    clearSnapshots() {
        this.snapshots = [];
        this.peakSnapshot = undefined;
    }
    /**
     * 格式化位元組數
     */
    formatBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(2)}${units[unitIndex]}`;
    }
    /**
     * 獲取記憶體使用建議
     */
    getOptimizationSuggestions() {
        const stats = this.getUsageStats();
        const suggestions = [];
        if (stats.current.heapUsed > this.config.thresholds.warning) {
            suggestions.push('記憶體使用量較高，建議檢查是否有未釋放的資源');
        }
        if (stats.leakDetection.suspected) {
            suggestions.push('檢測到疑似記憶體洩漏，建議檢查事件監聽器和定時器是否正確清理');
        }
        if (stats.gcCount > 100) {
            suggestions.push('垃圾回收頻繁，考慮優化物件創建和銷毀模式');
        }
        if (stats.current.heapUsed / stats.current.heapTotal > 0.9) {
            suggestions.push('堆使用率過高，考慮增加堆大小或優化記憶體使用');
        }
        return suggestions;
    }
    /**
     * 清理資源
     */
    dispose() {
        this.stopMonitoring();
        this.clearSnapshots();
        this.listeners.clear();
    }
}
/**
 * 全域記憶體管理器實例
 */
export const globalMemoryManager = new PerformanceMemoryManager();
//# sourceMappingURL=memory-manager.js.map