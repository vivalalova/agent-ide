/**
 * EventBus 事件匯流排實作
 * 提供事件發送、訂閱、取消訂閱、錯誤處理、異步處理和優先級支援
 */
import { BaseError } from '../../shared/errors/base-error.js';
import { BaseEvent, EventHandler, UnsubscribeFunction, ErrorHandler, SubscriptionOptions, EmitOptions, EventStats } from './event-types.js';
/**
 * EventBus 相關錯誤
 */
export declare class EventBusError extends BaseError {
    constructor(message: string, details?: Record<string, any>, cause?: Error);
}
/**
 * EventBus 事件匯流排類別
 */
export declare class EventBus {
    private readonly emitter;
    private readonly subscriptions;
    private readonly priorityQueue;
    private readonly stats;
    private errorHandler;
    private destroyed;
    private processing;
    private subscriptionIdCounter;
    constructor();
    /**
     * 訂閱事件
     */
    subscribe<T extends BaseEvent = BaseEvent>(eventType: string, handler: EventHandler<T>, options?: SubscriptionOptions): UnsubscribeFunction;
    /**
     * 發送事件
     */
    emit(event: BaseEvent, options?: EmitOptions): Promise<void>;
    /**
     * 設定錯誤處理器
     */
    onError(handler: ErrorHandler): void;
    /**
     * 取得事件類型的訂閱者數量
     */
    getSubscriberCount(eventType: string): number;
    /**
     * 取得事件統計資訊
     */
    getStats(): EventStats;
    /**
     * 清理所有訂閱者和資源
     */
    destroy(): void;
    /**
     * 取消特定訂閱
     */
    private unsubscribe;
    /**
     * 處理優先級佇列
     */
    private processPriorityQueue;
    /**
     * 處理單個事件
     */
    private processEvent;
    /**
     * 帶超時的執行
     */
    private executeWithTimeout;
    /**
     * 處理錯誤
     */
    private handleError;
    /**
     * 更新事件類型統計
     */
    private updateEventTypeStats;
    /**
     * 更新平均處理時間
     */
    private updateAverageHandlingTime;
    /**
     * 更新事件類型平均處理時間
     */
    private updateEventTypeAverageTime;
    /**
     * 生成訂閱 ID
     */
    private generateSubscriptionId;
    /**
     * 驗證未被銷毀
     */
    private validateNotDestroyed;
    /**
     * 檢查是否被銷毀（用於 emit，不拋出錯誤）
     */
    private isDestroyed;
    /**
     * 驗證事件類型
     */
    private validateEventType;
    /**
     * 驗證處理器
     */
    private validateHandler;
    /**
     * 驗證事件
     */
    private validateEvent;
}
//# sourceMappingURL=event-bus.d.ts.map