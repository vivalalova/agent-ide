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

import { randomUUID } from 'crypto';
import type {
  ISessionManager,
  Session,
  SessionState,
  OperationHistory
} from '../types.js';
import type { StateManager } from '../state/state-manager.js';
import type { EventBus } from '../events/event-bus.js';
import { BaseError } from '@shared/errors/base-error.js';
import { SessionState as SessionStateClass } from '../state/session-state.js';

/**
 * 會話管理相關錯誤
 */
export class SessionManagerError extends BaseError {
  constructor(message: string, details?: Record<string, unknown>, cause?: Error) {
    super('SESSION_MANAGER_ERROR', message, details, cause);
  }
}

/**
 * 會話不存在錯誤
 */
export class SessionNotFoundError extends SessionManagerError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, { sessionId });
  }
}

/**
 * 會話管理服務實作
 */
export class SessionManager implements ISessionManager {
  private readonly stateManager: StateManager;
  private readonly eventBus: EventBus;
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly sessionTimeoutMs: number = 2 * 60 * 60 * 1000; // 2 小時

  constructor(stateManager: StateManager, eventBus: EventBus) {
    this.stateManager = stateManager;
    this.eventBus = eventBus;

    // 設定定期清理任務，每 30 分鐘執行一次
    this.cleanupInterval = setInterval(
      () => this.cleanup().catch(console.error),
      30 * 60 * 1000
    );

    // 在測試環境中註冊到全域清理器
    if (process.env.NODE_ENV === 'test') {
      if (typeof global !== 'undefined') {
        if (!(global as any).__test_session_managers) {
          (global as any).__test_session_managers = [];
        }
        (global as any).__test_session_managers.push(this);
      }
    }
  }

  /**
   * 建立新會話
   */
  async createSession(userId?: string): Promise<Session> {
    try {
      const sessionId = randomUUID();
      const now = new Date();

      // 在狀態管理器中建立會話
      const sessionState = this.stateManager.createSession(sessionId, userId);

      // 建立 Session 物件
      const session: Session = {
        id: sessionId,
        userId,
        startTime: now,
        lastActivity: now,
        state: this.convertToSessionState(sessionState),
        metadata: {}
      };

      // 發送會話建立事件
      await this.emitSessionEvent('session-created', sessionId, session);

      return session;
    } catch (error) {
      throw new SessionManagerError(
        'Failed to create session',
        { userId },
        error as Error
      );
    }
  }

  /**
   * 獲取會話
   */
  async getSession(sessionId: string): Promise<Session | null> {
    try {
      const sessionState = this.stateManager.getSession(sessionId);
      if (!sessionState) {
        return null;
      }

      // 更新最後存取時間
      const updatedSessionState = sessionState.updateLastAccess();
      this.stateManager.updateSession(sessionId, () => updatedSessionState);

      return this.convertToSession(sessionId, updatedSessionState);
    } catch (error) {
      throw new SessionManagerError(
        'Failed to get session',
        { sessionId },
        error as Error
      );
    }
  }

  /**
   * 更新會話狀態
   */
  async updateSession(
    sessionId: string,
    updates: Partial<SessionState>
  ): Promise<void> {
    try {
      const existingSession = this.stateManager.getSession(sessionId);
      if (!existingSession) {
        throw new SessionNotFoundError(sessionId);
      }

      // 更新會話狀態
      const updatedSessionState = this.stateManager.updateSession(
        sessionId,
        (currentState) => this.applyUpdates(currentState, updates)
      );

      // 發送會話更新事件
      const session = this.convertToSession(sessionId, updatedSessionState);
      await this.emitSessionEvent('session-updated', sessionId, session);
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        throw error;
      }
      throw new SessionManagerError(
        'Failed to update session',
        { sessionId, updates },
        error as Error
      );
    }
  }

  /**
   * 清理過期會話
   */
  async cleanup(): Promise<void> {
    try {
      const activeSessions = this.stateManager.listActiveSessions();
      const expiredSessionIds: string[] = [];

      for (const sessionState of activeSessions) {
        const isExpired = this.isSessionExpired(sessionState);
        const isInactiveForTooLong = this.isInactiveForTooLong(sessionState);
        const isExpiredStatus = this.convertToSessionState(sessionState).status === 'expired';

        if (isExpired || isInactiveForTooLong || isExpiredStatus) {
          expiredSessionIds.push(sessionState.sessionId);
        }
      }

      // 移除過期會話
      for (const sessionId of expiredSessionIds) {
        this.stateManager.removeSession(sessionId);
        await this.emitSessionEvent('session-expired', sessionId);
      }

      // 清理狀態管理器中的過期會話
      this.stateManager.cleanupExpiredSessions();
    } catch (error) {
      throw new SessionManagerError(
        'Failed to cleanup sessions',
        {},
        error as Error
      );
    }
  }

  /**
   * 獲取操作歷史
   */
  async getHistory(sessionId: string): Promise<OperationHistory[]> {
    try {
      const sessionState = this.stateManager.getSession(sessionId);
      if (!sessionState) {
        throw new SessionNotFoundError(sessionId);
      }

      // 轉換操作記錄格式
      return sessionState.operationHistory.map(record => ({
        id: record.id,
        operationType: record.type,
        timestamp: record.timestamp,
        parameters: (record.metadata.parameters || record.metadata) as Record<string, unknown>,
        result: record.metadata.result,
        error: record.metadata.error as any,
        duration: record.metadata.duration as number
      }));
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        throw error;
      }
      throw new SessionManagerError(
        'Failed to get session history',
        { sessionId },
        error as Error
      );
    }
  }

  /**
   * 銷毀服務，清理資源
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // 在測試環境中從全域清理器移除
    if (process.env.NODE_ENV === 'test') {
      if (typeof global !== 'undefined' && (global as any).__test_session_managers) {
        const managers = (global as any).__test_session_managers;
        const index = managers.indexOf(this);
        if (index !== -1) {
          managers.splice(index, 1);
        }
      }
    }
  }

  /**
   * 應用會話狀態更新
   */
  private applyUpdates(
    currentState: SessionStateClass,
    updates: Partial<SessionState>
  ): SessionStateClass {
    let updatedState = currentState;

    // 更新狀態
    if (updates.status !== undefined) {
      if (updates.status === 'active') {
        updatedState = updatedState.activate();
      } else if (updates.status === 'inactive') {
        updatedState = updatedState.deactivate();
      }
    }

    // 更新上下文
    if (updates.context !== undefined) {
      updatedState = updatedState.updateContext(updates.context as any);
    }

    // 更新操作歷史
    if (updates.operationHistory !== undefined) {
      // 清空現有歷史並添加新歷史
      updatedState = updatedState.clearHistory();
      const operationRecords = updates.operationHistory.map(op => ({
        id: op.id,
        type: op.operationType as any,
        timestamp: op.timestamp,
        description: `${op.operationType} operation`,
        metadata: {
          parameters: op.parameters,
          result: op.result,
          error: op.error,
          duration: op.duration
        }
      }));
      updatedState = updatedState.addOperations(operationRecords);
    }

    // 其他欄位的更新（如 updatedAt）
    if (updates.updatedAt !== undefined) {
      // 通過克隆來更新 updatedAt
      const data = updatedState.toJSON();
      data.lastAccessedAt = updates.updatedAt;
      updatedState = SessionStateClass.fromJSON(data);
    }

    return updatedState;
  }

  /**
   * 轉換 SessionStateClass 為 SessionState 介面
   */
  private convertToSessionState(sessionState: SessionStateClass): SessionState {
    const status = sessionState.isExpired()
      ? 'expired'
      : sessionState.isActive
        ? 'active'
        : 'inactive';

    return {
      id: sessionState.sessionId,
      userId: sessionState.userId,
      status,
      context: sessionState.context,
      operationHistory: sessionState.operationHistory.map(record => ({
        id: record.id,
        operationType: record.type,
        timestamp: record.timestamp,
        parameters: (record.metadata.parameters || record.metadata) as Record<string, unknown>,
        result: record.metadata.result,
        error: record.metadata.error as any,
        duration: record.metadata.duration as number
      })),
      createdAt: sessionState.createdAt,
      updatedAt: sessionState.lastAccessedAt
    };
  }

  /**
   * 轉換 SessionStateClass 為 Session 物件
   */
  private convertToSession(sessionId: string, sessionState: SessionStateClass): Session {
    return {
      id: sessionId,
      userId: sessionState.userId,
      startTime: sessionState.createdAt,
      lastActivity: sessionState.lastAccessedAt,
      state: this.convertToSessionState(sessionState),
      metadata: {}
    };
  }

  /**
   * 檢查會話是否已過期
   */
  private isSessionExpired(sessionState: SessionStateClass): boolean {
    return sessionState.isExpired();
  }

  /**
   * 檢查會話是否非活躍時間過長
   */
  private isInactiveForTooLong(sessionState: SessionStateClass): boolean {
    if (sessionState.isActive) {
      return false;
    }

    const now = Date.now();
    const lastAccess = sessionState.lastAccessedAt.getTime();
    return (now - lastAccess) > this.sessionTimeoutMs;
  }

  /**
   * 發送會話事件
   */
  private async emitSessionEvent(
    eventType: string,
    sessionId: string,
    session?: Session
  ): Promise<void> {
    try {
      await this.eventBus.emit({
        type: eventType,
        timestamp: new Date(),
        priority: 1,
        payload: {
          sessionId,
          session
        }
      });
    } catch (error) {
      // 事件發送失敗不應該影響主要功能
      // 測試環境中靜默處理
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`Failed to emit session event: ${eventType}`, error);
      }
    }
  }
}