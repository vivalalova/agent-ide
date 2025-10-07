/**
 * 會話狀態管理類別
 *
 * 負責管理用戶會話的狀態，包括：
 * - 會話基本資訊（ID、用戶、創建時間等）
 * - 會話上下文（工作目錄、當前檔案等）
 * - 操作歷史記錄
 * - 狀態不可變更新
 * - 時間旅行除錯支援
 */
export class SessionState {
    sessionId;
    userId;
    isActive;
    createdAt;
    lastAccessedAt;
    context;
    operationHistory;
    options;
    constructor(sessionId, userId, options = {}) {
        const now = new Date();
        this.sessionId = sessionId;
        this.userId = userId;
        this.isActive = true;
        this.createdAt = now;
        this.lastAccessedAt = now;
        this.context = {};
        this.operationHistory = [];
        this.options = {
            maxHistorySize: 1000,
            timeoutMs: 30 * 60 * 1000, // 30 分鐘
            ...options
        };
    }
    /**
     * 從 JSON 數據建立 SessionState 實例
     */
    static fromJSON(data) {
        const instance = new SessionState(data.sessionId || '', data.userId, data.options);
        // 使用 Object.assign 來設定所有屬性
        return Object.assign(Object.create(Object.getPrototypeOf(instance)), {
            ...instance,
            isActive: data.isActive ?? true,
            createdAt: data.createdAt ? new Date(data.createdAt) : instance.createdAt,
            lastAccessedAt: data.lastAccessedAt ? new Date(data.lastAccessedAt) : instance.lastAccessedAt,
            context: data.context || {},
            operationHistory: data.operationHistory || [],
            options: data.options || instance.options
        });
    }
    /**
     * 更新會話上下文
     */
    updateContext(newContext) {
        return this.clone({
            context: { ...this.context, ...newContext },
            lastAccessedAt: new Date()
        });
    }
    /**
     * 更新最後存取時間
     */
    updateLastAccess() {
        return this.clone({
            lastAccessedAt: new Date()
        });
    }
    /**
     * 停用會話
     */
    deactivate() {
        return this.clone({
            isActive: false,
            lastAccessedAt: new Date()
        });
    }
    /**
     * 啟用會話
     */
    activate() {
        return this.clone({
            isActive: true,
            lastAccessedAt: new Date()
        });
    }
    /**
     * 添加操作記錄
     */
    addOperation(operation) {
        const newHistory = [...this.operationHistory, operation];
        // 檢查是否超過最大歷史記錄數量
        const maxSize = this.options.maxHistorySize || 1000;
        if (newHistory.length > maxSize) {
            newHistory.splice(0, newHistory.length - maxSize);
        }
        return this.clone({
            operationHistory: newHistory,
            lastAccessedAt: new Date()
        });
    }
    /**
     * 批次添加操作記錄
     */
    addOperations(operations) {
        let state = this;
        for (const operation of operations) {
            state = state.addOperation(operation);
        }
        return state;
    }
    /**
     * 清空操作歷史
     */
    clearHistory() {
        return this.clone({
            operationHistory: [],
            lastAccessedAt: new Date()
        });
    }
    /**
     * 檢查會話是否已過期
     */
    isExpired() {
        if (!this.options.timeoutMs) {
            return false;
        }
        const now = Date.now();
        const lastAccess = this.lastAccessedAt.getTime();
        return (now - lastAccess) > this.options.timeoutMs;
    }
    /**
     * 獲取會話持續時間（毫秒）
     */
    getDuration() {
        return Date.now() - this.createdAt.getTime();
    }
    /**
     * 回到指定操作的狀態（時間旅行除錯）
     */
    revertToOperation(operationId) {
        const operationIndex = this.operationHistory.findIndex(op => op.id === operationId);
        if (operationIndex === -1) {
            return this;
        }
        const newHistory = this.operationHistory.slice(0, operationIndex + 1);
        return this.clone({
            operationHistory: newHistory,
            lastAccessedAt: new Date()
        });
    }
    /**
     * 獲取指定時間點的狀態快照
     */
    getSnapshotAtTime(timestamp) {
        const targetTime = timestamp.getTime();
        const historyUpToTime = this.operationHistory.filter(op => op.timestamp.getTime() <= targetTime);
        return this.clone({
            operationHistory: historyUpToTime,
            lastAccessedAt: new Date()
        });
    }
    /**
     * 序列化為 JSON
     */
    toJSON() {
        return {
            sessionId: this.sessionId,
            userId: this.userId,
            isActive: this.isActive,
            createdAt: this.createdAt,
            lastAccessedAt: this.lastAccessedAt,
            context: this.context,
            operationHistory: this.operationHistory,
            options: this.options
        };
    }
    /**
     * 克隆狀態並應用變更（不可變更新）
     */
    clone(changes) {
        const instance = Object.create(Object.getPrototypeOf(this));
        return Object.assign(instance, {
            ...this,
            ...changes
        });
    }
}
//# sourceMappingURL=session-state.js.map