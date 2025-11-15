import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheManager } from '@infrastructure/cache/cache-manager';
import { MemoryCache } from '@infrastructure/cache/memory-cache';
import { EvictionStrategy } from '@infrastructure/cache/types';

describe('CacheManager', () => {
  let manager: CacheManager;

  beforeEach(() => {
    manager = new CacheManager();
  });

  afterEach(() => {
    if (manager) {
      manager.dispose();
    }
  });

  describe('基本功能', () => {
    it('應該能夠創建快取實例', () => {
      const cache = manager.createCache('test-cache');
      expect(cache).toBeInstanceOf(MemoryCache);
    });

    it('應該在創建重複名稱的快取時拋出錯誤', () => {
      manager.createCache('test-cache');
      expect(() => {
        manager.createCache('test-cache');
      }).toThrow('Cache with name "test-cache" already exists');
    });

    it('應該能夠取得現有的快取實例', () => {
      const cache = manager.createCache('test-cache');
      const retrieved = manager.getCache('test-cache');
      expect(retrieved).toBe(cache);
    });

    it('應該在取得不存在的快取時回傳 undefined', () => {
      const cache = manager.getCache('nonexistent');
      expect(cache).toBeUndefined();
    });

    it('應該能夠檢查快取是否存在', () => {
      manager.createCache('test-cache');
      expect(manager.hasCache('test-cache')).toBe(true);
      expect(manager.hasCache('nonexistent')).toBe(false);
    });

    it('應該能夠刪除快取實例', () => {
      manager.createCache('test-cache');
      expect(manager.deleteCache('test-cache')).toBe(true);
      expect(manager.hasCache('test-cache')).toBe(false);
    });

    it('應該在刪除不存在的快取時回傳 false', () => {
      expect(manager.deleteCache('nonexistent')).toBe(false);
    });

    it('應該能夠列出所有快取名稱', () => {
      manager.createCache('cache1');
      manager.createCache('cache2');
      manager.createCache('cache3');

      const names = manager.listCaches();
      expect(names).toHaveLength(3);
      expect(names).toContain('cache1');
      expect(names).toContain('cache2');
      expect(names).toContain('cache3');
    });
  });

  describe('批次操作', () => {
    it('應該能夠批次刪除快取', () => {
      manager.createCache('cache1');
      manager.createCache('cache2');
      manager.createCache('cache3');

      const result = manager.deleteCaches(['cache1', 'cache2', 'nonexistent']);

      expect(result.successful).toEqual(['cache1', 'cache2']);
      expect(result.failed).toEqual(['nonexistent']);
      expect(manager.hasCache('cache1')).toBe(false);
      expect(manager.hasCache('cache2')).toBe(false);
      expect(manager.hasCache('cache3')).toBe(true);
    });

    it('應該能夠清空指定快取的內容', () => {
      const cache = manager.createCache<string, string>('test-cache');
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      expect(manager.clearCache('test-cache')).toBe(true);
      expect(cache.size()).toBe(0);
    });

    it('應該在清空不存在的快取時回傳 false', () => {
      expect(manager.clearCache('nonexistent')).toBe(false);
    });

    it('應該能夠批次清空多個快取', () => {
      const cache1 = manager.createCache<string, string>('cache1');
      const cache2 = manager.createCache<string, string>('cache2');

      cache1.set('key1', 'value1');
      cache2.set('key2', 'value2');

      manager.clearCaches(['cache1', 'cache2', 'nonexistent']);

      expect(cache1.size()).toBe(0);
      expect(cache2.size()).toBe(0);
    });

    it('應該能夠清空所有快取', () => {
      const cache1 = manager.createCache<string, string>('cache1');
      const cache2 = manager.createCache<string, string>('cache2');

      cache1.set('key1', 'value1');
      cache2.set('key2', 'value2');

      manager.clearAll();

      expect(cache1.size()).toBe(0);
      expect(cache2.size()).toBe(0);
    });
  });

  describe('配置選項', () => {
    it('應該使用預設配置創建快取', () => {
      const defaultManager = new CacheManager({
        defaultCacheOptions: {
          maxSize: 500,
          evictionStrategy: EvictionStrategy.LFU
        }
      });

      const cache = defaultManager.createCache<string, string>('test-cache');
      cache.set('key1', 'value1');

      defaultManager.dispose();
    });

    it('應該允許覆蓋預設配置', () => {
      const defaultManager = new CacheManager({
        defaultCacheOptions: {
          maxSize: 500
        }
      });

      const cache = defaultManager.createCache<string, string>('test-cache', {
        maxSize: 1000
      });

      cache.set('key1', 'value1');

      defaultManager.dispose();
    });

    it('應該能夠取得管理器配置', () => {
      const options = manager.getOptions();
      expect(options).toBeDefined();
      expect(options.defaultCacheOptions).toBeDefined();
    });
  });

  describe('全域統計', () => {
    it('應該在啟用全域統計時收集統計資訊', () => {
      const statsManager = new CacheManager({
        enableGlobalStats: true,
        defaultCacheOptions: {
          enableStats: true
        }
      });

      const cache1 = statsManager.createCache<string, string>('cache1');
      const cache2 = statsManager.createCache<string, string>('cache2');

      cache1.set('key1', 'value1');
      cache2.set('key2', 'value2');

      cache1.get('key1'); // 命中
      cache1.get('key2'); // 未命中

      const stats = statsManager.getGlobalStats();
      expect(stats.totalCaches).toBe(2);
      expect(stats.totalItems).toBe(2);
      expect(stats.totalHits).toBe(1);
      expect(stats.totalMisses).toBe(1);

      statsManager.dispose();
    });

    it('應該在未啟用全域統計時回傳空統計', () => {
      const stats = manager.getGlobalStats();
      expect(stats.totalCaches).toBe(0);
      expect(stats.totalItems).toBe(0);
    });
  });

  describe('事件監聽', () => {
    it('應該能夠添加全域事件監聽器', () => {
      const statsManager = new CacheManager({
        enableGlobalStats: true
      });

      const listener = vi.fn();
      statsManager.addGlobalEventListener(listener);

      const cache = statsManager.createCache<string, string>('test-cache');
      cache.set('key1', 'value1');

      expect(listener).toHaveBeenCalled();

      statsManager.dispose();
    });

    it('應該能夠移除全域事件監聽器', () => {
      const statsManager = new CacheManager({
        enableGlobalStats: true
      });

      const listener = vi.fn();
      statsManager.addGlobalEventListener(listener);
      statsManager.removeGlobalEventListener(listener);

      const cache = statsManager.createCache<string, string>('test-cache');
      cache.set('key1', 'value1');

      expect(listener).not.toHaveBeenCalled();

      statsManager.dispose();
    });
  });

  describe('預熱功能', () => {
    it('應該在啟用時支援快取預熱', async () => {
      const warmupManager = new CacheManager({
        warmupConfig: {
          enabled: true,
          dataSource: async () => {
            const data = new Map<string, string>();
            data.set('key1', 'value1');
            data.set('key2', 'value2');
            return data;
          }
        }
      });

      const cache = warmupManager.createCache<string, string>('test-cache');
      await warmupManager.warmupCache('test-cache');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');

      warmupManager.dispose();
    });

    it('應該在預熱未啟用時拋出錯誤', async () => {
      const cache = manager.createCache('test-cache');

      await expect(manager.warmupCache('test-cache')).rejects.toThrow('Cache warmup is disabled');
    });

    it('應該在預熱不存在的快取時拋出錯誤', async () => {
      const warmupManager = new CacheManager({
        warmupConfig: {
          enabled: true
        }
      });

      await expect(warmupManager.warmupCache('nonexistent')).rejects.toThrow('Cache with name "nonexistent" does not exist');

      warmupManager.dispose();
    });

    it('應該在預熱完成時呼叫回調', async () => {
      const onComplete = vi.fn();
      const warmupManager = new CacheManager({
        warmupConfig: {
          enabled: true,
          dataSource: async () => {
            const data = new Map<string, string>();
            data.set('key1', 'value1');
            return data;
          },
          onComplete
        }
      });

      const cache = warmupManager.createCache<string, string>('test-cache');
      await warmupManager.warmupCache('test-cache');

      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          loaded: 1,
          failed: 0
        })
      );

      warmupManager.dispose();
    });
  });

  describe('資源清理', () => {
    it('應該能夠銷毀管理器', () => {
      manager.createCache('cache1');
      manager.createCache('cache2');

      manager.dispose();

      // 銷毀後不能再調用 listCaches
      expect(() => manager.listCaches()).toThrow('CacheManager has been disposed');
    });

    it('應該在銷毀後拋出錯誤', () => {
      manager.dispose();

      expect(() => {
        manager.createCache('test-cache');
      }).toThrow('CacheManager has been disposed');
    });

    it('應該能夠多次調用 dispose', () => {
      manager.dispose();
      expect(() => {
        manager.dispose();
      }).not.toThrow();
    });

    it('dispose 應該銷毀所有快取實例', () => {
      const cache1 = manager.createCache<string, string>('cache1');
      const cache2 = manager.createCache<string, string>('cache2');

      cache1.set('key1', 'value1');
      cache2.set('key2', 'value2');

      manager.dispose();

      expect(cache1.size()).toBe(0);
      expect(cache2.size()).toBe(0);
    });
  });

  describe('邊界情況', () => {
    it('應該處理空的快取名稱列表', () => {
      const result = manager.deleteCaches([]);
      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
    });

    it('應該處理空的清空操作', () => {
      expect(() => {
        manager.clearCaches([]);
      }).not.toThrow();
    });

    it('應該處理沒有快取的 clearAll', () => {
      expect(() => {
        manager.clearAll();
      }).not.toThrow();
    });
  });
});
