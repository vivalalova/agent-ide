/**
 * EventBus 事件匯流排實作
 * 提供事件發送、訂閱、取消訂閱、錯誤處理、異步處理和優先級支援
 */
import { EventEmitter } from 'events';
import { BaseError } from '../../shared/errors/base-error.js';
import { EventPriority } from './event-types.js';
/**
 * EventBus 相關錯誤
 */
export class EventBusError extends BaseError {
    constructor(message, details, cause) {
        super('EVENT_BUS_ERROR', message, details, cause);
    }
}
/**
 * EventBus 事件匯流排類別
 */
export class EventBus {
    emitter;
    subscriptions;
    priorityQueue;
    stats;
    errorHandler = null;
    destroyed = false;
    processing = false;
    subscriptionIdCounter = 0;
    constructor() {
        this.emitter = new EventEmitter();
        this.subscriptions = new Map();
        this.priorityQueue = [];
        this.stats = {
            totalEmitted: 0,
            totalHandled: 0,
            errorCount: 0,
            averageHandlingTime: 0,
            byEventType: new Map()
        };
        // 設定最大監聽器數量以避免警告
        this.emitter.setMaxListeners(1000);
    }
    /**
     * 訂閱事件
     */
    subscribe(eventType, handler, options = {}) {
        this.validateNotDestroyed();
        this.validateEventType(eventType);
        this.validateHandler(handler);
        const subscriptionId = this.generateSubscriptionId();
        const subscriptionInfo = {
            handler: handler,
            options,
            id: subscriptionId
        };
        // 初始化事件類型的訂閱列表
        if (!this.subscriptions.has(eventType)) {
            this.subscriptions.set(eventType, new Map());
        }
        const eventSubscriptions = this.subscriptions.get(eventType);
        eventSubscriptions.set(subscriptionId, subscriptionInfo);
        // 返回取消訂閱函式
        return () => {
            this.unsubscribe(eventType, subscriptionId);
        };
    }
    /**
     * 發送事件
     */
    async emit(event, options = {}) {
        // 如果已被銷毀，靜默返回
        if (this.isDestroyed()) {
            return;
        }
        this.validateEvent(event);
        this.stats.totalEmitted++;
        this.updateEventTypeStats(event.type, 'emitted');
        // 如果有優先級佇列且不是立即處理，加入佇列
        if (event.priority !== EventPriority.NORMAL || this.processing) {
            this.priorityQueue.push({
                event,
                priority: event.priority,
                timestamp: Date.now()
            });
            if (!this.processing) {
                await this.processPriorityQueue();
            }
            return;
        }
        // 立即處理普通優先級事件，預設不等待處理器完成以避免超時
        await this.processEvent(event, { waitForHandlers: false, ...options });
    }
    /**
     * 設定錯誤處理器
     */
    onError(handler) {
        this.errorHandler = handler;
    }
    /**
     * 取得事件類型的訂閱者數量
     */
    getSubscriberCount(eventType) {
        const eventSubscriptions = this.subscriptions.get(eventType);
        return eventSubscriptions ? eventSubscriptions.size : 0;
    }
    /**
     * 取得事件統計資訊
     */
    getStats() {
        return {
            ...this.stats,
            byEventType: new Map(this.stats.byEventType)
        };
    }
    /**
     * 清理所有訂閱者和資源
     */
    destroy() {
        this.destroyed = true;
        this.subscriptions.clear();
        this.priorityQueue.length = 0;
        this.emitter.removeAllListeners();
        this.errorHandler = null;
    }
    /**
     * 取消特定訂閱
     */
    unsubscribe(eventType, subscriptionId) {
        const eventSubscriptions = this.subscriptions.get(eventType);
        if (eventSubscriptions) {
            eventSubscriptions.delete(subscriptionId);
            if (eventSubscriptions.size === 0) {
                this.subscriptions.delete(eventType);
            }
        }
    }
    /**
     * 處理優先級佇列
     */
    async processPriorityQueue() {
        if (this.processing || this.priorityQueue.length === 0) {
            return;
        }
        this.processing = true;
        try {
            // 按優先級和時間戳排序
            this.priorityQueue.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return b.priority - a.priority; // 高優先級在前
                }
                return a.timestamp - b.timestamp; // 相同優先級按時間排序
            });
            // 處理所有佇列中的事件
            while (this.priorityQueue.length > 0) {
                const item = this.priorityQueue.shift();
                await this.processEvent(item.event);
            }
        }
        finally {
            this.processing = false;
        }
    }
    /**
     * 處理單個事件
     */
    async processEvent(event, options = {}) {
        const eventSubscriptions = this.subscriptions.get(event.type);
        if (!eventSubscriptions || eventSubscriptions.size === 0) {
            return;
        }
        const startTime = Date.now();
        const handlers = [];
        // 收集所有處理器
        for (const [subscriptionId, subscriptionInfo] of eventSubscriptions) {
            handlers.push({ handler: subscriptionInfo.handler, info: subscriptionInfo });
            // 如果是一次性訂閱，標記為刪除
            if (subscriptionInfo.options.once) {
                eventSubscriptions.delete(subscriptionId);
            }
        }
        // 按處理器優先級排序
        handlers.sort((a, b) => {
            const aPriority = a.info.options.priority ?? EventPriority.NORMAL;
            const bPriority = b.info.options.priority ?? EventPriority.NORMAL;
            return bPriority - aPriority;
        });
        // 並行執行所有處理器
        const handlerPromises = handlers.map(async ({ handler, info }) => {
            try {
                const timeout = info.options.timeout || options.timeout;
                if (timeout) {
                    await this.executeWithTimeout(handler, event, timeout);
                }
                else {
                    await handler(event);
                }
                this.stats.totalHandled++;
                this.updateEventTypeStats(event.type, 'handled');
            }
            catch (error) {
                this.stats.errorCount++;
                this.updateEventTypeStats(event.type, 'error');
                this.handleError(error, event);
            }
        });
        if (options.waitForHandlers) {
            await Promise.all(handlerPromises);
        }
        else {
            // 不等待處理器完成，但仍要捕獲錯誤
            Promise.all(handlerPromises).catch(() => {
                // 錯誤已經在個別處理器中處理過了
            });
        }
        // 更新平均處理時間
        const endTime = Date.now();
        const processingTime = endTime - startTime;
        this.updateAverageHandlingTime(processingTime);
        this.updateEventTypeAverageTime(event.type, processingTime);
    }
    /**
     * 帶超時的執行
     */
    async executeWithTimeout(handler, event, timeout) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`事件處理器超時：${timeout}ms`));
            }, timeout);
            Promise.resolve(handler(event))
                .then(() => {
                clearTimeout(timer);
                resolve();
            })
                .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }
    /**
     * 處理錯誤
     */
    handleError(error, event) {
        if (this.errorHandler) {
            try {
                this.errorHandler(error, event);
            }
            catch (handlerError) {
                // 避免錯誤處理器本身出錯導致無限循環
                console.error('錯誤處理器自身出錯:', handlerError);
            }
        }
    }
    /**
     * 更新事件類型統計
     */
    updateEventTypeStats(eventType, operation) {
        if (!this.stats.byEventType.has(eventType)) {
            this.stats.byEventType.set(eventType, {
                emitted: 0,
                handled: 0,
                errors: 0,
                averageTime: 0
            });
        }
        const typeStats = this.stats.byEventType.get(eventType);
        switch (operation) {
            case 'emitted':
                typeStats.emitted++;
                break;
            case 'handled':
                typeStats.handled++;
                break;
            case 'error':
                typeStats.errors++;
                break;
        }
    }
    /**
     * 更新平均處理時間
     */
    updateAverageHandlingTime(processingTime) {
        const totalHandled = this.stats.totalHandled;
        if (totalHandled === 0) {
            this.stats.averageHandlingTime = processingTime;
        }
        else {
            this.stats.averageHandlingTime =
                (this.stats.averageHandlingTime * (totalHandled - 1) + processingTime) / totalHandled;
        }
    }
    /**
     * 更新事件類型平均處理時間
     */
    updateEventTypeAverageTime(eventType, processingTime) {
        const typeStats = this.stats.byEventType.get(eventType);
        if (typeStats) {
            const handledCount = typeStats.handled;
            if (handledCount === 1) {
                typeStats.averageTime = processingTime;
            }
            else {
                typeStats.averageTime =
                    (typeStats.averageTime * (handledCount - 1) + processingTime) / handledCount;
            }
        }
    }
    /**
     * 生成訂閱 ID
     */
    generateSubscriptionId() {
        return `sub_${++this.subscriptionIdCounter}_${Date.now()}`;
    }
    /**
     * 驗證未被銷毀
     */
    validateNotDestroyed() {
        if (this.destroyed) {
            throw new EventBusError('EventBus 已被銷毀，無法執行操作');
        }
    }
    /**
     * 檢查是否被銷毀（用於 emit，不拋出錯誤）
     */
    isDestroyed() {
        return this.destroyed;
    }
    /**
     * 驗證事件類型
     */
    validateEventType(eventType) {
        if (!eventType || typeof eventType !== 'string' || eventType.trim() === '') {
            throw new EventBusError('事件類型必須是非空字串');
        }
    }
    /**
     * 驗證處理器
     */
    validateHandler(handler) {
        if (!handler || typeof handler !== 'function') {
            throw new EventBusError('事件處理器必須是函式');
        }
    }
    /**
     * 驗證事件
     */
    validateEvent(event) {
        if (!event || typeof event !== 'object') {
            throw new EventBusError('事件必須是物件');
        }
        if (!event.type || typeof event.type !== 'string') {
            throw new EventBusError('事件必須包含有效的 type 屬性');
        }
        if (!event.payload || typeof event.payload !== 'object') {
            throw new EventBusError('事件必須包含有效的 payload 屬性');
        }
        if (!(event.timestamp instanceof Date)) {
            throw new EventBusError('事件必須包含有效的 timestamp 屬性');
        }
        if (typeof event.priority !== 'number' || !Object.values(EventPriority).includes(event.priority)) {
            throw new EventBusError('事件必須包含有效的 priority 屬性');
        }
    }
}
//# sourceMappingURL=event-bus.js.map