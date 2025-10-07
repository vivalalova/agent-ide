/**
 * 會話管理服務
 *
 * 負責管理用戶會話的生命週期，包括：
 * - 會話建立、查詢、更新
 * - 會話狀態管理
 * - 過期會話清理機制
 * - 操作歷史追蹤
 * - 並發會話隔離
 * - 會話事件發布
 */
import type { ISessionManager, Session, SessionState, OperationHistory } from '../types.js';
import type { StateManager } from '../state/state-manager.js';
import type { EventBus } from '../events/event-bus.js';
import { BaseError } from '../../shared/errors/base-error.js';
/**
 * 會話管理相關錯誤
 */
export declare class SessionManagerError extends BaseError {
    constructor(message: string, details?: Record<string, unknown>, cause?: Error);
}
/**
 * 會話不存在錯誤
 */
export declare class SessionNotFoundError extends SessionManagerError {
    constructor(sessionId: string);
}
/**
 * 會話管理服務實作
 */
export declare class SessionManager implements ISessionManager {
    private readonly stateManager;
    private readonly eventBus;
    private readonly cleanupInterval;
    private readonly sessionTimeoutMs;
    constructor(stateManager: StateManager, eventBus: EventBus);
    /**
     * 建立新會話
     */
    createSession(userId?: string): Promise<Session>;
    /**
     * 獲取會話
     */
    getSession(sessionId: string): Promise<Session | null>;
    /**
     * 更新會話狀態
     */
    updateSession(sessionId: string, updates: Partial<SessionState>): Promise<void>;
    /**
     * 清理過期會話
     */
    cleanup(): Promise<void>;
    /**
     * 獲取操作歷史
     */
    getHistory(sessionId: string): Promise<OperationHistory[]>;
    /**
     * 銷毀服務，清理資源
     */
    destroy(): void;
    /**
     * 應用會話狀態更新
     */
    private applyUpdates;
    /**
     * 轉換 SessionStateClass 為 SessionState 介面
     */
    private convertToSessionState;
    /**
     * 轉換 SessionStateClass 為 Session 物件
     */
    private convertToSession;
    /**
     * 檢查會話是否已過期
     */
    private isSessionExpired;
    /**
     * 檢查會話是否非活躍時間過長
     */
    private isInactiveForTooLong;
    /**
     * 發送會話事件
     */
    private emitSessionEvent;
}
//# sourceMappingURL=session-manager.service.d.ts.map