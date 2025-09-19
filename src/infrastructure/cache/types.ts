/**
 * 快取系統的核心型別定義
 */

/**
 * 快取項目的介面定義
 */
export interface CacheItem<V> {
  /** 快取的值 */
  value: V;
  /** 建立時間戳記 */
  createdAt: number;
  /** 最後存取時間戳記 */
  lastAccessedAt: number;
  /** 存取次數 */
  accessCount: number;
  /** 過期時間戳記（可選） */
  expiresAt?: number;
  /** 資料大小（位元組，用於記憶體管理） */
  size?: number;
}

/**
 * 快取配置選項
 */
export interface CacheOptions {
  /** 最大項目數量 */
  maxSize?: number;
  /** 最大記憶體使用量（位元組） */
  maxMemory?: number;
  /** 預設 TTL（毫秒） */
  defaultTTL?: number;
  /** 淘汰策略 */
  evictionStrategy?: EvictionStrategy;
  /** 是否啟用統計追蹤 */
  enableStats?: boolean;
  /** 自動清理間隔（毫秒） */
  cleanupInterval?: number;
  /** 序列化函式 */
  serialize?: (value: any) => string;
  /** 反序列化函式 */
  deserialize?: (value: string) => any;
}

/**
 * 淘汰策略列舉
 */
export enum EvictionStrategy {
  /** Least Recently Used - 最近最少使用 */
  LRU = 'lru',
  /** Least Frequently Used - 最不常使用 */
  LFU = 'lfu',
  /** First In First Out - 先進先出 */
  FIFO = 'fifo',
  /** Time To Live - 基於過期時間 */
  TTL = 'ttl',
  /** Random - 隨機淘汰 */
  RANDOM = 'random'
}

/**
 * 快取統計資訊
 */
export interface CacheStats {
  /** 總請求次數 */
  totalRequests: number;
  /** 快取命中次數 */
  hits: number;
  /** 快取未命中次數 */
  misses: number;
  /** 命中率（0-1） */
  hitRate: number;
  /** 當前項目數量 */
  size: number;
  /** 當前記憶體使用量（位元組） */
  memoryUsage: number;
  /** 已淘汰的項目數量 */
  evictions: number;
  /** 已過期的項目數量 */
  expirations: number;
  /** 平均存取時間（毫秒） */
  averageAccessTime: number;
}

/**
 * 快取事件類型
 */
export enum CacheEventType {
  /** 項目被設定 */
  SET = 'set',
  /** 項目被取得 */
  GET = 'get',
  /** 項目被刪除 */
  DELETE = 'delete',
  /** 項目被淘汰 */
  EVICT = 'evict',
  /** 項目過期 */
  EXPIRE = 'expire',
  /** 快取被清空 */
  CLEAR = 'clear',
  /** 快取命中 */
  HIT = 'hit',
  /** 快取未命中 */
  MISS = 'miss'
}

/**
 * 快取事件資料
 */
export interface CacheEvent<K, V> {
  /** 事件類型 */
  type: CacheEventType;
  /** 快取鍵 */
  key: K;
  /** 快取值（可選） */
  value?: V;
  /** 事件發生時間 */
  timestamp: number;
  /** 額外的事件元資料 */
  metadata?: Record<string, any>;
}

/**
 * 快取事件監聽器
 */
export type CacheEventListener<K, V> = (event: CacheEvent<K, V>) => void;

/**
 * 雙向鏈表節點（用於 LRU 實作）
 */
export interface LRUNode<K, V> {
  /** 節點鍵 */
  key: K;
  /** 快取項目 */
  item: CacheItem<V>;
  /** 前一個節點 */
  prev?: LRUNode<K, V>;
  /** 下一個節點 */
  next?: LRUNode<K, V>;
}

/**
 * 快取管理器配置
 */
export interface CacheManagerOptions {
  /** 預設快取配置 */
  defaultCacheOptions?: CacheOptions;
  /** 是否啟用全域統計 */
  enableGlobalStats?: boolean;
  /** 快取預熱配置 */
  warmupConfig?: WarmupConfig;
  /** 持久化配置 */
  persistenceConfig?: PersistenceConfig;
}

/**
 * 快取預熱配置
 */
export interface WarmupConfig {
  /** 是否啟用預熱 */
  enabled: boolean;
  /** 預熱資料來源 */
  dataSource?: () => Promise<Map<any, any>>;
  /** 預熱策略 */
  strategy?: 'eager' | 'lazy';
  /** 預熱完成回調 */
  onComplete?: (stats: { loaded: number; failed: number }) => void;
}

/**
 * 持久化配置
 */
export interface PersistenceConfig {
  /** 是否啟用持久化 */
  enabled: boolean;
  /** 儲存路徑 */
  filePath?: string;
  /** 持久化間隔（毫秒） */
  interval?: number;
  /** 壓縮選項 */
  compression?: boolean;
  /** 備份配置 */
  backup?: {
    enabled: boolean;
    maxBackups: number;
  };
}

/**
 * 批次操作結果
 */
export interface BatchResult<K, V> {
  /** 成功的項目 */
  success: Map<K, V>;
  /** 失敗的項目 */
  failed: Map<K, Error>;
  /** 執行統計 */
  stats: {
    total: number;
    successful: number;
    failed: number;
    duration: number;
  };
}

/**
 * 快取查詢選項
 */
export interface CacheQueryOptions {
  /** 是否包含統計資訊 */
  includeStats?: boolean;
  /** 是否更新存取時間 */
  updateAccessTime?: boolean;
  /** 自訂 TTL */
  customTTL?: number;
}

/**
 * 快取鍵值對
 */
export type CacheEntry<K, V> = [K, V];

/**
 * 快取可序列化的值型別
 */
export type SerializableValue = 
  | string 
  | number 
  | boolean 
  | null 
  | undefined 
  | SerializableObject 
  | SerializableArray;

export interface SerializableObject {
  [key: string]: SerializableValue;
}

export interface SerializableArray extends Array<SerializableValue> {}