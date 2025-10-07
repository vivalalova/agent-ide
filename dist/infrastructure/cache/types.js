/**
 * 快取系統的核心型別定義
 */
/**
 * 淘汰策略列舉
 */
export var EvictionStrategy;
(function (EvictionStrategy) {
    /** Least Recently Used - 最近最少使用 */
    EvictionStrategy["LRU"] = "lru";
    /** Least Frequently Used - 最不常使用 */
    EvictionStrategy["LFU"] = "lfu";
    /** First In First Out - 先進先出 */
    EvictionStrategy["FIFO"] = "fifo";
    /** Time To Live - 基於過期時間 */
    EvictionStrategy["TTL"] = "ttl";
    /** Random - 隨機淘汰 */
    EvictionStrategy["RANDOM"] = "random";
})(EvictionStrategy || (EvictionStrategy = {}));
/**
 * 快取事件類型
 */
export var CacheEventType;
(function (CacheEventType) {
    /** 項目被設定 */
    CacheEventType["SET"] = "set";
    /** 項目被取得 */
    CacheEventType["GET"] = "get";
    /** 項目被刪除 */
    CacheEventType["DELETE"] = "delete";
    /** 項目被淘汰 */
    CacheEventType["EVICT"] = "evict";
    /** 項目過期 */
    CacheEventType["EXPIRE"] = "expire";
    /** 快取被清空 */
    CacheEventType["CLEAR"] = "clear";
    /** 快取命中 */
    CacheEventType["HIT"] = "hit";
    /** 快取未命中 */
    CacheEventType["MISS"] = "miss";
})(CacheEventType || (CacheEventType = {}));
//# sourceMappingURL=types.js.map