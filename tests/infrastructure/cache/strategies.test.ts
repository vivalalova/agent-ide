import { describe, it, expect, beforeEach } from 'vitest';
import { 
  LRUStrategy, 
  LFUStrategy, 
  FIFOStrategy, 
  TTLStrategy, 
  RandomStrategy, 
  StrategyFactory 
} from '../../../src/infrastructure/cache/strategies';
import { EvictionStrategy, type CacheItem } from '../../../src/infrastructure/cache/types';

describe('快取策略測試', () => {
  describe('LRUStrategy', () => {
    let strategy: LRUStrategy<string, string>;
    let items: Map<string, CacheItem<string>>;

    beforeEach(() => {
      strategy = new LRUStrategy();
      items = new Map();
      
      // 建立測試項目
      items.set('a', { 
        value: 'value-a', 
        createdAt: 1000, 
        lastAccessedAt: 1000, 
        accessCount: 0 
      });
      items.set('b', { 
        value: 'value-b', 
        createdAt: 2000, 
        lastAccessedAt: 2000, 
        accessCount: 0 
      });
      items.set('c', { 
        value: 'value-c', 
        createdAt: 3000, 
        lastAccessedAt: 3000, 
        accessCount: 0 
      });
    });

    it('應該正確建立 LRU 策略', () => {
      expect(strategy.name).toBe(EvictionStrategy.LRU);
    });

    it('應該按設定順序選擇要淘汰的項目', () => {
      // 按順序設定項目
      strategy.onSet('a', items.get('a')!);
      strategy.onSet('b', items.get('b')!);
      strategy.onSet('c', items.get('c')!);

      // 應該選擇最舊的項目 (a)
      expect(strategy.selectEvictionKey(items)).toBe('a');
    });

    it('應該在存取後更新 LRU 順序', () => {
      // 設定初始順序
      strategy.onSet('a', items.get('a')!);
      strategy.onSet('b', items.get('b')!);
      strategy.onSet('c', items.get('c')!);

      // 存取 a，讓它變成最新的
      strategy.onAccess('a', items.get('a')!);

      // 現在 b 應該是最舊的
      expect(strategy.selectEvictionKey(items)).toBe('b');
    });

    it('應該在刪除後更新內部狀態', () => {
      strategy.onSet('a', items.get('a')!);
      strategy.onSet('b', items.get('b')!);
      strategy.onSet('c', items.get('c')!);

      // 刪除 a
      strategy.onDelete('a');
      items.delete('a');

      // 現在 b 應該是最舊的
      expect(strategy.selectEvictionKey(items)).toBe('b');
    });

    it('應該能清理內部狀態', () => {
      strategy.onSet('a', items.get('a')!);
      strategy.onSet('b', items.get('b')!);
      
      strategy.clear();
      
      // 清理後應該沒有項目可以淘汰
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

    it('應該正確建立 LFU 策略', () => {
      expect(strategy.name).toBe(EvictionStrategy.LFU);
    });

    it('應該選擇存取次數最少的項目', () => {
      items.set('a', { 
        value: 'value-a', 
        createdAt: 1000, 
        lastAccessedAt: 1000, 
        accessCount: 1 
      });
      items.set('b', { 
        value: 'value-b', 
        createdAt: 2000, 
        lastAccessedAt: 2000, 
        accessCount: 3 
      });
      items.set('c', { 
        value: 'value-c', 
        createdAt: 3000, 
        lastAccessedAt: 3000, 
        accessCount: 2 
      });

      expect(strategy.selectEvictionKey(items)).toBe('a');
    });

    it('應該在沒有項目時返回 undefined', () => {
      expect(strategy.selectEvictionKey(items)).toBeUndefined();
    });
  });

  describe('FIFOStrategy', () => {
    let strategy: FIFOStrategy<string, string>;
    let items: Map<string, CacheItem<string>>;

    beforeEach(() => {
      strategy = new FIFOStrategy();
      items = new Map();
    });

    it('應該正確建立 FIFO 策略', () => {
      expect(strategy.name).toBe(EvictionStrategy.FIFO);
    });

    it('應該選擇最早建立的項目', () => {
      items.set('a', { 
        value: 'value-a', 
        createdAt: 3000, 
        lastAccessedAt: 3000, 
        accessCount: 0 
      });
      items.set('b', { 
        value: 'value-b', 
        createdAt: 1000, // 最早
        lastAccessedAt: 2000, 
        accessCount: 0 
      });
      items.set('c', { 
        value: 'value-c', 
        createdAt: 2000, 
        lastAccessedAt: 4000, 
        accessCount: 0 
      });

      expect(strategy.selectEvictionKey(items)).toBe('b');
    });
  });

  describe('TTLStrategy', () => {
    let strategy: TTLStrategy<string, string>;
    let items: Map<string, CacheItem<string>>;

    beforeEach(() => {
      strategy = new TTLStrategy();
      items = new Map();
    });

    it('應該正確建立 TTL 策略', () => {
      expect(strategy.name).toBe(EvictionStrategy.TTL);
    });

    it('應該優先選擇已過期的項目', () => {
      const now = Date.now();
      
      items.set('a', { 
        value: 'value-a', 
        createdAt: now - 2000, 
        lastAccessedAt: now - 2000, 
        accessCount: 0,
        expiresAt: now - 1000 // 已過期
      });
      items.set('b', { 
        value: 'value-b', 
        createdAt: now - 1000, 
        lastAccessedAt: now - 1000, 
        accessCount: 0,
        expiresAt: now + 5000 // 未過期
      });

      expect(strategy.selectEvictionKey(items)).toBe('a');
    });

    it('應該在沒有過期項目時選擇最早過期的項目', () => {
      const now = Date.now();
      
      items.set('a', { 
        value: 'value-a', 
        createdAt: now - 2000, 
        lastAccessedAt: now - 2000, 
        accessCount: 0,
        expiresAt: now + 3000
      });
      items.set('b', { 
        value: 'value-b', 
        createdAt: now - 1000, 
        lastAccessedAt: now - 1000, 
        accessCount: 0,
        expiresAt: now + 1000 // 最早過期
      });
      items.set('c', { 
        value: 'value-c', 
        createdAt: now - 500, 
        lastAccessedAt: now - 500, 
        accessCount: 0,
        expiresAt: now + 5000
      });

      expect(strategy.selectEvictionKey(items)).toBe('b');
    });

    it('應該處理沒有過期時間的項目', () => {
      items.set('a', { 
        value: 'value-a', 
        createdAt: 1000, 
        lastAccessedAt: 1000, 
        accessCount: 0
        // 沒有 expiresAt
      });

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

    it('應該正確建立 Random 策略', () => {
      expect(strategy.name).toBe(EvictionStrategy.RANDOM);
    });

    it('應該隨機選擇項目', () => {
      items.set('a', { 
        value: 'value-a', 
        createdAt: 1000, 
        lastAccessedAt: 1000, 
        accessCount: 0 
      });
      items.set('b', { 
        value: 'value-b', 
        createdAt: 2000, 
        lastAccessedAt: 2000, 
        accessCount: 0 
      });
      items.set('c', { 
        value: 'value-c', 
        createdAt: 3000, 
        lastAccessedAt: 3000, 
        accessCount: 0 
      });

      const selectedKey = strategy.selectEvictionKey(items);
      expect(['a', 'b', 'c']).toContain(selectedKey);
    });

    it('應該在沒有項目時返回 undefined', () => {
      expect(strategy.selectEvictionKey(items)).toBeUndefined();
    });
  });

  describe('StrategyFactory', () => {
    it('應該能建立 LRU 策略', () => {
      const strategy = StrategyFactory.createStrategy(EvictionStrategy.LRU);
      expect(strategy).toBeInstanceOf(LRUStrategy);
      expect(strategy.name).toBe(EvictionStrategy.LRU);
    });

    it('應該能建立 LFU 策略', () => {
      const strategy = StrategyFactory.createStrategy(EvictionStrategy.LFU);
      expect(strategy).toBeInstanceOf(LFUStrategy);
      expect(strategy.name).toBe(EvictionStrategy.LFU);
    });

    it('應該能建立 FIFO 策略', () => {
      const strategy = StrategyFactory.createStrategy(EvictionStrategy.FIFO);
      expect(strategy).toBeInstanceOf(FIFOStrategy);
      expect(strategy.name).toBe(EvictionStrategy.FIFO);
    });

    it('應該能建立 TTL 策略', () => {
      const strategy = StrategyFactory.createStrategy(EvictionStrategy.TTL);
      expect(strategy).toBeInstanceOf(TTLStrategy);
      expect(strategy.name).toBe(EvictionStrategy.TTL);
    });

    it('應該能建立 Random 策略', () => {
      const strategy = StrategyFactory.createStrategy(EvictionStrategy.RANDOM);
      expect(strategy).toBeInstanceOf(RandomStrategy);
      expect(strategy.name).toBe(EvictionStrategy.RANDOM);
    });

    it('應該在不支援的策略時拋出錯誤', () => {
      expect(() => {
        StrategyFactory.createStrategy('INVALID' as any);
      }).toThrow('Unsupported eviction strategy: INVALID');
    });
  });
});