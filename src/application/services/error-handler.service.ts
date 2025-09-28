/**
 * ErrorHandler 服務實作
 * 提供統一的錯誤處理、重試機制和錯誤恢復功能
 */

import { BaseError } from '../../shared/errors/base-error.js';
import { EventBus } from '../events/event-bus.js';
import { EventPriority } from '../events/event-types.js';
import type {
  IErrorHandler,
  ErrorContext,
  HandledError,
  RetryOptions,
  RecoveryResult,
  ErrorStats,
  RecoveryStrategy
} from '../types.js';

/**
 * 已處理錯誤實作
 */
class HandledErrorImpl extends BaseError implements HandledError {
  public readonly handled: boolean = true;
  public readonly context: ErrorContext;
  public readonly recovery?: RecoveryStrategy;
  public readonly userMessage?: string;

  constructor(
    code: string,
    message: string,
    context: ErrorContext,
    details?: Record<string, any>,
    cause?: Error,
    userMessage?: string,
    recovery?: RecoveryStrategy
  ) {
    super(code, message, details, cause);
    this.context = context;
    this.userMessage = userMessage;
    this.recovery = recovery;
  }
}

/**
 * 錯誤處理服務
 */
export class ErrorHandlerService implements IErrorHandler {
  private readonly eventBus: EventBus;
  private readonly errorStats: {
    totalErrors: number;
    handledErrors: number;
    recoveredErrors: number;
    errorsByModule: Map<string, number>;
    errorsByType: Map<string, number>;
    recentErrors: ErrorContext[];
  };

  private readonly maxRecentErrors = 10;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.errorStats = {
      totalErrors: 0,
      handledErrors: 0,
      recoveredErrors: 0,
      errorsByModule: new Map(),
      errorsByType: new Map(),
      recentErrors: []
    };
  }

  /**
   * 處理錯誤並返回 HandledError
   */
  async handle(error: Error, context: ErrorContext): Promise<HandledError> {
    // 更新統計
    this.updateErrorStats(error, context);

    // 建立 HandledError
    const handledError = this.createHandledError(error, context);

    // 發布錯誤事件
    await this.publishErrorEvent(handledError, context);

    return handledError;
  }

  /**
   * 重試操作
   */
  async retry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
    const {
      maxAttempts,
      backoff = 'linear',
      initialDelay = 1000,
      maxDelay = 30000,
      shouldRetry
    } = options;

    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // 檢查是否應該重試
        if (shouldRetry && !shouldRetry(lastError, attempt)) {
          throw lastError;
        }

        // 如果是最後一次嘗試，直接拋出錯誤
        if (attempt === maxAttempts) {
          throw lastError;
        }

        // 計算延遲時間
        const delay = this.calculateDelay(backoff, attempt, initialDelay, maxDelay);

        // 等待延遲
        if (delay > 0) {
          await this.sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  /**
   * 恢復錯誤
   */
  async recover(error: HandledError): Promise<RecoveryResult> {
    if (!error.recovery) {
      return {
        success: false,
        recoveryType: 'none'
      };
    }

    const { recovery } = error;

    try {
      switch (recovery.type) {
        case 'retry':
          if (recovery.action && recovery.retryOptions) {
            const result = await this.retry(recovery.action, recovery.retryOptions);
            this.errorStats.recoveredErrors++;
            return {
              success: true,
              recoveryType: 'retry',
              result
            };
          }
          break;

        case 'fallback':
          this.errorStats.recoveredErrors++;
          return {
            success: true,
            recoveryType: 'fallback',
            result: recovery.fallbackValue
          };

        case 'ignore':
          this.errorStats.recoveredErrors++;
          return {
            success: true,
            recoveryType: 'ignore'
          };

        case 'manual':
          return {
            success: false,
            recoveryType: 'manual'
          };
      }

      return {
        success: false,
        recoveryType: recovery.type
      };
    } catch (recoveryError) {
      return {
        success: false,
        recoveryType: recovery.type,
        error: recoveryError instanceof BaseError ? recoveryError : new BaseError(
          'RECOVERY_ERROR',
          '錯誤恢復失敗',
          { originalError: error.message, recoveryError: (recoveryError as Error).message }
        )
      };
    }
  }

  /**
   * 取得錯誤統計
   */
  async getErrorStats(): Promise<ErrorStats> {
    return {
      totalErrors: this.errorStats.totalErrors,
      handledErrors: this.errorStats.handledErrors,
      recoveredErrors: this.errorStats.recoveredErrors,
      errorsByModule: new Map(this.errorStats.errorsByModule),
      errorsByType: new Map(this.errorStats.errorsByType),
      recentErrors: [...this.errorStats.recentErrors]
    };
  }

  /**
   * 建立 HandledError
   */
  private createHandledError(error: Error, context: ErrorContext): HandledError {
    let code: string;
    let details: Record<string, any> | undefined;
    let cause: Error | undefined;

    // 如果是 BaseError，保持其屬性
    if (error instanceof BaseError) {
      code = error.code;
      details = error.details;
      cause = error.cause;
    } else {
      code = 'GENERIC_ERROR';
      details = { originalName: error.name };
      cause = error;
    }

    return new HandledErrorImpl(
      code,
      error.message,
      context,
      details,
      cause,
      this.generateUserFriendlyMessage(error)
    );
  }

  /**
   * 更新錯誤統計
   */
  private updateErrorStats(error: Error, context: ErrorContext): void {
    this.errorStats.totalErrors++;
    this.errorStats.handledErrors++;

    // 按模組統計
    const moduleCount = this.errorStats.errorsByModule.get(context.module) || 0;
    this.errorStats.errorsByModule.set(context.module, moduleCount + 1);

    // 按錯誤類型統計
    const typeCount = this.errorStats.errorsByType.get(error.constructor.name) || 0;
    this.errorStats.errorsByType.set(error.constructor.name, typeCount + 1);

    // 添加到最近錯誤（限制數量）
    this.errorStats.recentErrors.unshift(context);
    if (this.errorStats.recentErrors.length > this.maxRecentErrors) {
      this.errorStats.recentErrors = this.errorStats.recentErrors.slice(0, this.maxRecentErrors);
    }
  }

  /**
   * 發布錯誤事件
   */
  private async publishErrorEvent(error: HandledError, context: ErrorContext): Promise<void> {
    try {
      await this.eventBus.emit({
        type: 'error-event',
        timestamp: new Date(),
        priority: EventPriority.NORMAL,
        payload: {
          error,
          context,
          handled: true
        }
      });
    } catch (eventError) {
      // 避免在錯誤處理中產生無限迴圈
      // 在生產環境中應該記錄這個錯誤，但在測試中靜默處理
      if (process.env.NODE_ENV !== 'test') {
        console.error('Failed to publish error event:', eventError);
      }
    }
  }

  /**
   * 生成用戶友好的錯誤訊息
   */
  private generateUserFriendlyMessage(error: Error): string {
    if (error instanceof BaseError) {
      switch (error.code) {
        case 'VALIDATION_ERROR':
          return '資料驗證失敗，請檢查輸入內容是否正確。';
        case 'NETWORK_ERROR':
          return '網路連線發生問題，請檢查網路狀態後重試。';
        case 'FILE_NOT_FOUND':
          return '找不到指定的檔案，請確認檔案路徑是否正確。';
        case 'PERMISSION_ERROR':
          return '權限不足，無法執行此操作。';
        case 'TIMEOUT_ERROR':
          return '操作逾時，請稍後重試。';
        case 'DEPENDENCY_ERROR':
          return '相依性錯誤，請檢查相關模組狀態。';
        case 'PARSE_ERROR':
          return '解析錯誤，檔案格式可能不正確。';
        case 'INDEX_ERROR':
          return '索引操作失敗，請重新建立索引。';
        case 'CACHE_ERROR':
          return '快取操作失敗，系統將嘗試重新載入資料。';
        default:
          return `系統發生錯誤：${error.message}`;
      }
    }

    // 處理一般錯誤
    if (error.name === 'TypeError') {
      return '資料類型錯誤，請確認輸入格式是否正確。';
    } else if (error.name === 'RangeError') {
      return '數值超出有效範圍，請調整輸入值。';
    } else if (error.name === 'SyntaxError') {
      return '語法錯誤，請檢查程式碼格式。';
    }

    return `系統發生錯誤，請聯繫技術支援。錯誤訊息：${error.message}`;
  }

  /**
   * 計算延遲時間
   */
  private calculateDelay(
    backoff: 'linear' | 'exponential',
    attempt: number,
    initialDelay: number,
    maxDelay: number
  ): number {
    let delay: number;

    if (backoff === 'exponential') {
      delay = initialDelay * Math.pow(2, attempt - 1);
    } else {
      delay = initialDelay * attempt;
    }

    return Math.min(delay, maxDelay);
  }

  /**
   * 休眠指定時間
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}