import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LRUStrategy,
  LFUStrategy,
  FIFOStrategy,
  TTLStrategy,
  RandomStrategy,
  StrategyFactory
} from '@infrastructure/cache/strategies';
import { EvictionStrategy, type CacheItem } from '@infrastructure/cache/types';

describe('Cache Strategies', () => {
  describe('LRUStrategy', () => {
    let strategy: LRUStrategy<string, string>;
    let items: Map<string, CacheItem<string>>;

    beforeEach(() => {
      strategy = new LRUStrategy();
      items = new Map();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('應該正確初始化', () => {
      expect(strategy.name).toBe(EvictionStrategy.LRU);
    });

    it('應該追蹤項目設定順序', () => {
      const item1: CacheItem<string> = { value: 'v1', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };
      const item2: CacheItem<string> = { value: 'v2', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };
      const item3: CacheItem<string> = { value: 'v3', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };

      strategy.onSet('key1', item1);
      strategy.onSet('key2', item2);
      strategy.onSet('key3', item3);

      items.set('key1', item1);
      items.set('key2', item2);
      items.set('key3', item3);

      // 應該淘汰最早加入的 key1
      expect(strategy.selectEvictionKey(items)).toBe('key1');
    });

    it('應該在存取時更新順序', () => {
      const item1: CacheItem<string> = { value: 'v1', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };
      const item2: CacheItem<string> = { value: 'v2', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };
      const item3: CacheItem<string> = { value: 'v3', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };

      strategy.onSet('key1', item1);
      strategy.onSet('key2', item2);
      strategy.onSet('key3', item3);

      // 存取 key1，使其成為最近使用的
      strategy.onAccess('key1', item1);

      items.set('key1', item1);
      items.set('key2', item2);
      items.set('key3', item3);

      // 應該淘汰 key2（key1 被訪問後移到最前面）
      expect(strategy.selectEvictionKey(items)).toBe('key2');
    });

    it('應該正確處理刪除', () => {
      const item1: CacheItem<string> = { value: 'v1', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };
      const item2: CacheItem<string> = { value: 'v2', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };

      strategy.onSet('key1', item1);
      strategy.onSet('key2', item2);
      strategy.onDelete('key1');

      items.set('key2', item2);

      // key1 已刪除，應該淘汰 key2
      expect(strategy.selectEvictionKey(items)).toBe('key2');
    });

    it('應該能夠清空狀態', () => {
      const item: CacheItem<string> = { value: 'v1', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };
      strategy.onSet('key1', item);
      strategy.clear();

      expect(strategy.selectEvictionKey(new Map())).toBeUndefined();
    });
  });

  describe('LFUStrategy', () => {
    let strategy: LFUStrategy<string, string>;
    let items: Map<string, CacheItem<string>>;

    beforeEach(() => {
      strategy = new LFUStrategy();
      items = new Map();
    });

    it('應該正確初始化', () => {
      expect(strategy.name).toBe(EvictionStrategy.LFU);
    });

    it('應該追蹤訪問頻率', () => {
      const item1: CacheItem<string> = { value: 'v1', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };
      const item2: CacheItem<string> = { value: 'v2', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 5, size: 10 };
      const item3: CacheItem<string> = { value: 'v3', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 3, size: 10 };

      strategy.onSet('key1', item1);
      strategy.onSet('key2', item2);
      strategy.onSet('key3', item3);

      items.set('key1', item1);
      items.set('key2', item2);
      items.set('key3', item3);

      // 應該淘汰訪問次數最少的 key1 (accessCount = 0)
      expect(strategy.selectEvictionKey(items)).toBe('key1');
    });

    it('應該在存取時更新頻率', () => {
      const item1: CacheItem<string> = { value: 'v1', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 1, size: 10 };
      const item2: CacheItem<string> = { value: 'v2', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 2, size: 10 };

      strategy.onSet('key1', item1);
      strategy.onSet('key2', item2);

      // 增加 item1 的訪問次數
      item1.accessCount = 3;
      strategy.onAccess('key1', item1);

      items.set('key1', item1);
      items.set('key2', item2);

      // 現在應該淘汰 key2 (accessCount = 2)
      expect(strategy.selectEvictionKey(items)).toBe('key2');
    });

    it('應該正確處理刪除', () => {
      const item: CacheItem<string> = { value: 'v1', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 1, size: 10 };
      strategy.onSet('key1', item);
      strategy.onDelete('key1');

      strategy.clear();
      items.clear();

      expect(strategy.selectEvictionKey(items)).toBeUndefined();
    });
  });

  describe('FIFOStrategy', () => {
    let strategy: FIFOStrategy<string, string>;
    let items: Map<string, CacheItem<string>>;

    beforeEach(() => {
      strategy = new FIFOStrategy();
      items = new Map();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('應該正確初始化', () => {
      expect(strategy.name).toBe(EvictionStrategy.FIFO);
    });

    it('應該淘汰最早加入的項目', () => {
      const now = Date.now();
      const item1: CacheItem<string> = { value: 'v1', createdAt: now, lastAccessedAt: now, accessCount: 0, size: 10 };

      vi.advanceTimersByTime(100);
      const item2: CacheItem<string> = { value: 'v2', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };

      vi.advanceTimersByTime(100);
      const item3: CacheItem<string> = { value: 'v3', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };

      items.set('key1', item1);
      items.set('key2', item2);
      items.set('key3', item3);

      // 應該淘汰最早創建的 key1
      expect(strategy.selectEvictionKey(items)).toBe('key1');
    });

    it('存取不應該影響淘汰順序', () => {
      const now = Date.now();
      const item1: CacheItem<string> = { value: 'v1', createdAt: now, lastAccessedAt: now, accessCount: 0, size: 10 };

      vi.advanceTimersByTime(100);
      const item2: CacheItem<string> = { value: 'v2', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };

      strategy.onSet('key1', item1);
      strategy.onSet('key2', item2);

      // 訪問 key1 不應該改變 FIFO 順序
      strategy.onAccess('key1', item1);

      items.set('key1', item1);
      items.set('key2', item2);

      // 仍然應該淘汰最早創建的 key1
      expect(strategy.selectEvictionKey(items)).toBe('key1');
    });

    it('應該處理空快取', () => {
      expect(strategy.selectEvictionKey(items)).toBeUndefined();
    });
  });

  describe('TTLStrategy', () => {
    let strategy: TTLStrategy<string, string>;
    let items: Map<string, CacheItem<string>>;

    beforeEach(() => {
      strategy = new TTLStrategy();
      items = new Map();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('應該正確初始化', () => {
      expect(strategy.name).toBe(EvictionStrategy.TTL);
    });

    it('應該優先淘汰已過期的項目', () => {
      const now = Date.now();
      const item1: CacheItem<string> = { value: 'v1', createdAt: now, lastAccessedAt: now, accessCount: 0, size: 10, expiresAt: now + 1000 };
      const item2: CacheItem<string> = { value: 'v2', createdAt: now, lastAccessedAt: now, accessCount: 0, size: 10, expiresAt: now - 100 }; // 已過期

      items.set('key1', item1);
      items.set('key2', item2);

      // 應該優先淘汰已過期的 key2
      expect(strategy.selectEvictionKey(items)).toBe('key2');
    });

    it('應該淘汰最接近過期的項目', () => {
      const now = Date.now();
      const item1: CacheItem<string> = { value: 'v1', createdAt: now, lastAccessedAt: now, accessCount: 0, size: 10, expiresAt: now + 1000 };
      const item2: CacheItem<string> = { value: 'v2', createdAt: now, lastAccessedAt: now, accessCount: 0, size: 10, expiresAt: now + 500 }; // 最早過期
      const item3: CacheItem<string> = { value: 'v3', createdAt: now, lastAccessedAt: now, accessCount: 0, size: 10, expiresAt: now + 1500 };

      items.set('key1', item1);
      items.set('key2', item2);
      items.set('key3', item3);

      expect(strategy.selectEvictionKey(items)).toBe('key2');
    });

    it('應該處理沒有過期時間的項目', () => {
      const now = Date.now();
      const item1: CacheItem<string> = { value: 'v1', createdAt: now, lastAccessedAt: now, accessCount: 0, size: 10 }; // 無過期時間

      items.set('key1', item1);

      expect(strategy.selectEvictionKey(items)).toBeUndefined();
    });
  });

  describe('RandomStrategy', () => {
    let strategy: RandomStrategy<string, string>;
    let items: Map<string, CacheItem<string>>;

    beforeEach(() => {
      strategy = new RandomStrategy();
      items = new Map();
    });

    it('應該正確初始化', () => {
      expect(strategy.name).toBe(EvictionStrategy.RANDOM);
    });

    it('應該隨機選擇淘汰項目', () => {
      const item1: CacheItem<string> = { value: 'v1', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };
      const item2: CacheItem<string> = { value: 'v2', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };
      const item3: CacheItem<string> = { value: 'v3', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };

      items.set('key1', item1);
      items.set('key2', item2);
      items.set('key3', item3);

      const key = strategy.selectEvictionKey(items);
      expect(['key1', 'key2', 'key3']).toContain(key);
    });

    it('應該處理空快取', () => {
      expect(strategy.selectEvictionKey(items)).toBeUndefined();
    });

    it('應該處理單一項目', () => {
      const item: CacheItem<string> = { value: 'v1', createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0, size: 10 };
      items.set('key1', item);

      expect(strategy.selectEvictionKey(items)).toBe('key1');
    });
  });

  describe('StrategyFactory', () => {
    it('應該創建 LRU 策略', () => {
      const strategy = StrategyFactory.createStrategy(EvictionStrategy.LRU);
      expect(strategy).toBeInstanceOf(LRUStrategy);
      expect(strategy.name).toBe(EvictionStrategy.LRU);
    });

    it('應該創建 LFU 策略', () => {
      const strategy = StrategyFactory.createStrategy(EvictionStrategy.LFU);
      expect(strategy).toBeInstanceOf(LFUStrategy);
      expect(strategy.name).toBe(EvictionStrategy.LFU);
    });

    it('應該創建 FIFO 策略', () => {
      const strategy = StrategyFactory.createStrategy(EvictionStrategy.FIFO);
      expect(strategy).toBeInstanceOf(FIFOStrategy);
      expect(strategy.name).toBe(EvictionStrategy.FIFO);
    });

    it('應該創建 TTL 策略', () => {
      const strategy = StrategyFactory.createStrategy(EvictionStrategy.TTL);
      expect(strategy).toBeInstanceOf(TTLStrategy);
      expect(strategy.name).toBe(EvictionStrategy.TTL);
    });

    it('應該創建 Random 策略', () => {
      const strategy = StrategyFactory.createStrategy(EvictionStrategy.RANDOM);
      expect(strategy).toBeInstanceOf(RandomStrategy);
      expect(strategy.name).toBe(EvictionStrategy.RANDOM);
    });

    it('應該拋出錯誤當策略不支援時', () => {
      expect(() => {
        StrategyFactory.createStrategy('INVALID' as any);
      }).toThrow('Unsupported eviction strategy');
    });
  });
});
