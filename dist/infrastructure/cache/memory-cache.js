import { EvictionStrategy, CacheEventType } from './types.js';
import { StrategyFactory } from './strategies.js';
/**
 * 高效能記憶體快取實作，支援多種淘汰策略
 */
export class MemoryCache {
    cache = new Map();
    options;
    listeners = new Set();
    strategy;
    stats;
    cleanupTimer;
    constructor(options = {}) {
        // 設定預設選項
        this.options = {
            maxSize: options.maxSize ?? 1000,
            maxMemory: options.maxMemory ?? 50 * 1024 * 1024, // 50MB
            defaultTTL: options.defaultTTL ?? 0, // 0 表示永不過期
            evictionStrategy: options.evictionStrategy ?? EvictionStrategy.LRU,
            enableStats: options.enableStats ?? false,
            cleanupInterval: options.cleanupInterval ?? 60000, // 1分鐘
            serialize: options.serialize ?? JSON.stringify,
            deserialize: options.deserialize ?? JSON.parse
        };
        // 建立淘汰策略
        this.strategy = StrategyFactory.createStrategy(this.options.evictionStrategy);
        // 初始化統計
        this.stats = {
            totalRequests: 0,
            hits: 0,
            misses: 0,
            hitRate: 0,
            size: 0,
            memoryUsage: 0,
            evictions: 0,
            expirations: 0,
            averageAccessTime: 0
        };
        // 如果啟用 TTL 或有預設 TTL，啟動清理定時器
        if (this.options.defaultTTL > 0 || this.options.evictionStrategy === EvictionStrategy.TTL) {
            this.startCleanupTimer();
        }
    }
    /**
     * 取得快取值
     */
    get(key) {
        const startTime = Date.now();
        if (this.options.enableStats) {
            this.stats.totalRequests++;
        }
        const item = this.cache.get(key);
        if (!item) {
            if (this.options.enableStats) {
                this.stats.misses++;
                this.updateHitRate();
            }
            this.emitEvent(CacheEventType.MISS, key);
            return undefined;
        }
        // 檢查是否過期
        if (this.isExpired(item)) {
            this.delete(key);
            if (this.options.enableStats) {
                this.stats.misses++;
                this.stats.expirations++;
                this.updateHitRate();
            }
            this.emitEvent(CacheEventType.EXPIRE, key, item.value);
            return undefined;
        }
        // 更新存取資訊
        item.lastAccessedAt = Date.now();
        item.accessCount++;
        // 通知策略項目被存取
        this.strategy.onAccess(key, item);
        if (this.options.enableStats) {
            this.stats.hits++;
            this.updateHitRate();
            this.updateAverageAccessTime(Date.now() - startTime);
        }
        this.emitEvent(CacheEventType.HIT, key, item.value);
        this.emitEvent(CacheEventType.GET, key, item.value);
        return item.value;
    }
    /**
     * 設定快取值
     */
    set(key, value, customTTL) {
        const now = Date.now();
        const ttl = customTTL ?? this.options.defaultTTL;
        const expiresAt = ttl > 0 ? now + ttl : undefined;
        // 如果已存在，先刪除（這樣可以更新 LRU 順序）
        if (this.cache.has(key)) {
            this.delete(key);
        }
        // 檢查是否需要淘汰
        if (this.cache.size >= this.options.maxSize) {
            this.evict();
        }
        // 建立快取項目
        const item = {
            value,
            createdAt: now,
            lastAccessedAt: now,
            accessCount: 0,
            ...(expiresAt && { expiresAt }),
            size: this.calculateSize(value)
        };
        // 儲存到快取
        this.cache.set(key, item);
        // 通知策略項目被設定
        this.strategy.onSet(key, item);
        // 更新統計
        if (this.options.enableStats) {
            this.stats.size = this.cache.size;
            this.stats.memoryUsage += item.size || 0;
        }
        this.emitEvent(CacheEventType.SET, key, value);
    }
    /**
     * 檢查鍵是否存在（不更新存取時間）
     */
    has(key) {
        const item = this.cache.get(key);
        if (!item) {
            return false;
        }
        if (this.isExpired(item)) {
            this.delete(key);
            return false;
        }
        return true;
    }
    /**
     * 刪除快取項目
     */
    delete(key) {
        const item = this.cache.get(key);
        if (!item) {
            return false;
        }
        // 從快取中刪除
        this.cache.delete(key);
        // 通知策略項目被刪除
        this.strategy.onDelete(key);
        // 更新統計
        if (this.options.enableStats) {
            this.stats.size = this.cache.size;
            this.stats.memoryUsage -= item.size || 0;
        }
        this.emitEvent(CacheEventType.DELETE, key, item.value);
        return true;
    }
    /**
     * 清空所有快取
     */
    clear() {
        this.cache.clear();
        this.strategy.clear();
        if (this.options.enableStats) {
            this.stats.size = 0;
            this.stats.memoryUsage = 0;
        }
        this.emitEvent(CacheEventType.CLEAR, undefined);
    }
    /**
     * 取得快取大小
     */
    size() {
        return this.cache.size;
    }
    /**
     * 批次取得
     */
    mget(keys) {
        const result = new Map();
        for (const key of keys) {
            const value = this.get(key);
            if (value !== undefined) {
                result.set(key, value);
            }
        }
        return result;
    }
    /**
     * 批次設定
     */
    mset(entries) {
        for (const [key, value] of entries) {
            this.set(key, value);
        }
    }
    /**
     * 取得統計資訊
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * 添加事件監聽器
     */
    addListener(listener) {
        this.listeners.add(listener);
    }
    /**
     * 移除事件監聽器
     */
    removeListener(listener) {
        this.listeners.delete(listener);
    }
    /**
     * 清理資源
     */
    dispose() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.clear();
        this.listeners.clear();
    }
    // ===== 私有方法 =====
    /**
     * 檢查項目是否過期
     */
    isExpired(item) {
        if (!item.expiresAt) {
            return false;
        }
        return Date.now() > item.expiresAt;
    }
    /**
     * 計算值的大小（簡單估算）
     */
    calculateSize(value) {
        try {
            return JSON.stringify(value).length * 2; // 每個字元約 2 位元組
        }
        catch {
            return 100; // 預設大小
        }
    }
    /**
     * 啟動清理定時器
     */
    startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpired();
        }, this.options.cleanupInterval);
    }
    /**
     * 清理過期項目
     */
    cleanupExpired() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (item.expiresAt && now > item.expiresAt) {
                this.delete(key);
                if (this.options.enableStats) {
                    this.stats.expirations++;
                }
            }
        }
    }
    /**
     * 淘汰項目
     */
    evict() {
        if (this.cache.size === 0) {
            return;
        }
        const keyToEvict = this.strategy.selectEvictionKey(this.cache);
        if (keyToEvict !== undefined) {
            const item = this.cache.get(keyToEvict);
            this.delete(keyToEvict);
            if (this.options.enableStats) {
                this.stats.evictions++;
            }
            this.emitEvent(CacheEventType.EVICT, keyToEvict, item?.value);
        }
    }
    /**
     * 更新命中率
     */
    updateHitRate() {
        if (this.stats.totalRequests > 0) {
            this.stats.hitRate = this.stats.hits / this.stats.totalRequests;
        }
    }
    /**
     * 更新平均存取時間
     */
    updateAverageAccessTime(accessTime) {
        const currentAvg = this.stats.averageAccessTime;
        const totalRequests = this.stats.totalRequests;
        if (totalRequests === 1) {
            this.stats.averageAccessTime = accessTime;
        }
        else {
            this.stats.averageAccessTime = (currentAvg * (totalRequests - 1) + accessTime) / totalRequests;
        }
    }
    /**
     * 發出事件
     */
    emitEvent(type, key, value) {
        if (this.listeners.size === 0) {
            return;
        }
        const event = {
            type,
            key,
            ...(value !== undefined && { value }),
            timestamp: Date.now()
        };
        for (const listener of this.listeners) {
            try {
                listener(event);
            }
            catch (error) {
                // 忽略監聽器錯誤，避免影響快取操作
                console.error('Cache event listener error:', error);
            }
        }
    }
}
//# sourceMappingURL=memory-cache.js.map