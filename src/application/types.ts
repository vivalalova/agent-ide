/**
 * Application Services 層型別定義
 */

import type { Position, Range } from '@shared/types/core.js';
import type { BaseError } from '@shared/errors/base-error.js';

// ============= 模組協調服務型別 =============

export interface ModuleStatus {
  moduleId: string;
  name: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  lastActivity?: Date;
  errorCount: number;
  metadata?: Record<string, unknown>;
}

export interface RefactorOptions {
  type: 'extract-function' | 'inline-function' | 'rename';
  selection?: Range;
  newName?: string;
  preview?: boolean;
}

export interface RefactorResult {
  success: boolean;
  changes: CodeChange[];
  preview?: string;
  error?: BaseError;
}

export interface CodeChange {
  filePath: string;
  oldContent: string;
  newContent: string;
  range?: Range;
}

export interface RenameOperation {
  filePath: string;
  position: Position;
  oldName: string;
  newName: string;
}

export interface RenameResult {
  success: boolean;
  filesChanged: number;
  changes: CodeChange[];
  error?: BaseError;
}

export interface MoveResult {
  success: boolean;
  from: string;
  to: string;
  filesUpdated: number;
  importUpdates: CodeChange[];
  error?: BaseError;
}

// ============= 會話管理型別 =============

export interface Session {
  id: string;
  userId?: string;
  startTime: Date;
  lastActivity: Date;
  state: SessionState;
  metadata?: Record<string, unknown>;
}

export interface SessionState {
  id: string;
  userId?: string;
  status: 'active' | 'inactive' | 'expired';
  context: SessionContext;
  operationHistory: OperationHistory[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionContext {
  workingDirectory?: string;
  currentFile?: string;
  environment?: Record<string, string>;
  preferences?: Record<string, unknown>;
}

export interface OperationHistory {
  id: string;
  operationType: string;
  timestamp: Date;
  parameters: Record<string, unknown>;
  result?: unknown;
  error?: BaseError;
  duration?: number;
}

// ============= 快取協調型別 =============

export interface CacheStrategy {
  type: 'lru' | 'lfu' | 'ttl' | 'custom';
  maxSize?: number;
  maxAge?: number;
  customStrategy?: (key: string, value: unknown) => boolean;
}

export interface CacheStats {
  totalRequests: number;
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
  evictions: number;
  lastReset: Date;
  moduleStats: Map<string, ModuleCacheStats>;
}

export interface ModuleCacheStats {
  moduleId: string;
  requests: number;
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
}

// ============= 錯誤處理型別 =============

export interface ErrorContext {
  module: string;
  operation: string;
  parameters?: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  timestamp: Date;
}

export interface HandledError extends BaseError {
  handled: boolean;
  context: ErrorContext;
  recovery?: RecoveryStrategy;
  userMessage?: string;
}

export interface RetryOptions {
  maxAttempts: number;
  backoff?: 'linear' | 'exponential';
  initialDelay?: number;
  maxDelay?: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

export interface RecoveryStrategy {
  type: 'retry' | 'fallback' | 'ignore' | 'manual';
  action?: () => Promise<unknown>;
  fallbackValue?: unknown;
  retryOptions?: RetryOptions;
}

export interface RecoveryResult {
  success: boolean;
  recoveryType: string;
  result?: unknown;
  error?: BaseError;
}

export interface ErrorStats {
  totalErrors: number;
  handledErrors: number;
  recoveredErrors: number;
  errorsByModule: Map<string, number>;
  errorsByType: Map<string, number>;
  recentErrors: ErrorContext[];
}

// ============= 服務介面定義 =============

export interface IModuleCoordinatorService {
  analyzeAndRefactor(filePath: string, options: RefactorOptions): Promise<RefactorResult>;
  batchRename(operations: RenameOperation[]): Promise<RenameResult[]>;
  smartMove(source: string, target: string): Promise<MoveResult>;
  getModuleStatus(): Promise<ModuleStatus[]>;
}

export interface ISessionManager {
  createSession(userId?: string): Promise<Session>;
  getSession(sessionId: string): Promise<Session | null>;
  updateSession(sessionId: string, updates: Partial<SessionState>): Promise<void>;
  cleanup(): Promise<void>;
  getHistory(sessionId: string): Promise<OperationHistory[]>;
}

export interface ICacheCoordinator {
  configureCache(moduleId: string, strategy: CacheStrategy): Promise<void>;
  invalidateAll(): Promise<void>;
  invalidateModule(moduleId: string): Promise<void>;
  getStats(): Promise<CacheStats>;
  warmup(modules: string[]): Promise<void>;
}

export interface IErrorHandler {
  handle(error: Error, context: ErrorContext): Promise<HandledError>;
  retry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T>;
  recover(error: HandledError): Promise<RecoveryResult>;
  getErrorStats(): Promise<ErrorStats>;
}

// ============= 事件型別 (整合既有的事件系統) =============

export interface ApplicationEvent {
  type: string;
  timestamp: Date;
  payload: unknown;
  source?: string;
  sessionId?: string;
}

export interface StateChangeEvent extends ApplicationEvent {
  type: 'state-change';
  payload: {
    stateType: 'session' | 'application';
    stateId: string;
    changes: Record<string, unknown>;
  };
}

export interface ModuleEvent extends ApplicationEvent {
  type: 'module-event';
  payload: {
    moduleId: string;
    eventType: string;
    data: unknown;
  };
}

export interface CacheEvent extends ApplicationEvent {
  type: 'cache-event';
  payload: {
    eventType: 'hit' | 'miss' | 'eviction' | 'invalidation' | 'warmup';
    moduleId?: string;
    key?: string;
    stats?: Partial<CacheStats>;
  };
}

export interface ErrorEvent extends ApplicationEvent {
  type: 'error-event';
  payload: {
    error: BaseError;
    context: ErrorContext;
    handled: boolean;
    recovered?: boolean;
  };
}