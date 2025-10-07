/**
 * Performance Cache Manager
 * 為效能分析提供智能快取管理
 */
/**
 * 快取策略
 */
export var CacheStrategy;
(function (CacheStrategy) {
    CacheStrategy["LRU"] = "lru";
    CacheStrategy["LFU"] = "lfu";
    CacheStrategy["TTL"] = "ttl";
    CacheStrategy["HYBRID"] = "hybrid"; // 混合策略
})(CacheStrategy || (CacheStrategy = {}));
/**
 * 預設快取配置
 */
export const DEFAULT_CACHE_CONFIG = {
    maxSize: 1000,
    defaultTtl: 30 * 60 * 1000, // 30分鐘
    strategy: CacheStrategy.HYBRID,
    cleanupInterval: 5 * 60 * 1000, // 5分鐘
    enableStats: true
};
/**
 * 效能快取管理器
 */
export class PerformanceCacheManager {
    cache = new Map();
    config;
    stats;
    cleanupTimer;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
        this.stats = {
            hits: 0,
            misses: 0,
            hitRate: 0,
            size: 0,
            itemCount: 0
        };
        // 啟動定期清理
        if (this.config.cleanupInterval) {
            this.startCleanupTimer();
        }
    }
    /**
     * 獲取快取項目
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            this.updateStats('miss');
            return null;
        }
        // 檢查 TTL
        if (this.isExpired(item)) {
            this.cache.delete(key);
            this.updateStats('miss');
            return null;
        }
        // 更新訪問資訊
        item.accessCount++;
        item.lastAccessed = new Date();
        this.updateStats('hit');
        return item.value;
    }
    /**
     * 設置快取項目
     */
    set(key, value, ttl) {
        // 檢查是否需要清理空間
        if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
            this.evictItems(1);
        }
        const now = new Date();
        const item = {
            value,
            timestamp: now,
            accessCount: 1,
            lastAccessed: now,
            ttl: ttl || this.config.defaultTtl
        };
        this.cache.set(key, item);
        this.updateStatsSize();
    }
    /**
     * 檢查是否存在
     */
    has(key) {
        const item = this.cache.get(key);
        return item !== undefined && !this.isExpired(item);
    }
    /**
     * 刪除快取項目
     */
    delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.updateStatsSize();
        }
        return deleted;
    }
    /**
     * 清空快取
     */
    clear() {
        this.cache.clear();
        this.updateStatsSize();
    }
    /**
     * 獲取快取統計
     */
    getStatistics() {
        return { ...this.stats };
    }
    /**
     * 重置統計
     */
    resetStatistics() {
        this.stats = {
            hits: 0,
            misses: 0,
            hitRate: 0,
            size: this.calculateSize(),
            itemCount: this.cache.size
        };
    }
    /**
     * 獲取所有鍵
     */
    keys() {
        return Array.from(this.cache.keys());
    }
    /**
     * 獲取快取項目數
     */
    size() {
        return this.cache.size;
    }
    /**
     * 手動清理過期項目
     */
    cleanup() {
        const initialSize = this.cache.size;
        const now = new Date();
        for (const [key, item] of this.cache) {
            if (this.isExpired(item, now)) {
                this.cache.delete(key);
            }
        }
        const cleanedCount = initialSize - this.cache.size;
        if (cleanedCount > 0) {
            this.updateStatsSize();
        }
        return cleanedCount;
    }
    /**
     * 根據模式刪除項目
     */
    deleteByPattern(pattern) {
        let deletedCount = 0;
        for (const key of this.cache.keys()) {
            if (pattern.test(key)) {
                this.cache.delete(key);
                deletedCount++;
            }
        }
        if (deletedCount > 0) {
            this.updateStatsSize();
        }
        return deletedCount;
    }
    /**
     * 預熱快取
     */
    async warmup(loader, keys) {
        const promises = keys.map(async (key) => {
            if (!this.has(key)) {
                try {
                    const value = await loader(key);
                    this.set(key, value);
                }
                catch (error) {
                    console.warn(`快取預熱失敗: ${key}`, error);
                }
            }
        });
        await Promise.all(promises);
    }
    /**
     * 批量獲取
     */
    getBatch(keys) {
        const result = new Map();
        for (const key of keys) {
            const value = this.get(key);
            if (value !== null) {
                result.set(key, value);
            }
        }
        return result;
    }
    /**
     * 批量設置
     */
    setBatch(items, ttl) {
        for (const [key, value] of items) {
            this.set(key, value, ttl);
        }
    }
    /**
     * 獲取快取使用情況
     */
    getUsageInfo() {
        let oldestItem = null;
        let newestItem = null;
        let mostAccessed = null;
        for (const [key, item] of this.cache) {
            // 找最舊和最新項目
            if (!oldestItem || item.timestamp < oldestItem) {
                oldestItem = item.timestamp;
            }
            if (!newestItem || item.timestamp > newestItem) {
                newestItem = item.timestamp;
            }
            // 找最常訪問項目
            if (!mostAccessed || item.accessCount > mostAccessed.count) {
                mostAccessed = { key, count: item.accessCount };
            }
        }
        return {
            memoryUsage: this.calculateSize(),
            itemCount: this.cache.size,
            oldestItem,
            newestItem,
            mostAccessed
        };
    }
    /**
     * 清理資源
     */
    dispose() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
        this.clear();
    }
    /**
     * 檢查項目是否過期
     */
    isExpired(item, now = new Date()) {
        if (!item.ttl)
            return false;
        return now.getTime() - item.timestamp.getTime() > item.ttl;
    }
    /**
     * 淘汰項目
     */
    evictItems(count) {
        const itemsToEvict = [];
        switch (this.config.strategy) {
            case CacheStrategy.LRU:
                itemsToEvict.push(...this.getLRUItems(count));
                break;
            case CacheStrategy.LFU:
                itemsToEvict.push(...this.getLFUItems(count));
                break;
            case CacheStrategy.TTL:
                itemsToEvict.push(...this.getExpiredItems());
                break;
            case CacheStrategy.HYBRID:
            default:
                // 先淘汰過期項目，然後使用 LRU
                itemsToEvict.push(...this.getExpiredItems());
                const remaining = count - itemsToEvict.length;
                if (remaining > 0) {
                    itemsToEvict.push(...this.getLRUItems(remaining));
                }
                break;
        }
        for (const [key] of itemsToEvict) {
            this.cache.delete(key);
        }
    }
    /**
     * 獲取 LRU 項目
     */
    getLRUItems(count) {
        return Array.from(this.cache.entries())
            .sort(([, a], [, b]) => a.lastAccessed.getTime() - b.lastAccessed.getTime())
            .slice(0, count);
    }
    /**
     * 獲取 LFU 項目
     */
    getLFUItems(count) {
        return Array.from(this.cache.entries())
            .sort(([, a], [, b]) => a.accessCount - b.accessCount)
            .slice(0, count);
    }
    /**
     * 獲取過期項目
     */
    getExpiredItems() {
        const now = new Date();
        return Array.from(this.cache.entries())
            .filter(([, item]) => this.isExpired(item, now));
    }
    /**
     * 啟動清理定時器
     */
    startCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.config.cleanupInterval);
    }
    /**
     * 更新統計資訊
     */
    updateStats(type) {
        if (!this.config.enableStats)
            return;
        if (type === 'hit') {
            this.stats.hits++;
        }
        else {
            this.stats.misses++;
        }
        const total = this.stats.hits + this.stats.misses;
        this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    }
    /**
     * 更新大小統計
     */
    updateStatsSize() {
        if (!this.config.enableStats)
            return;
        this.stats.size = this.calculateSize();
        this.stats.itemCount = this.cache.size;
    }
    /**
     * 計算快取大小（估算）
     */
    calculateSize() {
        let size = 0;
        for (const [key, item] of this.cache) {
            // 估算鍵的大小
            size += key.length * 2; // UTF-16
            // 估算值的大小（簡化）
            size += this.estimateObjectSize(item);
        }
        return size;
    }
    /**
     * 估算物件大小
     */
    estimateObjectSize(obj) {
        const str = JSON.stringify(obj);
        return str.length * 2; // UTF-16
    }
}
/**
 * 全域效能快取實例
 */
export const globalPerformanceCache = new PerformanceCacheManager({
    maxSize: 500,
    strategy: CacheStrategy.HYBRID,
    enableStats: true
});
//# sourceMappingURL=cache-manager.js.map