/**
 * Performance Cache Manager
 * 為效能分析提供智能快取管理
 */
import { CacheStatistics } from './interfaces.js';
/**
 * 快取策略
 */
export declare enum CacheStrategy {
    LRU = "lru",// 最近最少使用
    LFU = "lfu",// 最少頻率使用
    TTL = "ttl",// 基於時間
    HYBRID = "hybrid"
}
/**
 * 快取配置
 */
export interface CacheConfig {
    /** 最大快取項目數 */
    maxSize: number;
    /** 預設 TTL（毫秒） */
    defaultTtl?: number;
    /** 快取策略 */
    strategy: CacheStrategy;
    /** 清理間隔（毫秒） */
    cleanupInterval?: number;
    /** 啟用統計 */
    enableStats: boolean;
}
/**
 * 預設快取配置
 */
export declare const DEFAULT_CACHE_CONFIG: CacheConfig;
/**
 * 效能快取管理器
 */
export declare class PerformanceCacheManager<T = any> {
    private cache;
    private config;
    private stats;
    private cleanupTimer?;
    constructor(config?: Partial<CacheConfig>);
    /**
     * 獲取快取項目
     */
    get(key: string): T | null;
    /**
     * 設置快取項目
     */
    set(key: string, value: T, ttl?: number): void;
    /**
     * 檢查是否存在
     */
    has(key: string): boolean;
    /**
     * 刪除快取項目
     */
    delete(key: string): boolean;
    /**
     * 清空快取
     */
    clear(): void;
    /**
     * 獲取快取統計
     */
    getStatistics(): CacheStatistics;
    /**
     * 重置統計
     */
    resetStatistics(): void;
    /**
     * 獲取所有鍵
     */
    keys(): string[];
    /**
     * 獲取快取項目數
     */
    size(): number;
    /**
     * 手動清理過期項目
     */
    cleanup(): number;
    /**
     * 根據模式刪除項目
     */
    deleteByPattern(pattern: RegExp): number;
    /**
     * 預熱快取
     */
    warmup(loader: (key: string) => Promise<T>, keys: string[]): Promise<void>;
    /**
     * 批量獲取
     */
    getBatch(keys: string[]): Map<string, T>;
    /**
     * 批量設置
     */
    setBatch(items: Map<string, T>, ttl?: number): void;
    /**
     * 獲取快取使用情況
     */
    getUsageInfo(): {
        memoryUsage: number;
        itemCount: number;
        oldestItem: Date | null;
        newestItem: Date | null;
        mostAccessed: {
            key: string;
            count: number;
        } | null;
    };
    /**
     * 清理資源
     */
    dispose(): void;
    /**
     * 檢查項目是否過期
     */
    private isExpired;
    /**
     * 淘汰項目
     */
    private evictItems;
    /**
     * 獲取 LRU 項目
     */
    private getLRUItems;
    /**
     * 獲取 LFU 項目
     */
    private getLFUItems;
    /**
     * 獲取過期項目
     */
    private getExpiredItems;
    /**
     * 啟動清理定時器
     */
    private startCleanupTimer;
    /**
     * 更新統計資訊
     */
    private updateStats;
    /**
     * 更新大小統計
     */
    private updateStatsSize;
    /**
     * 計算快取大小（估算）
     */
    private calculateSize;
    /**
     * 估算物件大小
     */
    private estimateObjectSize;
}
/**
 * 全域效能快取實例
 */
export declare const globalPerformanceCache: PerformanceCacheManager<any>;
//# sourceMappingURL=cache-manager.d.ts.map