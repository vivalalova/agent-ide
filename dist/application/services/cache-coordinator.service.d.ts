/**
 * CacheCoordinator 快取協調服務
 * 統一管理各模組的快取策略，提供全域和模組級別的快取失效、預熱和監控功能
 */
import { CacheManager } from '../../infrastructure/cache/cache-manager.js';
import { EventBus } from '../events/event-bus.js';
import { BaseError } from '../../shared/errors/base-error.js';
import type { ICacheCoordinator, CacheStrategy, CacheStats } from '../types.js';
/**
 * 快取協調器錯誤
 */
export declare class CacheCoordinatorError extends BaseError {
    constructor(message: string, details?: Record<string, any>, cause?: Error);
}
/**
 * 快取協調服務實作
 */
export declare class CacheCoordinatorService implements ICacheCoordinator {
    private readonly cacheManager;
    private readonly eventBus;
    private readonly moduleStrategies;
    private disposed;
    constructor(cacheManager: CacheManager, eventBus: EventBus);
    /**
     * 配置模組快取策略
     */
    configureCache(moduleId: string, strategy: CacheStrategy): Promise<void>;
    /**
     * 全域快取失效
     */
    invalidateAll(): Promise<void>;
    /**
     * 模組快取失效
     */
    invalidateModule(moduleId: string): Promise<void>;
    /**
     * 取得快取統計資訊
     */
    getStats(): Promise<CacheStats>;
    /**
     * 快取預熱
     */
    warmup(modules: string[]): Promise<void>;
    /**
     * 銷毀服務
     */
    dispose(): void;
    /**
     * 轉換策略為快取選項
     */
    private convertStrategyToCacheOptions;
    /**
     * 發布快取事件
     */
    private publishCacheEvent;
    /**
     * 驗證未被銷毀
     */
    private validateNotDisposed;
    /**
     * 驗證模組 ID
     */
    private validateModuleId;
    /**
     * 驗證策略
     */
    private validateStrategy;
}
//# sourceMappingURL=cache-coordinator.service.d.ts.map