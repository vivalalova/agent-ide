import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheManager } from '../../../src/infrastructure/cache/cache-manager';
import { EvictionStrategy, type CacheManagerOptions } from '../../../src/infrastructure/cache/types';

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager();
  });

  afterEach(() => {
    cacheManager.dispose();
  });

  describe('基本操作', () => {
    it('應該能建立快取管理器', () => {
      expect(cacheManager).toBeInstanceOf(CacheManager);
    });

    it('應該能建立新的快取實例', () => {
      const cache = cacheManager.createCache<string, string>('test-cache');
      expect(cache).toBeDefined();
      expect(cacheManager.hasCache('test-cache')).toBe(true);
    });

    it('應該能取得現有的快取實例', () => {
      const cache1 = cacheManager.createCache<string, string>('test-cache');
      const cache2 = cacheManager.getCache<string, string>('test-cache');
      
      expect(cache2).toBe(cache1);
    });

    it('應該在快取不存在時返回 undefined', () => {
      expect(cacheManager.getCache('nonexistent')).toBeUndefined();
    });

    it('應該能刪除快取實例', () => {
      cacheManager.createCache('test-cache');
      expect(cacheManager.hasCache('test-cache')).toBe(true);
      
      expect(cacheManager.deleteCache('test-cache')).toBe(true);
      expect(cacheManager.hasCache('test-cache')).toBe(false);
      
      expect(cacheManager.deleteCache('nonexistent')).toBe(false);
    });

    it('應該能列出所有快取名稱', () => {
      cacheManager.createCache('cache1');
      cacheManager.createCache('cache2');
      cacheManager.createCache('cache3');

      const cacheNames = cacheManager.listCaches();
      expect(cacheNames).toContain('cache1');
      expect(cacheNames).toContain('cache2');
      expect(cacheNames).toContain('cache3');
      expect(cacheNames).toHaveLength(3);
    });

    it('應該能清空所有快取', () => {
      const cache1 = cacheManager.createCache<string, string>('cache1');
      const cache2 = cacheManager.createCache<string, string>('cache2');
      
      cache1.set('key1', 'value1');
      cache2.set('key2', 'value2');
      
      cacheManager.clearAll();
      
      expect(cache1.size()).toBe(0);
      expect(cache2.size()).toBe(0);
    });

    it('應該能銷毀所有快取', () => {
      cacheManager.createCache('cache1');
      cacheManager.createCache('cache2');
      
      expect(cacheManager.listCaches()).toHaveLength(2);
      
      cacheManager.dispose();
      
      // 銷毀後應該無法再使用
      expect(() => cacheManager.listCaches()).toThrow('CacheManager has been disposed');
    });
  });

  describe('配置選項', () => {
    it('應該使用預設快取配置', () => {
      const options: CacheManagerOptions = {
        defaultCacheOptions: {
          maxSize: 50,
          evictionStrategy: EvictionStrategy.LFU
        }
      };
      
      const manager = new CacheManager(options);
      const cache = manager.createCache<string, string>('test');
      
      // 測試配置是否正確應用（通過行為驗證）
      for (let i = 0; i < 55; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      
      expect(cache.size()).toBe(50); // 應該被限制在 maxSize
      
      manager.dispose();
    });

    it('應該允許覆蓋預設配置', () => {
      const manager = new CacheManager({
        defaultCacheOptions: {
          maxSize: 100
        }
      });
      
      const cache = manager.createCache<string, string>('test', {
        maxSize: 5 // 覆蓋預設值
      });
      
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      
      expect(cache.size()).toBe(5);
      
      manager.dispose();
    });
  });

  describe('全域統計', () => {
    it('應該收集全域統計資訊', () => {
      const manager = new CacheManager({ 
        enableGlobalStats: true,
        defaultCacheOptions: { enableStats: true }
      });
      
      const cache1 = manager.createCache<string, string>('cache1');
      const cache2 = manager.createCache<string, string>('cache2');
      
      cache1.set('key1', 'value1');
      cache2.set('key2', 'value2');
      
      cache1.get('key1'); // 命中
      cache1.get('nonexistent'); // 未命中
      cache2.get('key2'); // 命中
      
      const globalStats = manager.getGlobalStats();
      
      expect(globalStats.totalCaches).toBe(2);
      expect(globalStats.totalItems).toBe(2);
      expect(globalStats.totalRequests).toBe(3);
      expect(globalStats.totalHits).toBe(2);
      expect(globalStats.totalMisses).toBe(1);
      expect(globalStats.globalHitRate).toBeCloseTo(2/3, 2);
      
      manager.dispose();
    });

    it('應該在停用全域統計時不收集統計', () => {
      const manager = new CacheManager({ enableGlobalStats: false });
      
      manager.createCache('cache1');
      
      const stats = manager.getGlobalStats();
      expect(stats.totalCaches).toBe(0);
      expect(stats.totalItems).toBe(0);
      expect(stats.totalRequests).toBe(0);
      
      manager.dispose();
    });
  });

  describe('快取預熱', () => {
    it('應該支援快取預熱功能', async () => {
      const warmupData = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
        ['key3', 'value3']
      ]);
      
      const onCompleteMock = vi.fn();
      
      const manager = new CacheManager({
        warmupConfig: {
          enabled: true,
          dataSource: () => Promise.resolve(warmupData),
          strategy: 'eager',
          onComplete: onCompleteMock
        }
      });
      
      const cache = manager.createCache<string, string>('test');
      
      await manager.warmupCache('test');
      
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.size()).toBe(3);
      
      expect(onCompleteMock).toHaveBeenCalledWith({
        loaded: 3,
        failed: 0
      });
      
      manager.dispose();
    });

    it('應該在預熱失敗時正確處理錯誤', async () => {
      const onCompleteMock = vi.fn();
      
      const manager = new CacheManager({
        warmupConfig: {
          enabled: true,
          dataSource: () => Promise.reject(new Error('Load failed')),
          onComplete: onCompleteMock
        }
      });
      
      manager.createCache('test');
      
      await manager.warmupCache('test');
      
      expect(onCompleteMock).toHaveBeenCalledWith({
        loaded: 0,
        failed: 1
      });
      
      manager.dispose();
    });
  });

  describe('批次操作', () => {
    it('應該支援批次清空指定的快取', () => {
      const cache1 = cacheManager.createCache<string, string>('cache1');
      const cache2 = cacheManager.createCache<string, string>('cache2');
      const cache3 = cacheManager.createCache<string, string>('cache3');
      
      cache1.set('key1', 'value1');
      cache2.set('key2', 'value2');
      cache3.set('key3', 'value3');
      
      cacheManager.clearCaches(['cache1', 'cache3']);
      
      expect(cache1.size()).toBe(0);
      expect(cache2.size()).toBe(1);
      expect(cache3.size()).toBe(0);
    });

    it('應該支援批次刪除指定的快取', () => {
      cacheManager.createCache('cache1');
      cacheManager.createCache('cache2');
      cacheManager.createCache('cache3');
      
      const result = cacheManager.deleteCaches(['cache1', 'cache3', 'nonexistent']);
      
      expect(result.successful).toEqual(['cache1', 'cache3']);
      expect(result.failed).toEqual(['nonexistent']);
      expect(cacheManager.hasCache('cache1')).toBe(false);
      expect(cacheManager.hasCache('cache2')).toBe(true);
      expect(cacheManager.hasCache('cache3')).toBe(false);
    });
  });

  describe('事件處理', () => {
    it('應該支援全域快取事件監聽', () => {
      const eventListener = vi.fn();
      
      const manager = new CacheManager({ enableGlobalStats: true });
      manager.addGlobalEventListener(eventListener);
      
      const cache = manager.createCache<string, string>('test');
      cache.set('key1', 'value1');
      cache.get('key1');
      
      expect(eventListener).toHaveBeenCalled();
      
      manager.removeGlobalEventListener(eventListener);
      cache.set('key2', 'value2');
      
      // 事件監聽器被移除後，不應該再被呼叫
      const previousCallCount = eventListener.mock.calls.length;
      cache.get('key2');
      expect(eventListener).toHaveBeenCalledTimes(previousCallCount);
      
      manager.dispose();
    });
  });

  describe('錯誤處理', () => {
    it('應該在重複建立快取時拋出錯誤', () => {
      cacheManager.createCache('test');
      
      expect(() => {
        cacheManager.createCache('test');
      }).toThrow('Cache with name "test" already exists');
    });

    it('應該在快取不存在時處理預熱請求', async () => {
      const manager = new CacheManager({
        warmupConfig: { enabled: true }
      });
      
      await expect(manager.warmupCache('nonexistent')).rejects.toThrow(
        'Cache with name "nonexistent" does not exist'
      );
      
      manager.dispose();
    });

    it('應該在停用預熱時拒絕預熱請求', async () => {
      const manager = new CacheManager({
        warmupConfig: { enabled: false }
      });
      
      manager.createCache('test');
      
      await expect(manager.warmupCache('test')).rejects.toThrow(
        'Cache warmup is disabled'
      );
      
      manager.dispose();
    });
  });
});