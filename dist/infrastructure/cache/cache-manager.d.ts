import { MemoryCache } from './memory-cache.js';
import { type CacheOptions, type CacheManagerOptions, type CacheEventListener } from './types.js';
/**
 * 全域統計資訊
 */
export interface GlobalStats {
    /** 總快取數量 */
    totalCaches: number;
    /** 總項目數量 */
    totalItems: number;
    /** 總請求次數 */
    totalRequests: number;
    /** 總命中次數 */
    totalHits: number;
    /** 總未命中次數 */
    totalMisses: number;
    /** 全域命中率 */
    globalHitRate: number;
    /** 總記憶體使用量 */
    totalMemoryUsage: number;
    /** 總淘汰次數 */
    totalEvictions: number;
    /** 總過期次數 */
    totalExpirations: number;
}
/**
 * 批次操作結果
 */
export interface BatchOperationResult {
    /** 成功處理的項目 */
    successful: string[];
    /** 失敗的項目 */
    failed: string[];
}
/**
 * 快取管理器 - 管理多個快取實例
 */
export declare class CacheManager {
    private readonly caches;
    private readonly options;
    private readonly globalEventListeners;
    private disposed;
    constructor(options?: CacheManagerOptions);
    /**
     * 建立新的快取實例
     */
    createCache<K, V>(name: string, options?: CacheOptions): MemoryCache<K, V>;
    /**
     * 取得現有的快取實例
     */
    getCache<K, V>(name: string): MemoryCache<K, V> | undefined;
    /**
     * 檢查快取是否存在
     */
    hasCache(name: string): boolean;
    /**
     * 刪除快取實例
     */
    deleteCache(name: string): boolean;
    /**
     * 批次刪除快取實例
     */
    deleteCaches(names: string[]): BatchOperationResult;
    /**
     * 列出所有快取名稱
     */
    listCaches(): string[];
    /**
     * 清空指定快取的內容
     */
    clearCache(name: string): boolean;
    /**
     * 批次清空多個快取的內容
     */
    clearCaches(names: string[]): void;
    /**
     * 清空所有快取的內容
     */
    clearAll(): void;
    /**
     * 預熱快取
     */
    warmupCache(name: string): Promise<void>;
    /**
     * 取得全域統計資訊
     */
    getGlobalStats(): GlobalStats;
    /**
     * 添加全域事件監聽器
     */
    addGlobalEventListener(listener: CacheEventListener<any, any>): void;
    /**
     * 移除全域事件監聽器
     */
    removeGlobalEventListener(listener: CacheEventListener<any, any>): void;
    /**
     * 銷毀管理器和所有快取
     */
    dispose(): void;
    /**
     * 取得管理器配置
     */
    getOptions(): Readonly<CacheManagerOptions>;
    /**
     * 檢查管理器是否已被銷毀
     */
    private checkDisposed;
    /**
     * 處理快取事件（用於全域統計和事件轉發）
     */
    private handleCacheEvent;
}
//# sourceMappingURL=cache-manager.d.ts.map