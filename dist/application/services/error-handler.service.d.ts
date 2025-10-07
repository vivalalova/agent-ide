/**
 * ErrorHandler 服務實作
 * 提供統一的錯誤處理、重試機制和錯誤恢復功能
 */
import { EventBus } from '../events/event-bus.js';
import type { IErrorHandler, ErrorContext, HandledError, RetryOptions, RecoveryResult, ErrorStats } from '../types.js';
/**
 * 錯誤處理服務
 */
export declare class ErrorHandlerService implements IErrorHandler {
    private readonly eventBus;
    private readonly errorStats;
    private readonly maxRecentErrors;
    constructor(eventBus: EventBus);
    /**
     * 處理錯誤並返回 HandledError
     */
    handle(error: Error, context: ErrorContext): Promise<HandledError>;
    /**
     * 重試操作
     */
    retry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T>;
    /**
     * 恢復錯誤
     */
    recover(error: HandledError): Promise<RecoveryResult>;
    /**
     * 取得錯誤統計
     */
    getErrorStats(): Promise<ErrorStats>;
    /**
     * 建立 HandledError
     */
    private createHandledError;
    /**
     * 更新錯誤統計
     */
    private updateErrorStats;
    /**
     * 發布錯誤事件
     */
    private publishErrorEvent;
    /**
     * 生成用戶友好的錯誤訊息
     */
    private generateUserFriendlyMessage;
    /**
     * 計算延遲時間
     */
    private calculateDelay;
    /**
     * 休眠指定時間
     */
    private sleep;
}
//# sourceMappingURL=error-handler.service.d.ts.map