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
import { MemoryCache } from './memory-cache.js';
import { CacheManager, type GlobalStats, type BatchOperationResult } from './cache-manager.js';

// Re-export 核心類別
export { MemoryCache, CacheManager, type GlobalStats, type BatchOperationResult };

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

// 型別定義（先 import 再 re-export）
import type {
  CacheOptions,
  CacheManagerOptions
} from './types.js';
import { EvictionStrategy } from './types.js';

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
export const DEFAULT_CACHE_OPTIONS: Partial<CacheOptions> = {
  maxSize: 3000,
  maxMemory: 150 * 1024 * 1024, // 150MB
  defaultTTL: 0, // 永不過期
  evictionStrategy: EvictionStrategy.LRU,
  enableStats: false,
  cleanupInterval: 60000 // 1分鐘
};

export const DEFAULT_MANAGER_OPTIONS: Partial<CacheManagerOptions> = {
  enableGlobalStats: false,
  warmupConfig: {
    enabled: false,
    strategy: 'lazy' as const
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
export function createMemoryCache<K, V>(options?: Partial<CacheOptions>) {
  return new MemoryCache<K, V>({ ...DEFAULT_CACHE_OPTIONS, ...options });
}

/**
 * 工廠函式：建立預設配置的 CacheManager
 */
export function createCacheManager(options?: Partial<CacheManagerOptions>) {
  return new CacheManager({ ...DEFAULT_MANAGER_OPTIONS, ...options });
}

/**
 * 工廠函式：建立 LRU 快取
 */
export function createLRUCache<K, V>(maxSize: number) {
  return createMemoryCache<K, V>({
    maxSize,
    evictionStrategy: EvictionStrategy.LRU,
    enableStats: true
  });
}

/**
 * 工廠函式：建立帶 TTL 的快取
 */
export function createTTLCache<K, V>(defaultTTL: number, maxSize: number) {
  return createMemoryCache<K, V>({
    maxSize,
    defaultTTL,
    evictionStrategy: EvictionStrategy.TTL,
    enableStats: true
  });
}

/**
 * 工廠函式：建立高效能快取（針對高頻存取優化）
 */
export function createHighPerformanceCache<K, V>(options?: {
  maxSize?: number;
  strategy?: typeof EvictionStrategy[keyof typeof EvictionStrategy];
}) {
  return createMemoryCache<K, V>({
    maxSize: options?.maxSize ?? 10000,
    evictionStrategy: options?.strategy ?? EvictionStrategy.LRU,
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
   * 產生快取鍵的雜湊值
   */
  static hashKey(key: unknown): string {
    if (typeof key === 'string') {return key;}
    if (typeof key === 'number') {return key.toString();}

    try {
      return JSON.stringify(key);
    } catch {
      // graceful-degradation: 循環引用等不可序列化物件 fallback 到 String()
      return String(key);
    }
  }

  /**
   * 驗證快取配置的合理性
   */
  static validateCacheOptions(options: Partial<CacheOptions>): string[] {
    const warnings: string[] = [];

    if (options.maxSize !== undefined && options.maxSize <= 0) {
      warnings.push('maxSize should be greater than 0');
    }

    if (options.maxMemory !== undefined && options.maxMemory <= 0) {
      warnings.push('maxMemory should be greater than 0');
    }

    if (options.defaultTTL !== undefined && options.defaultTTL < 0) {
      warnings.push('defaultTTL should not be negative');
    }

    if (options.cleanupInterval !== undefined && options.cleanupInterval < 1000) {
      warnings.push('cleanupInterval should be at least 1000ms for performance reasons');
    }

    return warnings;
  }
}
