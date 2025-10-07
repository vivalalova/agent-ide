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
export interface SessionOptions {
    /** 最大歷史記錄數量 */
    maxHistorySize?: number;
    /** 會話逾時時間（毫秒） */
    timeoutMs?: number;
}
export interface OperationRecord {
    /** 操作唯一 ID */
    id: string;
    /** 操作類型 */
    type: 'rename' | 'move' | 'refactor' | 'analyze' | 'search' | 'index';
    /** 操作時間戳 */
    timestamp: Date;
    /** 操作描述 */
    description: string;
    /** 操作相關的元數據 */
    metadata: Record<string, unknown>;
}
export interface SessionContext {
    /** 工作目錄 */
    workingDirectory?: string;
    /** 當前檔案 */
    currentFile?: string;
    /** 其他上下文資料 */
    [key: string]: unknown;
}
export interface SessionStateData {
    sessionId: string;
    userId?: string;
    isActive: boolean;
    createdAt: Date;
    lastAccessedAt: Date;
    context: SessionContext;
    operationHistory: OperationRecord[];
    options: SessionOptions;
}
export declare class SessionState {
    readonly sessionId: string;
    readonly userId?: string;
    readonly isActive: boolean;
    readonly createdAt: Date;
    readonly lastAccessedAt: Date;
    readonly context: SessionContext;
    readonly operationHistory: OperationRecord[];
    readonly options: SessionOptions;
    constructor(sessionId: string, userId?: string, options?: SessionOptions);
    /**
     * 從 JSON 數據建立 SessionState 實例
     */
    static fromJSON(data: Partial<SessionStateData>): SessionState;
    /**
     * 更新會話上下文
     */
    updateContext(newContext: Partial<SessionContext>): SessionState;
    /**
     * 更新最後存取時間
     */
    updateLastAccess(): SessionState;
    /**
     * 停用會話
     */
    deactivate(): SessionState;
    /**
     * 啟用會話
     */
    activate(): SessionState;
    /**
     * 添加操作記錄
     */
    addOperation(operation: OperationRecord): SessionState;
    /**
     * 批次添加操作記錄
     */
    addOperations(operations: OperationRecord[]): this;
    /**
     * 清空操作歷史
     */
    clearHistory(): SessionState;
    /**
     * 檢查會話是否已過期
     */
    isExpired(): boolean;
    /**
     * 獲取會話持續時間（毫秒）
     */
    getDuration(): number;
    /**
     * 回到指定操作的狀態（時間旅行除錯）
     */
    revertToOperation(operationId: string): SessionState;
    /**
     * 獲取指定時間點的狀態快照
     */
    getSnapshotAtTime(timestamp: Date): SessionState;
    /**
     * 序列化為 JSON
     */
    toJSON(): SessionStateData;
    /**
     * 克隆狀態並應用變更（不可變更新）
     */
    private clone;
}
//# sourceMappingURL=session-state.d.ts.map