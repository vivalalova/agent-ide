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
export class LRUStrategy<K, V> implements CacheStrategy<K, V> {
  readonly name = EvictionStrategy.LRU;

  private head?: LRUNode<K>;
  private tail?: LRUNode<K>;
  private nodes = new Map<K, LRUNode<K>>();

  onAccess(key: K, _item: CacheItem<V>): void {
    this.moveToHead(key);
  }

  onSet(key: K, _item: CacheItem<V>): void {
    if (this.nodes.has(key)) {
      this.moveToHead(key);
    } else {
      this.addToHead(key);
    }
  }

  onDelete(key: K): void {
    this.removeNode(key);
  }

  selectEvictionKey(_items: Map<K, CacheItem<V>>): K | undefined {
    return this.tail?.key;
  }

  clear(): void {
    this.head = this.tail = undefined as any;
    this.nodes.clear();
  }

  private addToHead(key: K): void {
    const node: LRUNode<K> = { key };

    if (!this.head) {
      this.head = node;
      this.tail = node;
    } else {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    }

    this.nodes.set(key, node);
  }

  private moveToHead(key: K): void {
    const node = this.nodes.get(key);
    if (!node || node === this.head) {return;}

    // 從當前位置移除
    if (node.prev) {node.prev.next = node.next;}
    if (node.next) {node.next.prev = node.prev;}
    if (node === this.tail) {this.tail = node.prev;}

    // 移動到頭部
    node.prev = undefined;
    node.next = this.head;
    if (this.head) {this.head.prev = node;}
    this.head = node;
  }

  private removeNode(key: K): void {
    const node = this.nodes.get(key);
    if (!node) {return;}

    if (node.prev) {node.prev.next = node.next;}
    if (node.next) {node.next.prev = node.prev;}

    if (node === this.head) {this.head = node.next;}
    if (node === this.tail) {this.tail = node.prev;}

    this.nodes.delete(key);
  }
}

/**
 * LFU (Least Frequently Used) 策略實作
 */
export class LFUStrategy<K, V> implements CacheStrategy<K, V> {
  readonly name = EvictionStrategy.LFU;

  private frequencies = new Map<K, number>();

  onAccess(key: K, item: CacheItem<V>): void {
    // 存取次數已在 CacheItem 中追蹤，這裡只需要更新內部狀態
    this.frequencies.set(key, item.accessCount);
  }

  onSet(key: K, _item: CacheItem<V>): void {
    this.frequencies.set(key, 0);
  }

  onDelete(key: K): void {
    this.frequencies.delete(key);
  }

  selectEvictionKey(items: Map<K, CacheItem<V>>): K | undefined {
    let minFrequency = Infinity;
    let keyToEvict: K | undefined;

    for (const [key, item] of items.entries()) {
      if (item.accessCount < minFrequency) {
        minFrequency = item.accessCount;
        keyToEvict = key;
      }
    }

    return keyToEvict;
  }

  clear(): void {
    this.frequencies.clear();
  }
}

/**
 * FIFO (First In First Out) 策略實作
 */
export class FIFOStrategy<K, V> implements CacheStrategy<K, V> {
  readonly name = EvictionStrategy.FIFO;

  onAccess(_key: K, _item: CacheItem<V>): void {
    // FIFO 不需要在存取時做任何事
  }

  onSet(_key: K, _item: CacheItem<V>): void {
    // FIFO 不需要在設定時做任何事，因為時間戳記在 CacheItem 中
  }

  onDelete(_key: K): void {
    // FIFO 不需要在刪除時做任何事
  }

  selectEvictionKey(items: Map<K, CacheItem<V>>): K | undefined {
    let earliestTime = Infinity;
    let keyToEvict: K | undefined;

    for (const [key, item] of items.entries()) {
      if (item.createdAt < earliestTime) {
        earliestTime = item.createdAt;
        keyToEvict = key;
      }
    }

    return keyToEvict;
  }

  clear(): void {
    // FIFO 不需要清理任何狀態
  }
}

/**
 * TTL (Time To Live) 策略實作
 */
export class TTLStrategy<K, V> implements CacheStrategy<K, V> {
  readonly name = EvictionStrategy.TTL;

  onAccess(_key: K, _item: CacheItem<V>): void {
    // TTL 不需要在存取時做任何事
  }

  onSet(_key: K, _item: CacheItem<V>): void {
    // TTL 不需要在設定時做任何事
  }

  onDelete(_key: K): void {
    // TTL 不需要在刪除時做任何事
  }

  selectEvictionKey(items: Map<K, CacheItem<V>>): K | undefined {
    const now = Date.now();
    let earliestExpiry = Infinity;
    let keyToEvict: K | undefined;

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

  clear(): void {
    // TTL 不需要清理任何狀態
  }
}

/**
 * Random 隨機策略實作
 */
export class RandomStrategy<K, V> implements CacheStrategy<K, V> {
  readonly name = EvictionStrategy.RANDOM;

  onAccess(_key: K, _item: CacheItem<V>): void {
    // Random 不需要在存取時做任何事
  }

  onSet(_key: K, _item: CacheItem<V>): void {
    // Random 不需要在設定時做任何事
  }

  onDelete(_key: K): void {
    // Random 不需要在刪除時做任何事
  }

  selectEvictionKey(items: Map<K, CacheItem<V>>): K | undefined {
    const keys = Array.from(items.keys());
    if (keys.length === 0) {return undefined;}

    const randomIndex = Math.floor(Math.random() * keys.length);
    return keys[randomIndex];
  }

  clear(): void {
    // Random 不需要清理任何狀態
  }
}

/**
 * 策略工廠
 */
export class StrategyFactory {
  static createStrategy<K, V>(strategy: EvictionStrategy): CacheStrategy<K, V> {
    switch (strategy) {
    case EvictionStrategy.LRU:
      return new LRUStrategy<K, V>();
    case EvictionStrategy.LFU:
      return new LFUStrategy<K, V>();
    case EvictionStrategy.FIFO:
      return new FIFOStrategy<K, V>();
    case EvictionStrategy.TTL:
      return new TTLStrategy<K, V>();
    case EvictionStrategy.RANDOM:
      return new RandomStrategy<K, V>();
    default:
      throw new Error(`Unsupported eviction strategy: ${strategy}`);
    }
  }
}

/**
 * LRU 節點定義（簡化版，只包含鍵）
 */
interface LRUNode<K> {
  key: K;
  prev?: LRUNode<K>;
  next?: LRUNode<K>;
}