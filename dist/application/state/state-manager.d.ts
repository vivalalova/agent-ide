/**
 * 狀態管理器
 *
 * 負責統一管理應用程式的所有狀態，包括：
 * - 應用程式全域狀態
 * - 會話狀態管理
 * - 狀態持久化和恢復
 * - 狀態變更通知
 * - 狀態健康度監控
 */
import { EventEmitter } from 'events';
import { SessionState, SessionStateData } from './session-state.js';
import { ApplicationState, ApplicationStateData } from './application-state.js';
export interface StateSnapshot {
    applicationState: ApplicationStateData;
    sessions: Record<string, SessionStateData>;
    timestamp: Date;
}
export interface StateManagerStats {
    totalSessions: number;
    activeSessions: number;
    applicationState: {
        version: string;
        environment: string;
        isInitialized: boolean;
        moduleCount: number;
        settingsCount: number;
        cacheHitRate: number;
        totalOperations: number;
        runtime: number;
    };
}
export interface HealthCheck {
    isHealthy: boolean;
    issues: string[];
    stats: StateManagerStats;
}
export interface StateEvent {
    type: 'sessionCreated' | 'sessionUpdated' | 'sessionRemoved' | 'applicationStateUpdated';
    sessionId?: string;
    session?: SessionState;
    oldState?: ApplicationState;
    newState?: ApplicationState;
}
export declare class StateManager extends EventEmitter {
    private _applicationState;
    private _activeSessions;
    constructor(initialApplicationState?: ApplicationState);
    /**
     * 從 JSON 字串建立 StateManager 實例
     */
    static fromJSON(jsonString: string): StateManager;
    /**
     * 獲取應用程式狀態
     */
    get applicationState(): ApplicationState;
    /**
     * 獲取活躍會話
     */
    get activeSessions(): Record<string, SessionState>;
    /**
     * 建立新會話
     */
    createSession(sessionId: string, userId?: string): SessionState;
    /**
     * 獲取會話
     */
    getSession(sessionId: string): SessionState | undefined;
    /**
     * 更新會話狀態
     */
    updateSession(sessionId: string, updater: (session: SessionState) => SessionState): SessionState;
    /**
     * 移除會話
     */
    removeSession(sessionId: string): SessionState | undefined;
    /**
     * 列出所有活躍會話
     */
    listActiveSessions(): SessionState[];
    /**
     * 清理過期會話
     */
    cleanupExpiredSessions(): number;
    /**
     * 更新應用程式狀態
     */
    updateApplicationState(updater: (state: ApplicationState) => ApplicationState): ApplicationState;
    /**
     * 建立狀態快照
     */
    createSnapshot(): StateSnapshot;
    /**
     * 從快照恢復狀態
     */
    restoreFromSnapshot(snapshot: StateSnapshot): void;
    /**
     * 序列化為 JSON
     */
    toJSON(): StateSnapshot;
    /**
     * 獲取狀態統計資訊
     */
    getStats(): StateManagerStats;
    /**
     * 檢查狀態健康度
     */
    checkHealth(): HealthCheck;
    /**
     * 估算記憶體使用量（簡化版）
     */
    private estimateMemoryUsage;
    /**
     * 添加事件監聽器（類型安全）
     */
    on(event: string, listener: (...args: unknown[]) => void): this;
    /**
     * 移除事件監聽器（類型安全）
     */
    off(event: string, listener: (...args: unknown[]) => void): this;
}
//# sourceMappingURL=state-manager.d.ts.map