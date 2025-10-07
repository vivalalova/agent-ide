/**
 * 快取系統統一匯出
 *
 * 這個模組提供了完整的快取管理功能，包括：
 * - MemoryCache: 高效能記憶體快取實作
 * - CacheManager: 快取實例管理器
 * - 多種淘汰策略支援 (LRU, LFU, FIFO, TTL, Random)
 * - 統計追蹤和事件監聽
 * - 批次操作支援
 * - 快取預熱功能
 */
export { MemoryCache } from './memory-cache.js';
export { CacheManager, type GlobalStats, type BatchOperationResult } from './cache-manager.js';
export { LRUStrategy, LFUStrategy, FIFOStrategy, TTLStrategy, RandomStrategy, StrategyFactory, type CacheStrategy } from './strategies.js';
export { type CacheItem, type CacheOptions, type CacheStats, type CacheEvent, type CacheEventListener, type CacheManagerOptions, type WarmupConfig, type PersistenceConfig, type BatchResult, type CacheQueryOptions, type CacheEntry, type SerializableValue, type SerializableObject, type SerializableArray, EvictionStrategy, CacheEventType } from './types.js';
export declare const DEFAULT_CACHE_OPTIONS: {
    maxSize: number;
    maxMemory: number;
    defaultTTL: number;
    evictionStrategy: string;
    enableStats: boolean;
    cleanupInterval: number;
};
export declare const DEFAULT_MANAGER_OPTIONS: {
    enableGlobalStats: boolean;
    warmupConfig: {
        enabled: boolean;
        strategy: string;
    };
    persistenceConfig: {
        enabled: boolean;
        interval: number;
        compression: boolean;
        backup: {
            enabled: boolean;
            maxBackups: number;
        };
    };
};
/**
 * 工廠函式：建立預設配置的 MemoryCache
 */
export declare function createMemoryCache<K, V>(options?: any): any;
/**
 * 工廠函式：建立預設配置的 CacheManager
 */
export declare function createCacheManager(options?: any): any;
/**
 * 工廠函式：建立 LRU 快取
 */
export declare function createLRUCache<K, V>(maxSize?: number): any;
/**
 * 工廠函式：建立帶 TTL 的快取
 */
export declare function createTTLCache<K, V>(defaultTTL: number, maxSize?: number): any;
/**
 * 工廠函式：建立高效能快取（針對高頻存取優化）
 */
export declare function createHighPerformanceCache<K, V>(options?: {
    maxSize?: number;
    strategy?: any;
}): any;
/**
 * 快取工具函式
 */
export declare class CacheUtils {
    /**
     * 計算快取命中率
     */
    static calculateHitRate(hits: number, misses: number): number;
    /**
     * 格式化記憶體大小
     */
    static formatMemorySize(bytes: number): string;
    /**
     * 合併多個快取統計
     */
    static mergeStats(statsArray: any[]): any;
    /**
     * 產生快取鍵的雜湊值
     */
    static hashKey(key: any): string;
    /**
     * 驗證快取配置的合理性
     */
    static validateCacheOptions(options: any): string[];
}
/**
 * 快取效能監控器
 */
export declare class CacheMonitor {
    private readonly caches;
    constructor(_manager?: any);
    /**
     * 監控單一快取
     */
    addCache(name: string, cache: any): void;
    /**
     * 移除監控的快取
     */
    removeCache(name: string): void;
    /**
     * 取得效能報告
     */
    getPerformanceReport(): {
        caches: Array<{
            name: string;
            stats: any;
            healthScore: number;
        }>;
        overall: {
            totalCaches: number;
            averageHitRate: number;
            totalMemoryUsage: number;
            healthScore: number;
        };
    };
    /**
     * 計算快取健康評分（0-100）
     */
    private calculateHealthScore;
}
/**
 * 版本資訊
 */
export declare const VERSION = "1.0.0";
/**
 * 快取系統資訊
 */
export declare const CACHE_SYSTEM_INFO: {
    readonly name: "Agent IDE Cache System";
    readonly version: "1.0.0";
    readonly description: "高效能快取管理系統，支援多種淘汰策略和統計追蹤";
    readonly author: "Agent IDE Team";
    readonly supportedStrategies: readonly ["lru", "lfu", "fifo", "ttl", "random"];
    readonly features: readonly ["多種淘汰策略 (LRU, LFU, FIFO, TTL, Random)", "記憶體管理和限制", "統計追蹤和效能監控", "事件系統", "批次操作", "快取預熱", "並發安全"];
};
//# sourceMappingURL=index.d.ts.map