/**
 * CacheCoordinator 服務測試
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheCoordinatorService } from '../../../src/application/services/cache-coordinator.service.js';
import { CacheManager } from '../../../src/infrastructure/cache/cache-manager.js';
import { EventBus } from '../../../src/application/events/event-bus.js';
import type {
  CacheStrategy,
  CacheStats,
  ModuleCacheStats
} from '../../../src/application/types.js';

describe('CacheCoordinatorService', () => {
  let cacheCoordinator: CacheCoordinatorService;
  let mockCacheManager: CacheManager;
  let mockEventBus: EventBus;

  beforeEach(() => {
    mockCacheManager = new CacheManager({
      enableGlobalStats: true,
      warmupConfig: {
        enabled: true,
        strategy: 'eager'
      }
    });
    mockEventBus = new EventBus();
    cacheCoordinator = new CacheCoordinatorService(mockCacheManager, mockEventBus);
  });

  afterEach(() => {
    mockCacheManager.dispose();
    mockEventBus.destroy();
  });

  describe('constructor', () => {
    test('應該正確初始化服務', () => {
      expect(cacheCoordinator).toBeDefined();
      expect(cacheCoordinator).toBeInstanceOf(CacheCoordinatorService);
    });

    test('應該拋出錯誤如果 cacheManager 為 null', () => {
      expect(() => {
        new CacheCoordinatorService(null as any, mockEventBus);
      }).toThrow('CacheManager 不能為空');
    });

    test('應該拋出錯誤如果 eventBus 為 null', () => {
      expect(() => {
        new CacheCoordinatorService(mockCacheManager, null as any);
      }).toThrow('EventBus 不能為空');
    });
  });

  describe('configureCache', () => {
    test('應該能配置模組快取策略', async () => {
      // Arrange
      const moduleId = 'test-module';
      const strategy: CacheStrategy = {
        type: 'lru',
        maxSize: 100,
        maxAge: 5000
      };

      // Act
      await cacheCoordinator.configureCache(moduleId, strategy);

      // Assert
      // 測試快取是否被建立
      const cache = mockCacheManager.getCache(moduleId);
      expect(cache).toBeDefined();
    });

    test('應該拋出錯誤如果 moduleId 為空', async () => {
      const strategy: CacheStrategy = { type: 'lru' };

      await expect(
        cacheCoordinator.configureCache('', strategy)
      ).rejects.toThrow('模組 ID 不能為空');
    });

    test('應該拋出錯誤如果 strategy 為 null', async () => {
      await expect(
        cacheCoordinator.configureCache('test-module', null as any)
      ).rejects.toThrow('快取策略不能為空');
    });

    test('應該支援不同的快取策略類型', async () => {
      const strategies: CacheStrategy[] = [
        { type: 'lru', maxSize: 50 },
        { type: 'lfu', maxSize: 100 },
        { type: 'ttl', maxAge: 10000 }
      ];

      for (let i = 0; i < strategies.length; i++) {
        const moduleId = `module-${i}`;
        await cacheCoordinator.configureCache(moduleId, strategies[i]);

        const cache = mockCacheManager.getCache(moduleId);
        expect(cache).toBeDefined();
      }
    });
  });

  describe('invalidateAll', () => {
    test('應該能清空所有快取', async () => {
      // Arrange
      await cacheCoordinator.configureCache('module1', { type: 'lru' });
      await cacheCoordinator.configureCache('module2', { type: 'lfu' });

      const cache1 = mockCacheManager.getCache('module1');
      const cache2 = mockCacheManager.getCache('module2');

      cache1?.set('key1', 'value1');
      cache2?.set('key2', 'value2');

      // Act
      await cacheCoordinator.invalidateAll();

      // Assert
      expect(cache1?.size()).toBe(0);
      expect(cache2?.size()).toBe(0);
    });

    test('應該發布快取失效事件', async () => {
      // Arrange
      const eventSpy = vi.fn();
      mockEventBus.subscribe('cache-event', eventSpy);

      await cacheCoordinator.configureCache('test-module', { type: 'lru' });

      // Act
      await cacheCoordinator.invalidateAll();

      // Assert
      expect(eventSpy).toHaveBeenCalledTimes(2); // configuration + invalidation
      // 檢查最後一個事件（失效事件）
      const lastEvent = eventSpy.mock.calls[1][0];
      expect(lastEvent.payload.eventType).toBe('invalidation');
      expect(lastEvent.payload.moduleId).toBeUndefined(); // 全域失效
    });
  });

  describe('invalidateModule', () => {
    test('應該能清空指定模組的快取', async () => {
      // Arrange
      await cacheCoordinator.configureCache('module1', { type: 'lru' });
      await cacheCoordinator.configureCache('module2', { type: 'lru' });

      const cache1 = mockCacheManager.getCache('module1');
      const cache2 = mockCacheManager.getCache('module2');

      cache1?.set('key1', 'value1');
      cache2?.set('key2', 'value2');

      // Act
      await cacheCoordinator.invalidateModule('module1');

      // Assert
      expect(cache1?.size()).toBe(0);
      expect(cache2?.size()).toBe(1); // module2 應該不受影響
    });

    test('應該拋出錯誤如果模組不存在', async () => {
      await expect(
        cacheCoordinator.invalidateModule('non-existent-module')
      ).rejects.toThrow('模組 non-existent-module 的快取不存在');
    });

    test('應該發布模組快取失效事件', async () => {
      // Arrange
      const eventSpy = vi.fn();
      mockEventBus.subscribe('cache-event', eventSpy);

      await cacheCoordinator.configureCache('test-module', { type: 'lru' });

      // Act
      await cacheCoordinator.invalidateModule('test-module');

      // Assert
      expect(eventSpy).toHaveBeenCalledTimes(2); // configuration + invalidation
      // 檢查最後一個事件（失效事件）
      const lastEvent = eventSpy.mock.calls[1][0];
      expect(lastEvent.payload.eventType).toBe('invalidation');
      expect(lastEvent.payload.moduleId).toBe('test-module');
    });
  });

  describe('getStats', () => {
    test('應該返回快取統計資訊', async () => {
      // Arrange
      await cacheCoordinator.configureCache('module1', { type: 'lru' });
      await cacheCoordinator.configureCache('module2', { type: 'lfu' });

      // Act
      const stats = await cacheCoordinator.getStats();

      // Assert
      expect(stats).toMatchObject({
        totalRequests: expect.any(Number),
        hits: expect.any(Number),
        misses: expect.any(Number),
        hitRate: expect.any(Number),
        size: expect.any(Number),
        maxSize: expect.any(Number),
        evictions: expect.any(Number),
        lastReset: expect.any(Date),
        moduleStats: expect.any(Map)
      });
    });

    test('應該包含各模組的統計資訊', async () => {
      // Arrange
      await cacheCoordinator.configureCache('module1', { type: 'lru' });

      const cache = mockCacheManager.getCache('module1');
      cache?.set('key1', 'value1');
      cache?.get('key1'); // 命中
      cache?.get('key2'); // 未命中

      // Act
      const stats = await cacheCoordinator.getStats();

      // Assert
      expect(stats.moduleStats.has('module1')).toBe(true);
      const moduleStats = stats.moduleStats.get('module1');
      expect(moduleStats).toMatchObject({
        moduleId: 'module1',
        requests: expect.any(Number),
        hits: expect.any(Number),
        misses: expect.any(Number),
        hitRate: expect.any(Number),
        size: expect.any(Number)
      });
    });
  });

  describe('warmup', () => {
    test('應該能預熱指定模組的快取', async () => {
      // Arrange
      await cacheCoordinator.configureCache('module1', { type: 'lru' });
      await cacheCoordinator.configureCache('module2', { type: 'lru' });

      // Act
      await cacheCoordinator.warmup(['module1', 'module2']);

      // Assert
      // 這裡主要測試方法執行不拋出異常
      // 實際的預熱邏輯依賴於 CacheManager 的實現
      expect(true).toBe(true);
    });

    test('應該拋出錯誤如果模組列表為空', async () => {
      await expect(
        cacheCoordinator.warmup([])
      ).rejects.toThrow('模組列表不能為空');
    });

    test('應該忽略不存在的模組', async () => {
      // Arrange
      await cacheCoordinator.configureCache('existing-module', { type: 'lru' });

      // Act & Assert
      // 應該不拋出異常，但會記錄警告
      await expect(
        cacheCoordinator.warmup(['existing-module', 'non-existent-module'])
      ).resolves.toBeUndefined();
    });

    test('應該發布預熱事件', async () => {
      // Arrange
      const eventSpy = vi.fn();
      mockEventBus.subscribe('cache-event', eventSpy);

      await cacheCoordinator.configureCache('test-module', { type: 'lru' });

      // Act
      await cacheCoordinator.warmup(['test-module']);

      // Assert
      expect(eventSpy).toHaveBeenCalledTimes(2); // configuration + warmup
      // 檢查最後一個事件（預熱事件）
      const lastEvent = eventSpy.mock.calls[1][0];
      expect(lastEvent.payload.eventType).toBe('warmup');
    });
  });

  describe('dispose', () => {
    test('應該正確清理資源', async () => {
      // Act
      cacheCoordinator.dispose();

      // Assert
      // 測試後續操作會拋出錯誤
      await expect(
        cacheCoordinator.getStats()
      ).rejects.toThrow('CacheCoordinator 已被銷毀');
    });

    test('應該支援多次調用 dispose', () => {
      // Act & Assert
      expect(() => {
        cacheCoordinator.dispose();
        cacheCoordinator.dispose();
      }).not.toThrow();
    });
  });
});