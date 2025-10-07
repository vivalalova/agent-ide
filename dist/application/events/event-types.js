/**
 * 事件系統類型定義
 * 定義事件基本結構、處理器介面和優先級枚舉
 */
/**
 * 事件優先級枚舉
 */
export var EventPriority;
(function (EventPriority) {
    EventPriority[EventPriority["LOW"] = 0] = "LOW";
    EventPriority[EventPriority["NORMAL"] = 1] = "NORMAL";
    EventPriority[EventPriority["HIGH"] = 2] = "HIGH";
    EventPriority[EventPriority["CRITICAL"] = 3] = "CRITICAL";
})(EventPriority || (EventPriority = {}));
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
};
//# sourceMappingURL=event-types.js.map