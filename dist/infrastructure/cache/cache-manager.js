import { MemoryCache } from './memory-cache.js';
/**
 * 快取管理器 - 管理多個快取實例
 */
export class CacheManager {
    caches = new Map();
    options;
    globalEventListeners = new Set();
    disposed = false;
    constructor(options = {}) {
        this.options = {
            defaultCacheOptions: options.defaultCacheOptions || {},
            enableGlobalStats: options.enableGlobalStats ?? false,
            warmupConfig: {
                enabled: false,
                strategy: 'lazy',
                ...options.warmupConfig
            },
            persistenceConfig: {
                enabled: false,
                interval: 60000,
                compression: false,
                backup: {
                    enabled: false,
                    maxBackups: 3
                },
                ...options.persistenceConfig
            }
        };
    }
    /**
     * 建立新的快取實例
     */
    createCache(name, options) {
        this.checkDisposed();
        if (this.caches.has(name)) {
            throw new Error(`Cache with name "${name}" already exists`);
        }
        // 合併預設配置和自訂配置
        const mergedOptions = {
            ...this.options.defaultCacheOptions,
            ...options
        };
        const cache = new MemoryCache(mergedOptions);
        // 如果啟用全域統計，添加事件監聽器
        if (this.options.enableGlobalStats) {
            cache.addListener(this.handleCacheEvent.bind(this));
        }
        this.caches.set(name, cache);
        return cache;
    }
    /**
     * 取得現有的快取實例
     */
    getCache(name) {
        this.checkDisposed();
        return this.caches.get(name);
    }
    /**
     * 檢查快取是否存在
     */
    hasCache(name) {
        this.checkDisposed();
        return this.caches.has(name);
    }
    /**
     * 刪除快取實例
     */
    deleteCache(name) {
        this.checkDisposed();
        const cache = this.caches.get(name);
        if (!cache) {
            return false;
        }
        cache.dispose();
        this.caches.delete(name);
        return true;
    }
    /**
     * 批次刪除快取實例
     */
    deleteCaches(names) {
        this.checkDisposed();
        const successful = [];
        const failed = [];
        for (const name of names) {
            if (this.deleteCache(name)) {
                successful.push(name);
            }
            else {
                failed.push(name);
            }
        }
        return { successful, failed };
    }
    /**
     * 列出所有快取名稱
     */
    listCaches() {
        this.checkDisposed();
        return Array.from(this.caches.keys());
    }
    /**
     * 清空指定快取的內容
     */
    clearCache(name) {
        this.checkDisposed();
        const cache = this.caches.get(name);
        if (!cache) {
            return false;
        }
        cache.clear();
        return true;
    }
    /**
     * 批次清空多個快取的內容
     */
    clearCaches(names) {
        this.checkDisposed();
        for (const name of names) {
            this.clearCache(name);
        }
    }
    /**
     * 清空所有快取的內容
     */
    clearAll() {
        this.checkDisposed();
        for (const cache of this.caches.values()) {
            cache.clear();
        }
    }
    /**
     * 預熱快取
     */
    async warmupCache(name) {
        this.checkDisposed();
        if (!this.options.warmupConfig.enabled) {
            throw new Error('Cache warmup is disabled');
        }
        const cache = this.caches.get(name);
        if (!cache) {
            throw new Error(`Cache with name "${name}" does not exist`);
        }
        const config = this.options.warmupConfig;
        let loaded = 0;
        let failed = 0;
        try {
            if (config.dataSource) {
                const data = await config.dataSource();
                for (const [key, value] of data.entries()) {
                    try {
                        cache.set(key, value);
                        loaded++;
                    }
                    catch (error) {
                        failed++;
                        console.warn(`Failed to warm up cache item ${key}:`, error);
                    }
                }
            }
        }
        catch (error) {
            failed++;
            console.error('Failed to load warmup data:', error);
        }
        // 呼叫完成回調
        if (config.onComplete) {
            config.onComplete({ loaded, failed });
        }
    }
    /**
     * 取得全域統計資訊
     */
    getGlobalStats() {
        this.checkDisposed();
        if (!this.options.enableGlobalStats) {
            return {
                totalCaches: 0,
                totalItems: 0,
                totalRequests: 0,
                totalHits: 0,
                totalMisses: 0,
                globalHitRate: 0,
                totalMemoryUsage: 0,
                totalEvictions: 0,
                totalExpirations: 0
            };
        }
        let totalItems = 0;
        let totalRequests = 0;
        let totalHits = 0;
        let totalMisses = 0;
        let totalMemoryUsage = 0;
        let totalEvictions = 0;
        let totalExpirations = 0;
        for (const cache of this.caches.values()) {
            const stats = cache.getStats();
            totalItems += stats.size;
            totalRequests += stats.totalRequests;
            totalHits += stats.hits;
            totalMisses += stats.misses;
            totalMemoryUsage += stats.memoryUsage;
            totalEvictions += stats.evictions;
            totalExpirations += stats.expirations;
        }
        const globalHitRate = totalRequests > 0 ? totalHits / totalRequests : 0;
        return {
            totalCaches: this.caches.size,
            totalItems,
            totalRequests,
            totalHits,
            totalMisses,
            globalHitRate,
            totalMemoryUsage,
            totalEvictions,
            totalExpirations
        };
    }
    /**
     * 添加全域事件監聽器
     */
    addGlobalEventListener(listener) {
        this.checkDisposed();
        this.globalEventListeners.add(listener);
    }
    /**
     * 移除全域事件監聽器
     */
    removeGlobalEventListener(listener) {
        this.checkDisposed();
        this.globalEventListeners.delete(listener);
    }
    /**
     * 銷毀管理器和所有快取
     */
    dispose() {
        if (this.disposed) {
            return;
        }
        // 銷毀所有快取實例
        for (const cache of this.caches.values()) {
            cache.dispose();
        }
        this.caches.clear();
        this.globalEventListeners.clear();
        this.disposed = true;
    }
    /**
     * 取得管理器配置
     */
    getOptions() {
        return { ...this.options };
    }
    // ===== 私有方法 =====
    /**
     * 檢查管理器是否已被銷毀
     */
    checkDisposed() {
        if (this.disposed) {
            throw new Error('CacheManager has been disposed');
        }
    }
    /**
     * 處理快取事件（用於全域統計和事件轉發）
     */
    handleCacheEvent(event) {
        // 轉發事件給所有全域監聽器
        for (const listener of this.globalEventListeners) {
            try {
                listener(event);
            }
            catch (error) {
                console.error('Global cache event listener error:', error);
            }
        }
    }
}
//# sourceMappingURL=cache-manager.js.map