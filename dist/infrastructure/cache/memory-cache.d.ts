import { type CacheOptions, type CacheStats, type CacheEventListener } from './types.js';
/**
 * 高效能記憶體快取實作，支援多種淘汰策略
 */
export declare class MemoryCache<K, V> {
    private readonly cache;
    private readonly options;
    private readonly listeners;
    private readonly strategy;
    private stats;
    private cleanupTimer?;
    constructor(options?: CacheOptions);
    /**
     * 取得快取值
     */
    get(key: K): V | undefined;
    /**
     * 設定快取值
     */
    set(key: K, value: V, customTTL?: number): void;
    /**
     * 檢查鍵是否存在（不更新存取時間）
     */
    has(key: K): boolean;
    /**
     * 刪除快取項目
     */
    delete(key: K): boolean;
    /**
     * 清空所有快取
     */
    clear(): void;
    /**
     * 取得快取大小
     */
    size(): number;
    /**
     * 批次取得
     */
    mget(keys: K[]): Map<K, V>;
    /**
     * 批次設定
     */
    mset(entries: Array<[K, V]>): void;
    /**
     * 取得統計資訊
     */
    getStats(): CacheStats;
    /**
     * 添加事件監聽器
     */
    addListener(listener: CacheEventListener<K, V>): void;
    /**
     * 移除事件監聽器
     */
    removeListener(listener: CacheEventListener<K, V>): void;
    /**
     * 清理資源
     */
    dispose(): void;
    /**
     * 檢查項目是否過期
     */
    private isExpired;
    /**
     * 計算值的大小（簡單估算）
     */
    private calculateSize;
    /**
     * 啟動清理定時器
     */
    private startCleanupTimer;
    /**
     * 清理過期項目
     */
    private cleanupExpired;
    /**
     * 淘汰項目
     */
    private evict;
    /**
     * 更新命中率
     */
    private updateHitRate;
    /**
     * 更新平均存取時間
     */
    private updateAverageAccessTime;
    /**
     * 發出事件
     */
    private emitEvent;
}
//# sourceMappingURL=memory-cache.d.ts.map