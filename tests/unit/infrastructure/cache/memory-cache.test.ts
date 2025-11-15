import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryCache } from '@infrastructure/cache/memory-cache';
import { EvictionStrategy, CacheEventType } from '@infrastructure/cache/types';

describe('MemoryCache', () => {
  let cache: MemoryCache<string, any>;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (cache) {
      cache.dispose();
    }
    vi.useRealTimers();
  });

  describe('基本功能', () => {
    it('應該能夠設定和取得值', () => {
      cache = new MemoryCache<string, string>();
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('應該在取得不存在的鍵時回傳 undefined', () => {
      cache = new MemoryCache<string, string>();
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('應該能夠檢查鍵是否存在', () => {
      cache = new MemoryCache<string, string>();
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('應該能夠刪除項目', () => {
      cache = new MemoryCache<string, string>();
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.delete('key1')).toBe(false);
    });

    it('應該能夠清空所有項目', () => {
      cache = new MemoryCache<string, string>();
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.has('key1')).toBe(false);
    });

    it('應該回傳正確的快取大小', () => {
      cache = new MemoryCache<string, string>();
      expect(cache.size()).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
    });
  });

  describe('批次操作', () => {
    it('應該能夠批次取得多個值', () => {
      cache = new MemoryCache<string, string>();
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      const result = cache.mget(['key1', 'key2', 'nonexistent']);
      expect(result.size).toBe(2);
      expect(result.get('key1')).toBe('value1');
      expect(result.get('key2')).toBe('value2');
      expect(result.has('nonexistent')).toBe(false);
    });

    it('應該能夠批次設定多個值', () => {
      cache = new MemoryCache<string, string>();
      cache.mset([
        ['key1', 'value1'],
        ['key2', 'value2'],
        ['key3', 'value3']
      ]);

      expect(cache.size()).toBe(3);
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });
  });

  describe('TTL (過期時間)', () => {
    it('應該在指定時間後過期', () => {
      cache = new MemoryCache<string, string>({ defaultTTL: 1000 });
      cache.set('key1', 'value1');

      expect(cache.get('key1')).toBe('value1');

      vi.advanceTimersByTime(1001);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.has('key1')).toBe(false);
    });

    it('應該支援自訂 TTL', () => {
      cache = new MemoryCache<string, string>();
      cache.set('key1', 'value1', 500);
      cache.set('key2', 'value2', 1000);

      vi.advanceTimersByTime(501);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');

      vi.advanceTimersByTime(500);
      expect(cache.get('key2')).toBeUndefined();
    });

    it('應該自動清理過期項目', () => {
      cache = new MemoryCache<string, string>({
        defaultTTL: 1000,
        cleanupInterval: 500
      });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      vi.advanceTimersByTime(1001);
      vi.advanceTimersByTime(500); // 觸發清理

      expect(cache.size()).toBe(0);
    });
  });

  describe('淘汰策略', () => {
    describe('LRU (Least Recently Used)', () => {
      it('應該淘汰最久未使用的項目', () => {
        cache = new MemoryCache<string, string>({
          maxSize: 3,
          evictionStrategy: EvictionStrategy.LRU
        });

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');

        cache.get('key1'); // key1 被訪問，移到最前面

        cache.set('key4', 'value4'); // 應該淘汰 key2

        expect(cache.has('key1')).toBe(true);
        expect(cache.has('key2')).toBe(false);
        expect(cache.has('key3')).toBe(true);
        expect(cache.has('key4')).toBe(true);
      });
    });

    describe('LFU (Least Frequently Used)', () => {
      it('應該淘汰最少使用的項目', () => {
        cache = new MemoryCache<string, string>({
          maxSize: 3,
          evictionStrategy: EvictionStrategy.LFU
        });

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');

        cache.get('key1'); // key1 accessCount = 1
        cache.get('key1'); // key1 accessCount = 2
        cache.get('key2'); // key2 accessCount = 1

        cache.set('key4', 'value4'); // 應該淘汰 key3 (accessCount = 0)

        expect(cache.has('key1')).toBe(true);
        expect(cache.has('key2')).toBe(true);
        expect(cache.has('key3')).toBe(false);
        expect(cache.has('key4')).toBe(true);
      });
    });

    describe('FIFO (First In First Out)', () => {
      it('應該淘汰最早加入的項目', () => {
        cache = new MemoryCache<string, string>({
          maxSize: 3,
          evictionStrategy: EvictionStrategy.FIFO
        });

        cache.set('key1', 'value1');
        vi.advanceTimersByTime(10);
        cache.set('key2', 'value2');
        vi.advanceTimersByTime(10);
        cache.set('key3', 'value3');
        vi.advanceTimersByTime(10);

        cache.get('key1'); // 訪問不應該影響 FIFO 順序

        cache.set('key4', 'value4'); // 應該淘汰 key1 (最早加入)

        expect(cache.has('key1')).toBe(false);
        expect(cache.has('key2')).toBe(true);
        expect(cache.has('key3')).toBe(true);
        expect(cache.has('key4')).toBe(true);
      });
    });

    describe('TTL 策略', () => {
      it('應該優先淘汰最接近過期的項目', () => {
        cache = new MemoryCache<string, string>({
          maxSize: 3,
          evictionStrategy: EvictionStrategy.TTL
        });

        cache.set('key1', 'value1', 1000);
        cache.set('key2', 'value2', 500); // 最早過期
        cache.set('key3', 'value3', 1500);

        cache.set('key4', 'value4', 2000); // 應該淘汰 key2

        expect(cache.has('key1')).toBe(true);
        expect(cache.has('key2')).toBe(false);
        expect(cache.has('key3')).toBe(true);
        expect(cache.has('key4')).toBe(true);
      });
    });

    describe('Random 策略', () => {
      it('應該隨機淘汰項目', () => {
        cache = new MemoryCache<string, string>({
          maxSize: 3,
          evictionStrategy: EvictionStrategy.RANDOM
        });

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');
        cache.set('key4', 'value4');

        // 應該有一個項目被淘汰
        expect(cache.size()).toBe(3);
      });
    });
  });

  describe('統計資訊', () => {
    it('應該追蹤命中和未命中', () => {
      cache = new MemoryCache<string, string>({ enableStats: true });

      cache.set('key1', 'value1');
      cache.get('key1'); // 命中
      cache.get('key2'); // 未命中
      cache.get('key1'); // 命中

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.totalRequests).toBe(3);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('應該追蹤淘汰次數', () => {
      cache = new MemoryCache<string, string>({
        maxSize: 2,
        enableStats: true
      });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3'); // 淘汰 key1

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });

    it('應該追蹤過期次數', () => {
      cache = new MemoryCache<string, string>({
        defaultTTL: 1000,
        enableStats: true
      });

      cache.set('key1', 'value1');
      vi.advanceTimersByTime(1001);
      cache.get('key1'); // 過期

      const stats = cache.getStats();
      expect(stats.expirations).toBe(1);
    });
  });

  describe('事件監聽', () => {
    it('應該觸發 SET 事件', () => {
      cache = new MemoryCache<string, string>();
      const listener = vi.fn();
      cache.addListener(listener);

      cache.set('key1', 'value1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CacheEventType.SET,
          key: 'key1',
          value: 'value1'
        })
      );
    });

    it('應該觸發 HIT 事件', () => {
      cache = new MemoryCache<string, string>();
      const listener = vi.fn();
      cache.addListener(listener);

      cache.set('key1', 'value1');
      listener.mockClear();
      cache.get('key1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CacheEventType.HIT,
          key: 'key1',
          value: 'value1'
        })
      );
    });

    it('應該觸發 MISS 事件', () => {
      cache = new MemoryCache<string, string>();
      const listener = vi.fn();
      cache.addListener(listener);

      cache.get('nonexistent');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CacheEventType.MISS,
          key: 'nonexistent'
        })
      );
    });

    it('應該觸發 DELETE 事件', () => {
      cache = new MemoryCache<string, string>();
      const listener = vi.fn();
      cache.addListener(listener);

      cache.set('key1', 'value1');
      listener.mockClear();
      cache.delete('key1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CacheEventType.DELETE,
          key: 'key1',
          value: 'value1'
        })
      );
    });

    it('應該觸發 EVICT 事件', () => {
      cache = new MemoryCache<string, string>({ maxSize: 2 });
      const listener = vi.fn();
      cache.addListener(listener);

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      listener.mockClear();
      cache.set('key3', 'value3');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CacheEventType.EVICT
        })
      );
    });

    it('應該觸發 EXPIRE 事件', () => {
      cache = new MemoryCache<string, string>({ defaultTTL: 1000 });
      const listener = vi.fn();
      cache.addListener(listener);

      cache.set('key1', 'value1');
      listener.mockClear();
      vi.advanceTimersByTime(1001);
      cache.get('key1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CacheEventType.EXPIRE,
          key: 'key1',
          value: 'value1'
        })
      );
    });

    it('應該能夠移除監聽器', () => {
      cache = new MemoryCache<string, string>();
      const listener = vi.fn();
      cache.addListener(listener);
      cache.removeListener(listener);

      cache.set('key1', 'value1');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('資源清理', () => {
    it('應該能夠清理資源', () => {
      cache = new MemoryCache<string, string>({
        defaultTTL: 1000,
        cleanupInterval: 500
      });

      cache.set('key1', 'value1');
      cache.dispose();

      expect(cache.size()).toBe(0);
    });

    it('dispose 後應該清除所有監聽器', () => {
      cache = new MemoryCache<string, string>();
      const listener = vi.fn();
      cache.addListener(listener);

      cache.set('key1', 'value1'); // 先觸發一次事件
      listener.mockClear(); // 清除之前的調用記錄

      cache.dispose(); // dispose會觸發 clear 事件

      // 創建新的 cache 來測試
      const cache2 = new MemoryCache<string, string>();
      const listener2 = vi.fn();
      cache2.addListener(listener2);
      cache2.dispose();

      // 在dispose後設置值不應該觸發監聽器（因為已被清除）
      cache2.set('key2', 'value2');
      expect(listener2).toHaveBeenCalledTimes(1); // 只有 dispose時的 CLEAR 事件
    });
  });

  describe('邊界情況', () => {
    it('應該處理空快取的淘汰', () => {
      cache = new MemoryCache<string, string>({ maxSize: 0 });
      cache.set('key1', 'value1');

      expect(cache.size()).toBe(1);
    });

    it('應該處理複雜物件', () => {
      cache = new MemoryCache<string, any>();
      const obj = { a: 1, b: { c: 2 } };
      cache.set('key1', obj);

      expect(cache.get('key1')).toEqual(obj);
    });

    it('應該處理 null 和 undefined 值', () => {
      cache = new MemoryCache<string, any>();
      cache.set('key1', null);
      cache.set('key2', undefined);

      expect(cache.get('key1')).toBe(null);
      expect(cache.get('key2')).toBe(undefined);
    });

    it('應該處理監聽器錯誤', () => {
      cache = new MemoryCache<string, string>();
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = vi.fn();

      cache.addListener(errorListener);
      cache.addListener(normalListener);

      cache.set('key1', 'value1');

      expect(normalListener).toHaveBeenCalled();
    });
  });
});
