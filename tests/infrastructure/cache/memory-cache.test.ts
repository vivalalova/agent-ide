import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MemoryCache } from '../../../src/infrastructure/cache/memory-cache';
import { EvictionStrategy, type CacheOptions } from '../../../src/infrastructure/cache/types';

describe('MemoryCache', () => {
  let cache: MemoryCache<string, any>;

  beforeEach(() => {
    cache = new MemoryCache<string, any>();
  });

  afterEach(() => {
    cache.clear();
  });

  describe('基本操作', () => {
    it('應該能夠設定和取得快取值', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('應該在鍵不存在時返回 undefined', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('應該能夠檢查鍵是否存在', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('應該能夠刪除快取項目', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('應該能夠清空所有快取', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
    });

    it('應該正確返回快取大小', () => {
      expect(cache.size()).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
      cache.delete('key1');
      expect(cache.size()).toBe(1);
    });
  });

  describe('配置選項', () => {
    it('應該接受配置選項', () => {
      const options: CacheOptions = {
        maxSize: 100,
        defaultTTL: 5000,
        evictionStrategy: EvictionStrategy.LRU,
        enableStats: true
      };

      const configuredCache = new MemoryCache<string, string>(options);
      expect(configuredCache).toBeInstanceOf(MemoryCache);
    });

    it('應該使用預設 TTL', async () => {
      vi.useFakeTimers();

      const options: CacheOptions = {
        defaultTTL: 100
      };

      const ttlCache = new MemoryCache<string, string>(options);
      ttlCache.set('key1', 'value1');

      // 立即應該還能取得
      expect(ttlCache.get('key1')).toBe('value1');

      // 前進時間到過期後
      vi.advanceTimersByTime(150);

      // 應該已經過期
      expect(ttlCache.get('key1')).toBeUndefined();

      vi.useRealTimers();
    });

    it('應該支援自訂 TTL 覆蓋預設值', async () => {
      vi.useFakeTimers();

      const options: CacheOptions = {
        defaultTTL: 1000
      };

      const ttlCache = new MemoryCache<string, string>(options);
      ttlCache.set('key1', 'value1', 100);

      // 立即應該還能取得
      expect(ttlCache.get('key1')).toBe('value1');

      // 前進時間到自訂 TTL 過期後
      vi.advanceTimersByTime(150);

      // 應該已經過期
      expect(ttlCache.get('key1')).toBeUndefined();

      vi.useRealTimers();
    });
  });

  describe('批次操作', () => {
    it('應該支援批次取得', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      const result = cache.mget(['key1', 'key2', 'nonexistent']);
      expect(result.get('key1')).toBe('value1');
      expect(result.get('key2')).toBe('value2');
      expect(result.has('nonexistent')).toBe(false);
    });

    it('應該支援批次設定', () => {
      const entries: Array<[string, string]> = [
        ['key1', 'value1'],
        ['key2', 'value2'],
        ['key3', 'value3']
      ];

      cache.mset(entries);
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.size()).toBe(3);
    });
  });

  describe('統計功能', () => {
    it('應該在啟用統計時追蹤基本統計資訊', () => {
      const statsCache = new MemoryCache<string, string>({ enableStats: true });

      // 測試設定操作
      statsCache.set('key1', 'value1');
      const stats1 = statsCache.getStats();
      expect(stats1.size).toBe(1);

      // 測試命中
      statsCache.get('key1');
      const stats2 = statsCache.getStats();
      expect(stats2.hits).toBeGreaterThan(stats1.hits);
      expect(stats2.totalRequests).toBeGreaterThan(stats1.totalRequests);

      // 測試未命中
      statsCache.get('nonexistent');
      const stats3 = statsCache.getStats();
      expect(stats3.misses).toBeGreaterThan(stats2.misses);
      expect(stats3.totalRequests).toBeGreaterThan(stats2.totalRequests);
    });

    it('應該計算正確的命中率', () => {
      const statsCache = new MemoryCache<string, string>({ enableStats: true });

      statsCache.set('key1', 'value1');

      // 2 次命中
      statsCache.get('key1');
      statsCache.get('key1');

      // 1 次未命中
      statsCache.get('nonexistent');

      const stats = statsCache.getStats();
      expect(stats.hitRate).toBeCloseTo(2/3, 2);
    });
  });

  describe('錯誤處理', () => {
    it('應該處理 null 和 undefined 值', () => {
      cache.set('null', null);
      cache.set('undefined', undefined);

      expect(cache.get('null')).toBeNull();
      expect(cache.get('undefined')).toBeUndefined();
      expect(cache.has('null')).toBe(true);
      expect(cache.has('undefined')).toBe(true);
    });

    it('應該處理複雜物件', () => {
      const obj = { a: 1, b: { c: 2 }, d: [1, 2, 3] };
      cache.set('object', obj);

      const retrieved = cache.get('object');
      expect(retrieved).toEqual(obj);
    });
  });

  describe('記憶體管理', () => {
    it('應該在達到最大大小時淘汰項目', () => {
      const limitedCache = new MemoryCache<string, string>({
        maxSize: 2,
        evictionStrategy: EvictionStrategy.LRU
      });

      limitedCache.set('key1', 'value1');
      limitedCache.set('key2', 'value2');
      limitedCache.set('key3', 'value3'); // 應該淘汰 key1

      expect(limitedCache.has('key1')).toBe(false);
      expect(limitedCache.has('key2')).toBe(true);
      expect(limitedCache.has('key3')).toBe(true);
      expect(limitedCache.size()).toBe(2);
    });
  });

  describe('LRU 策略詳細測試', () => {
    let lruCache: MemoryCache<string, string>;

    beforeEach(() => {
      lruCache = new MemoryCache<string, string>({
        maxSize: 3,
        evictionStrategy: EvictionStrategy.LRU,
        enableStats: true
      });
    });

    it('應該按 LRU 順序淘汰最少使用的項目', () => {
      // 添加 3 個項目
      lruCache.set('a', 'value-a');
      lruCache.set('b', 'value-b');
      lruCache.set('c', 'value-c');

      // 存取 a 和 b，讓 c 成為最少使用的
      lruCache.get('a');
      lruCache.get('b');

      // 添加新項目應該淘汰 c
      lruCache.set('d', 'value-d');

      expect(lruCache.has('a')).toBe(true);
      expect(lruCache.has('b')).toBe(true);
      expect(lruCache.has('c')).toBe(false); // 被淘汰
      expect(lruCache.has('d')).toBe(true);
    });

    it('應該正確更新 LRU 順序', () => {
      lruCache.set('x', 'value-x');
      lruCache.set('y', 'value-y');
      lruCache.set('z', 'value-z');

      // x 是最舊的，應該被淘汰
      lruCache.set('w', 'value-w');
      expect(lruCache.has('x')).toBe(false);

      // 存取 y，讓它變成最新的
      lruCache.get('y');

      // z 現在是最舊的，應該被淘汰
      lruCache.set('v', 'value-v');
      expect(lruCache.has('y')).toBe(true);
      expect(lruCache.has('z')).toBe(false);
      expect(lruCache.has('w')).toBe(true);
      expect(lruCache.has('v')).toBe(true);
    });

    it('應該在設定現有鍵時更新 LRU 順序', () => {
      lruCache.set('p', 'value-p');
      lruCache.set('q', 'value-q');
      lruCache.set('r', 'value-r');

      // 更新 p 的值，應該讓 p 變成最新的
      lruCache.set('p', 'new-value-p');

      // q 現在是最舊的，應該被淘汰
      lruCache.set('s', 'value-s');

      expect(lruCache.has('p')).toBe(true);
      expect(lruCache.get('p')).toBe('new-value-p');
      expect(lruCache.has('q')).toBe(false); // 被淘汰
      expect(lruCache.has('r')).toBe(true);
      expect(lruCache.has('s')).toBe(true);
    });
  });
});