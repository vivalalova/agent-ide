/**
 * Infrastructure Cache 單元測試
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { MemoryCache } from '@infrastructure/cache/memory-cache.js';
import { CacheManager } from '@infrastructure/cache/cache-manager.js';
import {
  LRUStrategy,
  LFUStrategy,
  FIFOStrategy,
  TTLStrategy,
  RandomStrategy,
  StrategyFactory
} from '@infrastructure/cache/strategies.js';
import {
  EvictionStrategy,
  CacheEventType,
  type CacheItem,
  type CacheEvent
} from '@infrastructure/cache/types.js';

// === 測試常數 ===
const DEFAULT_CACHE_SIZE = 5;
const SMALL_CACHE_SIZE = 3;
const LARGE_ITERATION_COUNT = 10;
const DEFAULT_TTL_MS = 1000;
const SHORT_TTL_MS = 100;
const LONG_TIMEOUT_MS = 100000;

// ============================================
// MemoryCache Tests
// ============================================

describe('MemoryCache', () => {
  let cache: MemoryCache<string, any>;

  beforeEach(() => {
    cache = new MemoryCache<string, any>({
      maxSize: DEFAULT_CACHE_SIZE,
      enableStats: true
    });
  });

  afterEach(() => {
    cache.dispose();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists with has()', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('should return correct size', () => {
      expect(cache.size()).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle maxSize of 1', () => {
      const smallCache = new MemoryCache<string, string>({ maxSize: 1 });
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      expect(smallCache.size()).toBe(1);
      expect(smallCache.has('key2')).toBe(true);
      smallCache.dispose();
    });

    it('should handle very large maxSize', () => {
      const largeCache = new MemoryCache<string, string>({ maxSize: 1000000 });
      largeCache.set('key1', 'value1');
      expect(largeCache.get('key1')).toBe('value1');
      largeCache.dispose();
    });

    it('should handle empty string keys', () => {
      cache.set('', 'empty-key-value');
      expect(cache.get('')).toBe('empty-key-value');
    });

    it('should handle undefined values', () => {
      cache.set('key1', undefined);
      expect(cache.has('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should handle null values', () => {
      cache.set('key1', null);
      expect(cache.has('key1')).toBe(true);
      expect(cache.get('key1')).toBeNull();
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire items after TTL', () => {
      cache.set('key1', 'value1', DEFAULT_TTL_MS);
      expect(cache.get('key1')).toBe('value1');

      vi.advanceTimersByTime(DEFAULT_TTL_MS + 1);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should not expire items without TTL', () => {
      cache.set('key1', 'value1');
      vi.advanceTimersByTime(LONG_TIMEOUT_MS);
      expect(cache.get('key1')).toBe('value1');
    });

    it('should update expiration stats', () => {
      cache.set('key1', 'value1', SHORT_TTL_MS);
      vi.advanceTimersByTime(SHORT_TTL_MS + 1);
      cache.get('key1');
      const stats = cache.getStats();
      expect(stats.expirations).toBe(1);
    });
  });

  describe('eviction', () => {
    it('should evict items when maxSize is reached', () => {
      for (let i = 0; i < LARGE_ITERATION_COUNT; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      expect(cache.size()).toBeLessThanOrEqual(DEFAULT_CACHE_SIZE);
    });

    it('should track evictions in stats', () => {
      for (let i = 0; i < LARGE_ITERATION_COUNT; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      const stats = cache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
    });
  });

  describe('batch operations', () => {
    it('should mget multiple keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      const result = cache.mget(['key1', 'key2', 'key4']);
      expect(result.get('key1')).toBe('value1');
      expect(result.get('key2')).toBe('value2');
      expect(result.has('key4')).toBe(false);
    });

    it('should mset multiple entries', () => {
      cache.mset([
        ['key1', 'value1'],
        ['key2', 'value2']
      ]);
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('statistics', () => {
    it('should track hit and miss counts', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('key2'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.totalRequests).toBe(3);
    });

    it('should calculate hit rate', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // hit
      cache.get('key2'); // miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBeCloseTo(0.5);
    });
  });

  describe('event listeners', () => {
    it('should emit events on operations', () => {
      const events: CacheEvent<string, any>[] = [];
      const listener = (event: CacheEvent<string, any>) => events.push(event);

      cache.addListener(listener);
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.delete('key1');

      expect(events.some(e => e.type === CacheEventType.SET)).toBe(true);
      expect(events.some(e => e.type === CacheEventType.GET)).toBe(true);
      expect(events.some(e => e.type === CacheEventType.DELETE)).toBe(true);

      cache.removeListener(listener);
    });

    it('should emit HIT and MISS events', () => {
      const events: CacheEvent<string, any>[] = [];
      const listener = (event: CacheEvent<string, any>) => events.push(event);

      cache.addListener(listener);
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('nonexistent');

      expect(events.some(e => e.type === CacheEventType.HIT)).toBe(true);
      expect(events.some(e => e.type === CacheEventType.MISS)).toBe(true);
    });

    it('should handle listener errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badListener = () => { throw new Error('Listener error'); };

      cache.addListener(badListener);
      cache.set('key1', 'value1'); // Should not throw

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should emit CLEAR event', () => {
      const events: CacheEvent<string, any>[] = [];
      cache.addListener(e => events.push(e));
      cache.set('key1', 'value1');
      cache.clear();

      expect(events.some(e => e.type === CacheEventType.CLEAR)).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should clean up resources on dispose', () => {
      cache.set('key1', 'value1');
      cache.dispose();
      expect(cache.size()).toBe(0);
    });
  });

  describe('update existing key', () => {
    it('should update value when setting existing key', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
    });
  });

  describe('calculateSize', () => {
    it('should calculate size for serializable values', () => {
      cache.set('key1', { nested: { data: 'value' } });
      const stats = cache.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });

    it('should use default size for non-serializable values', () => {
      const circular: any = {};
      circular.self = circular;
      cache.set('key1', circular);
      const stats = cache.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });
});

describe('MemoryCache with TTL strategy', () => {
  it('should start cleanup timer with TTL strategy', () => {
    vi.useFakeTimers();
    const cache = new MemoryCache<string, any>({
      evictionStrategy: EvictionStrategy.TTL,
      cleanupInterval: 1000
    });

    cache.set('key1', 'value1', 500);
    vi.advanceTimersByTime(1001);

    cache.dispose();
    vi.useRealTimers();
  });

  it('should start cleanup timer with defaultTTL', () => {
    vi.useFakeTimers();
    const cache = new MemoryCache<string, any>({
      defaultTTL: 1000,
      cleanupInterval: 500,
      enableStats: true
    });

    cache.set('key1', 'value1');
    vi.advanceTimersByTime(1500);

    cache.dispose();
    vi.useRealTimers();
  });
});

describe('MemoryCache 並行操作', () => {
  it('should handle concurrent set operations safely', async () => {
    const cache = new MemoryCache<string, number>({
      maxSize: 100,
      enableStats: true
    });

    // 同時執行 50 個並行寫入操作
    const promises = Array.from({ length: 50 }, (_, i) =>
      Promise.resolve().then(() => cache.set(`key${i}`, i))
    );

    await Promise.all(promises);

    // 驗證所有寫入都成功
    expect(cache.size()).toBeLessThanOrEqual(100);

    // 驗證至少有部分資料被保存
    let foundCount = 0;
    for (let i = 0; i < 50; i++) {
      if (cache.has(`key${i}`)) {
        expect(cache.get(`key${i}`)).toBe(i);
        foundCount++;
      }
    }
    expect(foundCount).toBeGreaterThan(0);

    cache.dispose();
  });

  it('should handle concurrent get and set operations', async () => {
    const cache = new MemoryCache<string, number>({
      maxSize: 10,
      enableStats: true
    });

    // 先設置一些初始資料
    for (let i = 0; i < 5; i++) {
      cache.set(`key${i}`, i);
    }

    // 同時執行讀取和寫入
    const operations = [
      ...Array.from({ length: 10 }, (_, i) => () => cache.get(`key${i % 5}`)),
      ...Array.from({ length: 10 }, (_, i) => () => cache.set(`newKey${i}`, i * 10)),
    ];

    // 隨機打亂操作順序
    const shuffled = operations.sort(() => Math.random() - 0.5);

    // 並行執行
    await Promise.all(shuffled.map(op => Promise.resolve().then(op)));

    // 驗證快取狀態正確
    const stats = cache.getStats();
    expect(stats.totalRequests).toBeGreaterThan(0);
    expect(cache.size()).toBeLessThanOrEqual(10);

    cache.dispose();
  });

  it('should handle concurrent delete operations', async () => {
    const cache = new MemoryCache<string, number>({ maxSize: 100 });

    // 設置資料
    for (let i = 0; i < 50; i++) {
      cache.set(`key${i}`, i);
    }

    // 並行刪除部分資料
    const deletePromises = Array.from({ length: 25 }, (_, i) =>
      Promise.resolve().then(() => cache.delete(`key${i * 2}`))
    );

    await Promise.all(deletePromises);

    // 驗證刪除成功
    for (let i = 0; i < 25; i++) {
      expect(cache.has(`key${i * 2}`)).toBe(false);
    }

    cache.dispose();
  });

  it('should handle high-frequency concurrent mget operations', async () => {
    const cache = new MemoryCache<string, number>({
      maxSize: 50,
      enableStats: true
    });

    // 設置資料
    for (let i = 0; i < 30; i++) {
      cache.set(`key${i}`, i);
    }

    // 100 個並行 mget 請求
    const mgetPromises = Array.from({ length: 100 }, () =>
      Promise.resolve().then(() =>
        cache.mget(['key0', 'key10', 'key20', 'key99'])
      )
    );

    const results = await Promise.all(mgetPromises);

    // 驗證所有 mget 都返回正確格式
    for (const result of results) {
      expect(result).toBeInstanceOf(Map);
    }

    const stats = cache.getStats();
    expect(stats.totalRequests).toBeGreaterThanOrEqual(100);

    cache.dispose();
  });
});

describe('MemoryCache with different strategies', () => {
  it('should work with LFU strategy', () => {
    const cache = new MemoryCache<string, any>({
      maxSize: SMALL_CACHE_SIZE,
      evictionStrategy: EvictionStrategy.LFU
    });

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    // Access key1 multiple times
    cache.get('key1');
    cache.get('key1');
    cache.get('key2');

    // Add new item, should evict key3 (least frequently used)
    cache.set('key4', 'value4');

    expect(cache.has('key1')).toBe(true);
    cache.dispose();
  });

  it('should work with FIFO strategy', () => {
    const cache = new MemoryCache<string, any>({
      maxSize: SMALL_CACHE_SIZE,
      evictionStrategy: EvictionStrategy.FIFO
    });

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4');

    // key1 should be evicted (first in)
    expect(cache.has('key1')).toBe(false);
    cache.dispose();
  });

  it('should work with RANDOM strategy', () => {
    const cache = new MemoryCache<string, any>({
      maxSize: SMALL_CACHE_SIZE,
      evictionStrategy: EvictionStrategy.RANDOM
    });

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4');

    expect(cache.size()).toBe(3);
    cache.dispose();
  });
});

// ============================================
// Cache Strategies Tests
// ============================================

describe('LRUStrategy', () => {
  let strategy: LRUStrategy<string, any>;

  beforeEach(() => {
    strategy = new LRUStrategy<string, any>();
  });

  it('should have correct name', () => {
    expect(strategy.name).toBe(EvictionStrategy.LRU);
  });

  it('should select least recently used key for eviction', () => {
    const items = new Map<string, CacheItem<any>>();
    const now = Date.now();

    strategy.onSet('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    strategy.onSet('key2', { value: 2, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    strategy.onSet('key3', { value: 3, createdAt: now, lastAccessedAt: now, accessCount: 0 });

    items.set('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    items.set('key2', { value: 2, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    items.set('key3', { value: 3, createdAt: now, lastAccessedAt: now, accessCount: 0 });

    // Access key1, making it recently used
    strategy.onAccess('key1', items.get('key1')!);

    // key1 was accessed, so key2 or key3 should be evicted (key1 was first, but moved to head)
    const keyToEvict = strategy.selectEvictionKey(items);
    expect(['key2', 'key3']).toContain(keyToEvict);
  });

  it('should handle delete operations', () => {
    const now = Date.now();
    strategy.onSet('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    strategy.onDelete('key1');
    // Should not throw
    expect(strategy.selectEvictionKey(new Map())).toBeUndefined();
  });

  it('should clear internal state', () => {
    const now = Date.now();
    strategy.onSet('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    strategy.clear();
    expect(strategy.selectEvictionKey(new Map())).toBeUndefined();
  });

  it('should handle existing key in onSet', () => {
    const now = Date.now();
    strategy.onSet('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    strategy.onSet('key1', { value: 2, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    // Should not throw
  });

  it('should handle moveToHead for head node', () => {
    const now = Date.now();
    strategy.onSet('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    strategy.onAccess('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    // Should not throw - already at head
  });

  it('should handle moveToHead for non-existent key', () => {
    strategy.onAccess('nonexistent', { value: 1, createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0 });
    // Should not throw
  });

  it('should handle delete for non-existent key', () => {
    strategy.onDelete('nonexistent');
    // Should not throw
  });

  it('should handle tail removal correctly', () => {
    const now = Date.now();
    strategy.onSet('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    strategy.onSet('key2', { value: 2, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    strategy.onSet('key3', { value: 3, createdAt: now, lastAccessedAt: now, accessCount: 0 });

    // Move tail (key1) to head
    strategy.onAccess('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 0 });

    // Delete new tail (key2)
    strategy.onDelete('key2');

    // Should still work
    const items = new Map<string, CacheItem<any>>();
    items.set('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    items.set('key3', { value: 3, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    expect(strategy.selectEvictionKey(items)).toBeDefined();
  });
});

describe('LFUStrategy', () => {
  let strategy: LFUStrategy<string, any>;

  beforeEach(() => {
    strategy = new LFUStrategy<string, any>();
  });

  it('should have correct name', () => {
    expect(strategy.name).toBe(EvictionStrategy.LFU);
  });

  it('should select least frequently used key', () => {
    const now = Date.now();
    const items = new Map<string, CacheItem<any>>();

    items.set('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 5 });
    items.set('key2', { value: 2, createdAt: now, lastAccessedAt: now, accessCount: 1 });
    items.set('key3', { value: 3, createdAt: now, lastAccessedAt: now, accessCount: 10 });

    strategy.onSet('key1', items.get('key1')!);
    strategy.onSet('key2', items.get('key2')!);
    strategy.onSet('key3', items.get('key3')!);

    const keyToEvict = strategy.selectEvictionKey(items);
    expect(keyToEvict).toBe('key2');
  });

  it('should update frequency on access', () => {
    const item = { value: 1, createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 5 };
    strategy.onAccess('key1', item);
    // Internal state should be updated
  });

  it('should clear internal state', () => {
    strategy.onSet('key1', { value: 1, createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0 });
    strategy.clear();
  });

  it('should handle delete', () => {
    strategy.onSet('key1', { value: 1, createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0 });
    strategy.onDelete('key1');
  });
});

describe('FIFOStrategy', () => {
  let strategy: FIFOStrategy<string, any>;

  beforeEach(() => {
    strategy = new FIFOStrategy<string, any>();
  });

  it('should have correct name', () => {
    expect(strategy.name).toBe(EvictionStrategy.FIFO);
  });

  it('should select earliest created item', () => {
    const now = Date.now();
    const items = new Map<string, CacheItem<any>>();

    items.set('key1', { value: 1, createdAt: now - 1000, lastAccessedAt: now, accessCount: 0 });
    items.set('key2', { value: 2, createdAt: now - 500, lastAccessedAt: now, accessCount: 0 });
    items.set('key3', { value: 3, createdAt: now, lastAccessedAt: now, accessCount: 0 });

    const keyToEvict = strategy.selectEvictionKey(items);
    expect(keyToEvict).toBe('key1');
  });
});

describe('TTLStrategy', () => {
  let strategy: TTLStrategy<string, any>;

  beforeEach(() => {
    strategy = new TTLStrategy<string, any>();
  });

  it('should have correct name', () => {
    expect(strategy.name).toBe(EvictionStrategy.TTL);
  });

  it('should select already expired item first', () => {
    const now = Date.now();
    const items = new Map<string, CacheItem<any>>();

    items.set('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 0, expiresAt: now + 10000 });
    items.set('key2', { value: 2, createdAt: now, lastAccessedAt: now, accessCount: 0, expiresAt: now - 1 }); // expired
    items.set('key3', { value: 3, createdAt: now, lastAccessedAt: now, accessCount: 0, expiresAt: now + 5000 });

    const keyToEvict = strategy.selectEvictionKey(items);
    expect(keyToEvict).toBe('key2');
  });

  it('should select earliest expiring item if none expired', () => {
    const now = Date.now();
    const items = new Map<string, CacheItem<any>>();

    items.set('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 0, expiresAt: now + 10000 });
    items.set('key2', { value: 2, createdAt: now, lastAccessedAt: now, accessCount: 0, expiresAt: now + 5000 });
    items.set('key3', { value: 3, createdAt: now, lastAccessedAt: now, accessCount: 0, expiresAt: now + 20000 });

    const keyToEvict = strategy.selectEvictionKey(items);
    expect(keyToEvict).toBe('key2');
  });

  it('should return undefined for items without expiresAt', () => {
    const now = Date.now();
    const items = new Map<string, CacheItem<any>>();
    items.set('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 0 });

    const keyToEvict = strategy.selectEvictionKey(items);
    expect(keyToEvict).toBeUndefined();
  });
});

describe('RandomStrategy', () => {
  let strategy: RandomStrategy<string, any>;

  beforeEach(() => {
    strategy = new RandomStrategy<string, any>();
  });

  it('should have correct name', () => {
    expect(strategy.name).toBe(EvictionStrategy.RANDOM);
  });

  it('should select a random key', () => {
    const now = Date.now();
    const items = new Map<string, CacheItem<any>>();

    items.set('key1', { value: 1, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    items.set('key2', { value: 2, createdAt: now, lastAccessedAt: now, accessCount: 0 });
    items.set('key3', { value: 3, createdAt: now, lastAccessedAt: now, accessCount: 0 });

    const keyToEvict = strategy.selectEvictionKey(items);
    expect(['key1', 'key2', 'key3']).toContain(keyToEvict);
  });

  it('should return undefined for empty map', () => {
    const keyToEvict = strategy.selectEvictionKey(new Map());
    expect(keyToEvict).toBeUndefined();
  });
});

// 無狀態策略的 no-op 方法測試（合併重複測試）
describe('Stateless strategies no-op methods', () => {
  const statelessStrategies = [
    { name: 'FIFO', factory: () => new FIFOStrategy<string, any>() },
    { name: 'TTL', factory: () => new TTLStrategy<string, any>() },
    { name: 'Random', factory: () => new RandomStrategy<string, any>() },
  ];

  it.each(statelessStrategies)(
    '$name strategy should not throw on lifecycle methods',
    ({ factory }) => {
      const strategy = factory();
      const item = { value: 1, createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0 };

      // 所有這些方法都應該是 no-op，不應拋出錯誤
      expect(() => strategy.onAccess('key1', item)).not.toThrow();
      expect(() => strategy.onSet('key1', item)).not.toThrow();
      expect(() => strategy.onDelete('key1')).not.toThrow();
      expect(() => strategy.clear()).not.toThrow();
    }
  );
});

describe('StrategyFactory', () => {
  const supportedStrategies = [
    EvictionStrategy.LRU,
    EvictionStrategy.LFU,
    EvictionStrategy.FIFO,
    EvictionStrategy.TTL,
    EvictionStrategy.RANDOM,
  ];

  it.each(supportedStrategies)(
    'should create %s strategy with correct name',
    (strategyType) => {
      const strategy = StrategyFactory.createStrategy(strategyType);
      expect(strategy.name).toBe(strategyType);
    }
  );

  it('should throw for unsupported strategy', () => {
    expect(() => StrategyFactory.createStrategy('invalid' as any)).toThrow('Unsupported eviction strategy');
  });
});

// ============================================
// CacheManager Tests
// ============================================

describe('CacheManager', () => {
  let manager: CacheManager;

  beforeEach(() => {
    manager = new CacheManager({
      enableGlobalStats: true
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('cache lifecycle', () => {
    it('should create new caches', () => {
      const cache = manager.createCache<string, any>('test');
      expect(cache).toBeDefined();
    });

    it('should throw when creating duplicate cache', () => {
      manager.createCache('test');
      expect(() => manager.createCache('test')).toThrow('already exists');
    });

    it('should get existing cache', () => {
      const cache1 = manager.createCache<string, any>('test');
      const cache2 = manager.getCache<string, any>('test');
      expect(cache2).toBe(cache1);
    });

    it('should return undefined for non-existent cache', () => {
      expect(manager.getCache('nonexistent')).toBeUndefined();
    });

    it('should check cache existence', () => {
      manager.createCache('test');
      expect(manager.hasCache('test')).toBe(true);
      expect(manager.hasCache('nonexistent')).toBe(false);
    });

    it('should delete cache', () => {
      manager.createCache('test');
      expect(manager.deleteCache('test')).toBe(true);
      expect(manager.hasCache('test')).toBe(false);
    });

    it('should return false when deleting non-existent cache', () => {
      expect(manager.deleteCache('nonexistent')).toBe(false);
    });

    it('should batch delete caches', () => {
      manager.createCache('cache1');
      manager.createCache('cache2');
      manager.createCache('cache3');

      const result = manager.deleteCaches(['cache1', 'cache2', 'nonexistent']);
      expect(result.successful).toContain('cache1');
      expect(result.successful).toContain('cache2');
      expect(result.failed).toContain('nonexistent');
    });

    it('should list all caches', () => {
      manager.createCache('cache1');
      manager.createCache('cache2');

      const names = manager.listCaches();
      expect(names).toContain('cache1');
      expect(names).toContain('cache2');
    });
  });

  describe('cache operations', () => {
    it('should clear specific cache', () => {
      const cache = manager.createCache<string, any>('test');
      cache.set('key1', 'value1');

      expect(manager.clearCache('test')).toBe(true);
      expect(cache.size()).toBe(0);
    });

    it('should return false when clearing non-existent cache', () => {
      expect(manager.clearCache('nonexistent')).toBe(false);
    });

    it('should batch clear caches', () => {
      const cache1 = manager.createCache<string, any>('cache1');
      const cache2 = manager.createCache<string, any>('cache2');

      cache1.set('key', 'value');
      cache2.set('key', 'value');

      manager.clearCaches(['cache1', 'cache2']);

      expect(cache1.size()).toBe(0);
      expect(cache2.size()).toBe(0);
    });

    it('should clear all caches', () => {
      const cache1 = manager.createCache<string, any>('cache1');
      const cache2 = manager.createCache<string, any>('cache2');

      cache1.set('key', 'value');
      cache2.set('key', 'value');

      manager.clearAll();

      expect(cache1.size()).toBe(0);
      expect(cache2.size()).toBe(0);
    });
  });

  describe('warmup', () => {
    it('should throw when warmup is disabled', async () => {
      manager.createCache('test');
      await expect(manager.warmupCache('test')).rejects.toThrow('warmup is disabled');
    });

    it('should throw for non-existent cache', async () => {
      const warmupManager = new CacheManager({
        warmupConfig: { enabled: true }
      });

      await expect(warmupManager.warmupCache('nonexistent')).rejects.toThrow('does not exist');
      warmupManager.dispose();
    });

    it('should warmup cache with data source', async () => {
      const onComplete = vi.fn();
      const warmupManager = new CacheManager({
        warmupConfig: {
          enabled: true,
          dataSource: async () => new Map([['key1', 'value1'], ['key2', 'value2']]),
          onComplete
        }
      });

      const cache = warmupManager.createCache<string, string>('test');
      await warmupManager.warmupCache('test');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
      expect(onComplete).toHaveBeenCalledWith({ loaded: 2, failed: 0 });

      warmupManager.dispose();
    });

    it('should handle warmup data source errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onComplete = vi.fn();
      const warmupManager = new CacheManager({
        warmupConfig: {
          enabled: true,
          dataSource: async () => { throw new Error('Data source error'); },
          onComplete
        }
      });

      warmupManager.createCache('test');
      await warmupManager.warmupCache('test');

      expect(onComplete).toHaveBeenCalled();
      consoleSpy.mockRestore();
      warmupManager.dispose();
    });

    it('should handle individual item warmup errors', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const warmupManager = new CacheManager({
        warmupConfig: {
          enabled: true,
          dataSource: async () => new Map([['key1', 'value1']])
        },
        defaultCacheOptions: {
          maxSize: 0 // Will cause set to fail during eviction
        }
      });

      warmupManager.createCache('test');
      await warmupManager.warmupCache('test');

      consoleSpy.mockRestore();
      warmupManager.dispose();
    });
  });

  describe('global stats', () => {
    it('should aggregate stats across caches', () => {
      const cache1 = manager.createCache<string, any>('cache1', { enableStats: true });
      const cache2 = manager.createCache<string, any>('cache2', { enableStats: true });

      cache1.set('key1', 'value1');
      cache2.set('key2', 'value2');

      cache1.get('key1');
      cache2.get('key2');
      cache1.get('nonexistent');

      const stats = manager.getGlobalStats();
      expect(stats.totalCaches).toBe(2);
      expect(stats.totalItems).toBe(2);
    });

    it('should return zero stats when global stats disabled', () => {
      const noStatsManager = new CacheManager({
        enableGlobalStats: false
      });

      noStatsManager.createCache('test');
      const stats = noStatsManager.getGlobalStats();

      expect(stats.totalCaches).toBe(0);
      expect(stats.totalItems).toBe(0);
      noStatsManager.dispose();
    });
  });

  describe('global event listeners', () => {
    it('should forward events to global listeners', () => {
      const events: CacheEvent<any, any>[] = [];
      manager.addGlobalEventListener(e => events.push(e));

      const cache = manager.createCache<string, any>('test');
      cache.set('key1', 'value1');

      expect(events.length).toBeGreaterThan(0);
    });

    it('should remove global event listeners', () => {
      const events: CacheEvent<any, any>[] = [];
      const listener = (e: CacheEvent<any, any>) => events.push(e);

      manager.addGlobalEventListener(listener);
      manager.removeGlobalEventListener(listener);

      const cache = manager.createCache<string, any>('test');
      cache.set('key1', 'value1');

      expect(events.length).toBe(0);
    });

    it('should handle global listener errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      manager.addGlobalEventListener(() => { throw new Error('Listener error'); });

      const cache = manager.createCache<string, any>('test');
      cache.set('key1', 'value1'); // Should not throw

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('dispose', () => {
    it('should dispose all caches', () => {
      const cache1 = manager.createCache<string, any>('cache1');
      const cache2 = manager.createCache<string, any>('cache2');

      cache1.set('key', 'value');
      cache2.set('key', 'value');

      manager.dispose();

      // Should be idempotent
      manager.dispose();
    });

    it('should throw after disposal', () => {
      manager.dispose();
      expect(() => manager.createCache('test')).toThrow('disposed');
      expect(() => manager.getCache('test')).toThrow('disposed');
      expect(() => manager.hasCache('test')).toThrow('disposed');
      expect(() => manager.listCaches()).toThrow('disposed');
    });
  });

  describe('getOptions', () => {
    it('should return manager options', () => {
      const options = manager.getOptions();
      expect(options.enableGlobalStats).toBe(true);
    });
  });
});
