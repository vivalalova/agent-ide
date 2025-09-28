/**
 * 事件系統類型定義
 * 定義事件基本結構、處理器介面和優先級枚舉
 */

/**
 * 事件優先級枚舉
 */
export enum EventPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

/**
 * 基礎事件介面
 */
export interface BaseEvent {
  /** 事件類型 */
  type: string;
  /** 事件負載資料 */
  payload: Record<string, any>;
  /** 事件時間戳 */
  timestamp: Date;
  /** 事件優先級 */
  priority: EventPriority;
  /** 事件唯一識別符（可選） */
  id?: string;
  /** 事件來源（可選） */
  source?: string;
}

/**
 * 事件處理器類型
 */
export type EventHandler<T extends BaseEvent = BaseEvent> = (event: T) => void | Promise<void>;

/**
 * 取消訂閱函式類型
 */
export type UnsubscribeFunction = () => void;

/**
 * 錯誤處理器類型
 */
export type ErrorHandler = (error: Error, event?: BaseEvent) => void;

/**
 * 事件訂閱選項
 */
export interface SubscriptionOptions {
  /** 是否只執行一次 */
  once?: boolean;
  /** 處理器優先級（影響同一事件的處理順序） */
  priority?: EventPriority;
  /** 處理器超時時間（毫秒） */
  timeout?: number;
}

/**
 * 事件發送選項
 */
export interface EmitOptions {
  /** 是否等待所有處理器完成 */
  waitForHandlers?: boolean;
  /** 發送超時時間（毫秒） */
  timeout?: number;
}

/**
 * 預定義的系統事件類型
 */
export const SystemEvents = {
  /** 模組初始化事件 */
  MODULE_INITIALIZED: 'system.module.initialized',
  /** 模組銷毀事件 */
  MODULE_DESTROYED: 'system.module.destroyed',
  /** 錯誤發生事件 */
  ERROR_OCCURRED: 'system.error.occurred',
  /** 快取更新事件 */
  CACHE_UPDATED: 'system.cache.updated',
  /** 快取失效事件 */
  CACHE_INVALIDATED: 'system.cache.invalidated',
  /** 檔案變更事件 */
  FILE_CHANGED: 'system.file.changed',
  /** 會話開始事件 */
  SESSION_STARTED: 'system.session.started',
  /** 會話結束事件 */
  SESSION_ENDED: 'system.session.ended'
} as const;

/**
 * 模組初始化事件
 */
export interface ModuleInitializedEvent extends BaseEvent {
  type: typeof SystemEvents.MODULE_INITIALIZED;
  payload: {
    moduleName: string;
    version: string;
    config?: Record<string, any>;
  };
}

/**
 * 模組銷毀事件
 */
export interface ModuleDestroyedEvent extends BaseEvent {
  type: typeof SystemEvents.MODULE_DESTROYED;
  payload: {
    moduleName: string;
    reason?: string;
  };
}

/**
 * 錯誤發生事件
 */
export interface ErrorOccurredEvent extends BaseEvent {
  type: typeof SystemEvents.ERROR_OCCURRED;
  payload: {
    error: Error;
    context?: string;
    moduleName?: string;
  };
}

/**
 * 快取更新事件
 */
export interface CacheUpdatedEvent extends BaseEvent {
  type: typeof SystemEvents.CACHE_UPDATED;
  payload: {
    cacheKey: string;
    operation: 'set' | 'update' | 'delete';
    size?: number;
  };
}

/**
 * 快取失效事件
 */
export interface CacheInvalidatedEvent extends BaseEvent {
  type: typeof SystemEvents.CACHE_INVALIDATED;
  payload: {
    cacheKey?: string;
    pattern?: string;
    reason: 'expired' | 'manual' | 'memory_pressure';
  };
}

/**
 * 檔案變更事件
 */
export interface FileChangedEvent extends BaseEvent {
  type: typeof SystemEvents.FILE_CHANGED;
  payload: {
    filePath: string;
    changeType: 'created' | 'modified' | 'deleted' | 'renamed';
    oldPath?: string; // 用於重命名
  };
}

/**
 * 會話開始事件
 */
export interface SessionStartedEvent extends BaseEvent {
  type: typeof SystemEvents.SESSION_STARTED;
  payload: {
    sessionId: string;
    userId?: string;
    clientInfo?: Record<string, any>;
  };
}

/**
 * 會話結束事件
 */
export interface SessionEndedEvent extends BaseEvent {
  type: typeof SystemEvents.SESSION_ENDED;
  payload: {
    sessionId: string;
    duration: number; // 毫秒
    reason: 'normal' | 'timeout' | 'error' | 'force';
  };
}

/**
 * 所有系統事件的聯合類型
 */
export type SystemEvent =
  | ModuleInitializedEvent
  | ModuleDestroyedEvent
  | ErrorOccurredEvent
  | CacheUpdatedEvent
  | CacheInvalidatedEvent
  | FileChangedEvent
  | SessionStartedEvent
  | SessionEndedEvent;

/**
 * 事件統計資訊
 */
export interface EventStats {
  /** 總發送事件數 */
  totalEmitted: number;
  /** 總處理事件數 */
  totalHandled: number;
  /** 錯誤數量 */
  errorCount: number;
  /** 平均處理時間（毫秒） */
  averageHandlingTime: number;
  /** 按事件類型分組的統計 */
  byEventType: Map<string, {
    emitted: number;
    handled: number;
    errors: number;
    averageTime: number;
  }>;
}