import { EvictionStrategy } from './types.js';
/**
 * LRU (Least Recently Used) 策略實作
 */
export class LRUStrategy {
    name = EvictionStrategy.LRU;
    head;
    tail;
    nodes = new Map();
    onAccess(key, _item) {
        this.moveToHead(key);
    }
    onSet(key, _item) {
        if (this.nodes.has(key)) {
            this.moveToHead(key);
        }
        else {
            this.addToHead(key);
        }
    }
    onDelete(key) {
        this.removeNode(key);
    }
    selectEvictionKey(_items) {
        return this.tail?.key;
    }
    clear() {
        this.head = this.tail = undefined;
        this.nodes.clear();
    }
    addToHead(key) {
        const node = { key };
        if (!this.head) {
            this.head = node;
            this.tail = node;
        }
        else {
            node.next = this.head;
            this.head.prev = node;
            this.head = node;
        }
        this.nodes.set(key, node);
    }
    moveToHead(key) {
        const node = this.nodes.get(key);
        if (!node || node === this.head) {
            return;
        }
        // 從當前位置移除
        if (node.prev) {
            node.prev.next = node.next;
        }
        if (node.next) {
            node.next.prev = node.prev;
        }
        if (node === this.tail) {
            this.tail = node.prev;
        }
        // 移動到頭部
        node.prev = undefined;
        node.next = this.head;
        if (this.head) {
            this.head.prev = node;
        }
        this.head = node;
    }
    removeNode(key) {
        const node = this.nodes.get(key);
        if (!node) {
            return;
        }
        if (node.prev) {
            node.prev.next = node.next;
        }
        if (node.next) {
            node.next.prev = node.prev;
        }
        if (node === this.head) {
            this.head = node.next;
        }
        if (node === this.tail) {
            this.tail = node.prev;
        }
        this.nodes.delete(key);
    }
}
/**
 * LFU (Least Frequently Used) 策略實作
 */
export class LFUStrategy {
    name = EvictionStrategy.LFU;
    frequencies = new Map();
    onAccess(key, item) {
        // 存取次數已在 CacheItem 中追蹤，這裡只需要更新內部狀態
        this.frequencies.set(key, item.accessCount);
    }
    onSet(key, _item) {
        this.frequencies.set(key, 0);
    }
    onDelete(key) {
        this.frequencies.delete(key);
    }
    selectEvictionKey(items) {
        let minFrequency = Infinity;
        let keyToEvict;
        for (const [key, item] of items.entries()) {
            if (item.accessCount < minFrequency) {
                minFrequency = item.accessCount;
                keyToEvict = key;
            }
        }
        return keyToEvict;
    }
    clear() {
        this.frequencies.clear();
    }
}
/**
 * FIFO (First In First Out) 策略實作
 */
export class FIFOStrategy {
    name = EvictionStrategy.FIFO;
    onAccess(_key, _item) {
        // FIFO 不需要在存取時做任何事
    }
    onSet(_key, _item) {
        // FIFO 不需要在設定時做任何事，因為時間戳記在 CacheItem 中
    }
    onDelete(_key) {
        // FIFO 不需要在刪除時做任何事
    }
    selectEvictionKey(items) {
        let earliestTime = Infinity;
        let keyToEvict;
        for (const [key, item] of items.entries()) {
            if (item.createdAt < earliestTime) {
                earliestTime = item.createdAt;
                keyToEvict = key;
            }
        }
        return keyToEvict;
    }
    clear() {
        // FIFO 不需要清理任何狀態
    }
}
/**
 * TTL (Time To Live) 策略實作
 */
export class TTLStrategy {
    name = EvictionStrategy.TTL;
    onAccess(_key, _item) {
        // TTL 不需要在存取時做任何事
    }
    onSet(_key, _item) {
        // TTL 不需要在設定時做任何事
    }
    onDelete(_key) {
        // TTL 不需要在刪除時做任何事
    }
    selectEvictionKey(items) {
        const now = Date.now();
        let earliestExpiry = Infinity;
        let keyToEvict;
        for (const [key, item] of items.entries()) {
            if (item.expiresAt) {
                if (now >= item.expiresAt) {
                    // 已過期，優先淘汰
                    return key;
                }
                if (item.expiresAt < earliestExpiry) {
                    earliestExpiry = item.expiresAt;
                    keyToEvict = key;
                }
            }
        }
        return keyToEvict;
    }
    clear() {
        // TTL 不需要清理任何狀態
    }
}
/**
 * Random 隨機策略實作
 */
export class RandomStrategy {
    name = EvictionStrategy.RANDOM;
    onAccess(_key, _item) {
        // Random 不需要在存取時做任何事
    }
    onSet(_key, _item) {
        // Random 不需要在設定時做任何事
    }
    onDelete(_key) {
        // Random 不需要在刪除時做任何事
    }
    selectEvictionKey(items) {
        const keys = Array.from(items.keys());
        if (keys.length === 0) {
            return undefined;
        }
        const randomIndex = Math.floor(Math.random() * keys.length);
        return keys[randomIndex];
    }
    clear() {
        // Random 不需要清理任何狀態
    }
}
/**
 * 策略工廠
 */
export class StrategyFactory {
    static createStrategy(strategy) {
        switch (strategy) {
            case EvictionStrategy.LRU:
                return new LRUStrategy();
            case EvictionStrategy.LFU:
                return new LFUStrategy();
            case EvictionStrategy.FIFO:
                return new FIFOStrategy();
            case EvictionStrategy.TTL:
                return new TTLStrategy();
            case EvictionStrategy.RANDOM:
                return new RandomStrategy();
            default:
                throw new Error(`Unsupported eviction strategy: ${strategy}`);
        }
    }
}
//# sourceMappingURL=strategies.js.map