import { EvictionStrategy, type CacheItem } from './types.js';
/**
 * 快取策略介面
 */
export interface CacheStrategy<K, V> {
    /**
     * 策略名稱
     */
    readonly name: EvictionStrategy;
    /**
     * 當項目被存取時呼叫
     */
    onAccess(key: K, item: CacheItem<V>): void;
    /**
     * 當項目被設定時呼叫
     */
    onSet(key: K, item: CacheItem<V>): void;
    /**
     * 當項目被刪除時呼叫
     */
    onDelete(key: K): void;
    /**
     * 選擇要淘汰的項目
     */
    selectEvictionKey(items: Map<K, CacheItem<V>>): K | undefined;
    /**
     * 清理策略內部狀態
     */
    clear(): void;
}
/**
 * LRU (Least Recently Used) 策略實作
 */
export declare class LRUStrategy<K, V> implements CacheStrategy<K, V> {
    readonly name = EvictionStrategy.LRU;
    private head?;
    private tail?;
    private nodes;
    onAccess(key: K, _item: CacheItem<V>): void;
    onSet(key: K, _item: CacheItem<V>): void;
    onDelete(key: K): void;
    selectEvictionKey(_items: Map<K, CacheItem<V>>): K | undefined;
    clear(): void;
    private addToHead;
    private moveToHead;
    private removeNode;
}
/**
 * LFU (Least Frequently Used) 策略實作
 */
export declare class LFUStrategy<K, V> implements CacheStrategy<K, V> {
    readonly name = EvictionStrategy.LFU;
    private frequencies;
    onAccess(key: K, item: CacheItem<V>): void;
    onSet(key: K, _item: CacheItem<V>): void;
    onDelete(key: K): void;
    selectEvictionKey(items: Map<K, CacheItem<V>>): K | undefined;
    clear(): void;
}
/**
 * FIFO (First In First Out) 策略實作
 */
export declare class FIFOStrategy<K, V> implements CacheStrategy<K, V> {
    readonly name = EvictionStrategy.FIFO;
    onAccess(_key: K, _item: CacheItem<V>): void;
    onSet(_key: K, _item: CacheItem<V>): void;
    onDelete(_key: K): void;
    selectEvictionKey(items: Map<K, CacheItem<V>>): K | undefined;
    clear(): void;
}
/**
 * TTL (Time To Live) 策略實作
 */
export declare class TTLStrategy<K, V> implements CacheStrategy<K, V> {
    readonly name = EvictionStrategy.TTL;
    onAccess(_key: K, _item: CacheItem<V>): void;
    onSet(_key: K, _item: CacheItem<V>): void;
    onDelete(_key: K): void;
    selectEvictionKey(items: Map<K, CacheItem<V>>): K | undefined;
    clear(): void;
}
/**
 * Random 隨機策略實作
 */
export declare class RandomStrategy<K, V> implements CacheStrategy<K, V> {
    readonly name = EvictionStrategy.RANDOM;
    onAccess(_key: K, _item: CacheItem<V>): void;
    onSet(_key: K, _item: CacheItem<V>): void;
    onDelete(_key: K): void;
    selectEvictionKey(items: Map<K, CacheItem<V>>): K | undefined;
    clear(): void;
}
/**
 * 策略工廠
 */
export declare class StrategyFactory {
    static createStrategy<K, V>(strategy: EvictionStrategy): CacheStrategy<K, V>;
}
//# sourceMappingURL=strategies.d.ts.map