/**
 * Performance Memory Manager
 * 提供記憶體監控、管理和優化功能
 */
import { MemorySnapshot } from './interfaces.js';
/**
 * 記憶體閾值配置
 */
export interface MemoryThresholds {
    /** 警告閾值（位元組） */
    warning: number;
    /** 錯誤閾值（位元組） */
    error: number;
    /** 最大堆大小（位元組） */
    maxHeapSize?: number;
    /** GC 觸發閾值（位元組） */
    gcThreshold?: number;
}
/**
 * 記憶體使用統計
 */
export interface MemoryUsageStats {
    /** 當前記憶體使用 */
    current: MemorySnapshot;
    /** 峰值記憶體使用 */
    peak: MemorySnapshot;
    /** 平均記憶體使用 */
    average: MemorySnapshot;
    /** GC 次數 */
    gcCount: number;
    /** 記憶體洩漏檢測結果 */
    leakDetection: {
        suspected: boolean;
        growthRate: number;
        stableTime: number;
    };
}
/**
 * 記憶體管理配置
 */
export interface MemoryManagerConfig {
    /** 記憶體閾值 */
    thresholds: MemoryThresholds;
    /** 監控間隔（毫秒） */
    monitoringInterval: number;
    /** 快照保留數量 */
    maxSnapshots: number;
    /** 自動 GC */
    autoGc: boolean;
    /** 洩漏檢測 */
    leakDetection: boolean;
    /** 記憶體限制 */
    memoryLimit?: number;
}
/**
 * 預設記憶體管理配置
 */
export declare const DEFAULT_MEMORY_CONFIG: MemoryManagerConfig;
/**
 * 記憶體事件類型
 */
export declare enum MemoryEventType {
    WARNING = "warning",
    ERROR = "error",
    GC_TRIGGERED = "gc_triggered",
    LEAK_DETECTED = "leak_detected",
    LIMIT_EXCEEDED = "limit_exceeded"
}
/**
 * 記憶體事件
 */
export interface MemoryEvent {
    type: MemoryEventType;
    timestamp: Date;
    snapshot: MemorySnapshot;
    message: string;
    data?: any;
}
/**
 * 記憶體事件監聽器
 */
export type MemoryEventListener = (event: MemoryEvent) => void;
/**
 * 效能記憶體管理器
 */
export declare class PerformanceMemoryManager {
    private config;
    private snapshots;
    private listeners;
    private monitoringTimer?;
    private isMonitoring;
    private gcCount;
    private peakSnapshot?;
    constructor(config?: Partial<MemoryManagerConfig>);
    /**
     * 開始記憶體監控
     */
    startMonitoring(): void;
    /**
     * 停止記憶體監控
     */
    stopMonitoring(): void;
    /**
     * 記錄記憶體快照
     */
    recordSnapshot(): MemorySnapshot;
    /**
     * 獲取當前記憶體快照
     */
    getCurrentSnapshot(): MemorySnapshot;
    /**
     * 獲取記憶體使用統計
     */
    getUsageStats(): MemoryUsageStats;
    /**
     * 檢查記憶體使用量
     */
    private checkMemoryUsage;
    /**
     * 觸發垃圾回收
     */
    triggerGarbageCollection(): boolean;
    /**
     * 檢測記憶體洩漏
     */
    private detectMemoryLeak;
    /**
     * 計算記憶體穩定時間
     */
    private calculateStableTime;
    /**
     * 計算變異數
     */
    private calculateVariance;
    /**
     * 計算平均記憶體快照
     */
    private calculateAverageSnapshot;
    /**
     * 註冊事件監聽器
     */
    on(eventType: MemoryEventType, listener: MemoryEventListener): void;
    /**
     * 移除事件監聽器
     */
    off(eventType: MemoryEventType, listener: MemoryEventListener): void;
    /**
     * 發送事件
     */
    private emitEvent;
    /**
     * 獲取記憶體快照歷史
     */
    getSnapshots(): MemorySnapshot[];
    /**
     * 清理快照歷史
     */
    clearSnapshots(): void;
    /**
     * 格式化位元組數
     */
    private formatBytes;
    /**
     * 獲取記憶體使用建議
     */
    getOptimizationSuggestions(): string[];
    /**
     * 清理資源
     */
    dispose(): void;
}
/**
 * 全域記憶體管理器實例
 */
export declare const globalMemoryManager: PerformanceMemoryManager;
//# sourceMappingURL=memory-manager.d.ts.map