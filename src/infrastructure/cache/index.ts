/**
 * 快取系統統一匯出
 *
 * 這個模組提供了完整的快取管理功能，包括：
 * - MemoryCache: 高效能記憶體快取實作
 * - CacheManager: 快取實例管理器
 * - 多種淘汰策略支援 (LRU, LFU, FIFO, TTL, Random)
 * - 統計追蹤和事件監聽
 * - 批次操作支援
 * - 快取預熱功能
 */

// 核心類別
export { MemoryCache } from './memory-cache.js';
export { CacheManager, type GlobalStats, type BatchOperationResult } from './cache-manager.js';

// 策略相關
export {
  LRUStrategy,
  LFUStrategy,
  FIFOStrategy,
  TTLStrategy,
  RandomStrategy,
  StrategyFactory,
  type CacheStrategy
} from './strategies.js';

// 型別定義
export {
  // 核心型別
  type CacheItem,
  type CacheOptions,
  type CacheStats,
  type CacheEvent,
  type CacheEventListener,
  type CacheManagerOptions,

  // 配置型別
  type WarmupConfig,
  type PersistenceConfig,

  // 操作結果型別
  type BatchResult,
  type CacheQueryOptions,
  type CacheEntry,

  // 序列化型別
  type SerializableValue,
  type SerializableObject,
  type SerializableArray,

  // 列舉
  EvictionStrategy,
  CacheEventType
} from './types.js';

// 常用的預設配置
export const DEFAULT_CACHE_OPTIONS = {
  maxSize: 1000,
  maxMemory: 50 * 1024 * 1024, // 50MB
  defaultTTL: 0, // 永不過期
  evictionStrategy: 'lru',
  enableStats: false,
  cleanupInterval: 60000 // 1分鐘
};

export const DEFAULT_MANAGER_OPTIONS = {
  enableGlobalStats: false,
  warmupConfig: {
    enabled: false,
    strategy: 'lazy'
  },
  persistenceConfig: {
    enabled: false,
    interval: 60000,
    compression: false,
    backup: {
      enabled: false,
      maxBackups: 3
    }
  }
};

/**
 * 工廠函式：建立預設配置的 MemoryCache
 */
export function createMemoryCache<K, V>(options?: any) {
  const { MemoryCache } = require('./memory-cache');
  return new MemoryCache({ ...DEFAULT_CACHE_OPTIONS, ...options });
}

/**
 * 工廠函式：建立預設配置的 CacheManager
 */
export function createCacheManager(options?: any) {
  const { CacheManager } = require('./cache-manager');
  return new CacheManager({ ...DEFAULT_MANAGER_OPTIONS, ...options });
}

/**
 * 工廠函式：建立 LRU 快取
 */
export function createLRUCache<K, V>(maxSize: number = 1000) {
  return createMemoryCache<K, V>({
    maxSize,
    evictionStrategy: 'lru',
    enableStats: true
  });
}

/**
 * 工廠函式：建立帶 TTL 的快取
 */
export function createTTLCache<K, V>(defaultTTL: number, maxSize: number = 1000) {
  return createMemoryCache<K, V>({
    maxSize,
    defaultTTL,
    evictionStrategy: 'ttl',
    enableStats: true
  });
}

/**
 * 工廠函式：建立高效能快取（針對高頻存取優化）
 */
export function createHighPerformanceCache<K, V>(options?: {
  maxSize?: number;
  strategy?: any;
}) {
  return createMemoryCache<K, V>({
    maxSize: options?.maxSize ?? 10000,
    evictionStrategy: options?.strategy ?? 'lru',
    enableStats: false, // 停用統計以獲得更好效能
    cleanupInterval: 300000 // 5分鐘清理一次
  });
}

/**
 * 快取工具函式
 */
export class CacheUtils {
  /**
   * 計算快取命中率
   */
  static calculateHitRate(hits: number, misses: number): number {
    const total = hits + misses;
    return total > 0 ? hits / total : 0;
  }

  /**
   * 格式化記憶體大小
   */
  static formatMemorySize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * 合併多個快取統計
   */
  static mergeStats(statsArray: any[]): any {
    if (statsArray.length === 0) {
      return {
        totalRequests: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0,
        memoryUsage: 0,
        evictions: 0,
        expirations: 0,
        averageAccessTime: 0
      };
    }

    const merged = statsArray.reduce((acc, stats) => ({
      totalRequests: acc.totalRequests + stats.totalRequests,
      hits: acc.hits + stats.hits,
      misses: acc.misses + stats.misses,
      hitRate: 0, // 稍後計算
      size: acc.size + stats.size,
      memoryUsage: acc.memoryUsage + stats.memoryUsage,
      evictions: acc.evictions + stats.evictions,
      expirations: acc.expirations + stats.expirations,
      averageAccessTime: acc.averageAccessTime + stats.averageAccessTime
    }));

    // 計算平均值
    merged.hitRate = this.calculateHitRate(merged.hits, merged.misses);
    merged.averageAccessTime = merged.averageAccessTime / statsArray.length;

    return merged;
  }

  /**
   * 產生快取鍵的雜湊值
   */
  static hashKey(key: any): string {
    if (typeof key === 'string') {return key;}
    if (typeof key === 'number') {return key.toString();}

    try {
      return JSON.stringify(key);
    } catch {
      return key.toString();
    }
  }

  /**
   * 驗證快取配置的合理性
   */
  static validateCacheOptions(options: any): string[] {
    const warnings: string[] = [];

    if (options.maxSize && options.maxSize <= 0) {
      warnings.push('maxSize should be greater than 0');
    }

    if (options.maxMemory && options.maxMemory <= 0) {
      warnings.push('maxMemory should be greater than 0');
    }

    if (options.defaultTTL && options.defaultTTL < 0) {
      warnings.push('defaultTTL should not be negative');
    }

    if (options.cleanupInterval && options.cleanupInterval < 1000) {
      warnings.push('cleanupInterval should be at least 1000ms for performance reasons');
    }

    return warnings;
  }
}

/**
 * 快取效能監控器
 */
export class CacheMonitor {
  private readonly caches = new Map<string, any>();

  constructor(_manager?: any) {
    // manager 參數保留以備未來使用
  }

  /**
   * 監控單一快取
   */
  addCache(name: string, cache: any): void {
    this.caches.set(name, cache);
  }

  /**
   * 移除監控的快取
   */
  removeCache(name: string): void {
    this.caches.delete(name);
  }

  /**
   * 取得效能報告
   */
  getPerformanceReport(): {
    caches: Array<{
      name: string;
      stats: any;
      healthScore: number;
    }>;
    overall: {
      totalCaches: number;
      averageHitRate: number;
      totalMemoryUsage: number;
      healthScore: number;
    };
    } {
    const cacheReports = Array.from(this.caches.entries()).map(([name, cache]) => {
      const stats = cache.getStats();
      const healthScore = this.calculateHealthScore(stats);
      return { name, stats, healthScore };
    });

    const overallStats = CacheUtils.mergeStats(cacheReports.map(r => r.stats));
    const overallHealthScore = this.calculateHealthScore(overallStats);

    return {
      caches: cacheReports,
      overall: {
        totalCaches: this.caches.size,
        averageHitRate: overallStats.hitRate,
        totalMemoryUsage: overallStats.memoryUsage,
        healthScore: overallHealthScore
      }
    };
  }

  /**
   * 計算快取健康評分（0-100）
   */
  private calculateHealthScore(stats: any): number {

    // 命中率影響 (40%)
    const hitRateScore = stats.hitRate * 40;

    // 記憶體使用率影響 (30%)
    const memoryScore = Math.max(0, 30 - (stats.memoryUsage / (50 * 1024 * 1024)) * 30);

    // 存取時間影響 (20%)
    const accessTimeScore = Math.max(0, 20 - Math.min(stats.averageAccessTime / 10, 20));

    // 淘汰率影響 (10%)
    const evictionRate = stats.totalRequests > 0 ? stats.evictions / stats.totalRequests : 0;
    const evictionScore = Math.max(0, 10 - evictionRate * 100);

    return Math.round(hitRateScore + memoryScore + accessTimeScore + evictionScore);
  }
}

/**
 * 版本資訊
 */
export const VERSION = '1.0.0';

/**
 * 快取系統資訊
 */
export const CACHE_SYSTEM_INFO = {
  name: 'Agent IDE Cache System',
  version: VERSION,
  description: '高效能快取管理系統，支援多種淘汰策略和統計追蹤',
  author: 'Agent IDE Team',
  supportedStrategies: ['lru', 'lfu', 'fifo', 'ttl', 'random'],
  features: [
    '多種淘汰策略 (LRU, LFU, FIFO, TTL, Random)',
    '記憶體管理和限制',
    '統計追蹤和效能監控',
    '事件系統',
    '批次操作',
    '快取預熱',
    '並發安全'
  ]
} as const;