/**
 * CacheCoordinator 快取協調服務
 * 統一管理各模組的快取策略，提供全域和模組級別的快取失效、預熱和監控功能
 */

import { CacheManager } from '../../infrastructure/cache/cache-manager.js';
import { EventBus } from '../events/event-bus.js';
import { EventPriority, BaseEvent } from '../events/event-types.js';
import { BaseError } from '../../shared/errors/base-error.js';
import type {
  ICacheCoordinator,
  CacheStrategy,
  CacheStats,
  ModuleCacheStats,
  CacheEvent
} from '../types.js';

/**
 * 快取協調器錯誤
 */
export class CacheCoordinatorError extends BaseError {
  constructor(message: string, details?: Record<string, any>, cause?: Error) {
    super('CACHE_COORDINATOR_ERROR', message, details, cause);
  }
}

/**
 * 快取協調服務實作
 */
export class CacheCoordinatorService implements ICacheCoordinator {
  private readonly cacheManager: CacheManager;
  private readonly eventBus: EventBus;
  private readonly moduleStrategies = new Map<string, CacheStrategy>();
  private disposed = false;

  constructor(cacheManager: CacheManager, eventBus: EventBus) {
    if (!cacheManager) {
      throw new CacheCoordinatorError('CacheManager 不能為空');
    }
    if (!eventBus) {
      throw new CacheCoordinatorError('EventBus 不能為空');
    }

    this.cacheManager = cacheManager;
    this.eventBus = eventBus;
  }

  /**
   * 配置模組快取策略
   */
  async configureCache(moduleId: string, strategy: CacheStrategy): Promise<void> {
    this.validateNotDisposed();
    this.validateModuleId(moduleId);
    this.validateStrategy(strategy);

    try {
      // 儲存策略配置
      this.moduleStrategies.set(moduleId, strategy);

      // 建立快取實例
      const cacheOptions = this.convertStrategyToCacheOptions(strategy);

      // 如果快取已存在，先刪除
      if (this.cacheManager.hasCache(moduleId)) {
        this.cacheManager.deleteCache(moduleId);
      }

      this.cacheManager.createCache(moduleId, cacheOptions);

      // 發布配置事件
      await this.publishCacheEvent('configuration', {
        moduleId,
        strategy
      });
    } catch (error) {
      throw new CacheCoordinatorError(
        `配置模組 ${moduleId} 的快取失敗`,
        { moduleId, strategy },
        error as Error
      );
    }
  }

  /**
   * 全域快取失效
   */
  async invalidateAll(): Promise<void> {
    this.validateNotDisposed();

    try {
      this.cacheManager.clearAll();

      // 發布全域失效事件
      await this.publishCacheEvent('invalidation', {});
    } catch (error) {
      throw new CacheCoordinatorError(
        '全域快取失效失敗',
        {},
        error as Error
      );
    }
  }

  /**
   * 模組快取失效
   */
  async invalidateModule(moduleId: string): Promise<void> {
    this.validateNotDisposed();
    this.validateModuleId(moduleId);

    if (!this.cacheManager.hasCache(moduleId)) {
      throw new CacheCoordinatorError(
        `模組 ${moduleId} 的快取不存在`,
        { moduleId }
      );
    }

    try {
      this.cacheManager.clearCache(moduleId);

      // 發布模組失效事件
      await this.publishCacheEvent('invalidation', { moduleId });
    } catch (error) {
      throw new CacheCoordinatorError(
        `模組 ${moduleId} 快取失效失敗`,
        { moduleId },
        error as Error
      );
    }
  }

  /**
   * 取得快取統計資訊
   */
  async getStats(): Promise<CacheStats> {
    this.validateNotDisposed();

    try {
      const globalStats = this.cacheManager.getGlobalStats();
      const moduleStats = new Map<string, ModuleCacheStats>();

      // 收集各模組統計
      for (const moduleId of this.moduleStrategies.keys()) {
        const cache = this.cacheManager.getCache(moduleId);
        if (cache) {
          const cacheStats = cache.getStats();
          const moduleStatsItem: ModuleCacheStats = {
            moduleId,
            requests: cacheStats.totalRequests,
            hits: cacheStats.hits,
            misses: cacheStats.misses,
            hitRate: cacheStats.hitRate,
            size: cacheStats.size
          };
          moduleStats.set(moduleId, moduleStatsItem);
        }
      }

      const stats: CacheStats = {
        totalRequests: globalStats.totalRequests,
        hits: globalStats.totalHits,
        misses: globalStats.totalMisses,
        hitRate: globalStats.globalHitRate,
        size: globalStats.totalItems,
        maxSize: 0, // 需要根據策略計算
        evictions: globalStats.totalEvictions,
        lastReset: new Date(),
        moduleStats
      };

      return stats;
    } catch (error) {
      throw new CacheCoordinatorError(
        '取得快取統計失敗',
        {},
        error as Error
      );
    }
  }

  /**
   * 快取預熱
   */
  async warmup(modules: string[]): Promise<void> {
    this.validateNotDisposed();

    if (!modules || modules.length === 0) {
      throw new CacheCoordinatorError('模組列表不能為空');
    }

    try {
      for (const moduleId of modules) {
        if (this.cacheManager.hasCache(moduleId)) {
          // 這裡只是呼叫 warmupCache，實際的預熱邏輯在 CacheManager 中
          await this.cacheManager.warmupCache(moduleId);
        } else {
          console.warn(`模組 ${moduleId} 的快取不存在，跳過預熱`);
        }
      }

      // 發布預熱事件
      await this.publishCacheEvent('warmup', { modules });
    } catch (error) {
      // 預熱失敗不拋出錯誤，只記錄日誌
      console.error('快取預熱失敗:', error);

      // 但仍然發布預熱事件
      await this.publishCacheEvent('warmup', { modules, error: (error as Error).message });
    }
  }

  /**
   * 銷毀服務
   */
  dispose(): void {
    if (this.disposed) return;

    this.moduleStrategies.clear();
    this.disposed = true;
  }

  // ===== 私有方法 =====

  /**
   * 轉換策略為快取選項
   */
  private convertStrategyToCacheOptions(strategy: CacheStrategy): any {
    const options: any = {};

    switch (strategy.type) {
      case 'lru':
        options.strategy = 'lru';
        if (strategy.maxSize) options.maxSize = strategy.maxSize;
        break;
      case 'lfu':
        options.strategy = 'lfu';
        if (strategy.maxSize) options.maxSize = strategy.maxSize;
        break;
      case 'ttl':
        options.strategy = 'ttl';
        if (strategy.maxAge) options.maxAge = strategy.maxAge;
        break;
      case 'custom':
        if (strategy.customStrategy) {
          options.customStrategy = strategy.customStrategy;
        }
        break;
    }

    return options;
  }

  /**
   * 發布快取事件
   */
  private async publishCacheEvent(eventType: string, data: any): Promise<void> {
    const event: BaseEvent = {
      type: 'cache-event',
      timestamp: new Date(),
      priority: EventPriority.NORMAL,
      payload: {
        eventType,
        ...data
      }
    };

    await this.eventBus.emit(event);
  }

  /**
   * 驗證未被銷毀
   */
  private validateNotDisposed(): void {
    if (this.disposed) {
      throw new CacheCoordinatorError('CacheCoordinator 已被銷毀');
    }
  }

  /**
   * 驗證模組 ID
   */
  private validateModuleId(moduleId: string): void {
    if (!moduleId || typeof moduleId !== 'string' || moduleId.trim() === '') {
      throw new CacheCoordinatorError('模組 ID 不能為空');
    }
  }

  /**
   * 驗證策略
   */
  private validateStrategy(strategy: CacheStrategy): void {
    if (!strategy) {
      throw new CacheCoordinatorError('快取策略不能為空');
    }

    const validTypes = ['lru', 'lfu', 'ttl', 'custom'];
    if (!validTypes.includes(strategy.type)) {
      throw new CacheCoordinatorError(
        `無效的快取策略類型: ${strategy.type}`,
        { strategy }
      );
    }

    if (strategy.type === 'custom' && !strategy.customStrategy) {
      throw new CacheCoordinatorError(
        '自訂策略必須提供 customStrategy 函式',
        { strategy }
      );
    }
  }
}