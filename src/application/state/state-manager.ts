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

export class StateManager extends EventEmitter {
  private _applicationState: ApplicationState;
  private _activeSessions: Record<string, SessionState>;

  constructor(initialApplicationState?: ApplicationState) {
    super();
    this._applicationState = initialApplicationState || new ApplicationState();
    this._activeSessions = {};
  }

  /**
   * 從 JSON 字串建立 StateManager 實例
   */
  static fromJSON(jsonString: string): StateManager {
    const data = JSON.parse(jsonString) as StateSnapshot;

    const applicationState = ApplicationState.fromJSON(data.applicationState);
    const manager = new StateManager(applicationState);

    // 恢復會話狀態
    for (const [sessionId, sessionData] of Object.entries(data.sessions)) {
      const session = SessionState.fromJSON(sessionData);
      manager._activeSessions[sessionId] = session;
    }

    return manager;
  }

  /**
   * 獲取應用程式狀態
   */
  get applicationState(): ApplicationState {
    return this._applicationState;
  }

  /**
   * 獲取活躍會話
   */
  get activeSessions(): Record<string, SessionState> {
    return { ...this._activeSessions };
  }

  /**
   * 建立新會話
   */
  createSession(sessionId: string, userId?: string): SessionState {
    if (this._activeSessions[sessionId]) {
      throw new Error(`Session with ID ${sessionId} already exists`);
    }

    const session = new SessionState(sessionId, userId);
    this._activeSessions[sessionId] = session;

    this.emit('sessionCreated', {
      type: 'sessionCreated',
      sessionId,
      session
    } as StateEvent);

    return session;
  }

  /**
   * 獲取會話
   */
  getSession(sessionId: string): SessionState | undefined {
    return this._activeSessions[sessionId];
  }

  /**
   * 更新會話狀態
   */
  updateSession(
    sessionId: string,
    updater: (session: SessionState) => SessionState
  ): SessionState {
    const currentSession = this._activeSessions[sessionId];
    if (!currentSession) {
      throw new Error(`Session with ID ${sessionId} not found`);
    }

    const updatedSession = updater(currentSession);
    this._activeSessions[sessionId] = updatedSession;

    this.emit('sessionUpdated', {
      type: 'sessionUpdated',
      sessionId,
      session: updatedSession
    } as StateEvent);

    return updatedSession;
  }

  /**
   * 移除會話
   */
  removeSession(sessionId: string): SessionState | undefined {
    const session = this._activeSessions[sessionId];
    if (!session) {
      return undefined;
    }

    delete this._activeSessions[sessionId];

    this.emit('sessionRemoved', {
      type: 'sessionRemoved',
      sessionId,
      session
    } as StateEvent);

    return session;
  }

  /**
   * 列出所有活躍會話
   */
  listActiveSessions(): SessionState[] {
    return Object.values(this._activeSessions);
  }

  /**
   * 清理過期會話
   */
  cleanupExpiredSessions(): number {
    const expiredSessionIds: string[] = [];

    for (const [sessionId, session] of Object.entries(this._activeSessions)) {
      if (session.isExpired()) {
        expiredSessionIds.push(sessionId);
      }
    }

    for (const sessionId of expiredSessionIds) {
      this.removeSession(sessionId);
    }

    return expiredSessionIds.length;
  }

  /**
   * 更新應用程式狀態
   */
  updateApplicationState(
    updater: (state: ApplicationState) => ApplicationState
  ): ApplicationState {
    const oldState = this._applicationState;
    const newState = updater(oldState);
    this._applicationState = newState;

    this.emit('applicationStateUpdated', {
      type: 'applicationStateUpdated',
      oldState,
      newState
    } as StateEvent);

    return newState;
  }

  /**
   * 建立狀態快照
   */
  createSnapshot(): StateSnapshot {
    const sessions: Record<string, SessionStateData> = {};

    for (const [sessionId, session] of Object.entries(this._activeSessions)) {
      sessions[sessionId] = session.toJSON();
    }

    return {
      applicationState: this._applicationState.toJSON(),
      sessions,
      timestamp: new Date()
    };
  }

  /**
   * 從快照恢復狀態
   */
  restoreFromSnapshot(snapshot: StateSnapshot): void {
    // 恢復應用程式狀態
    this._applicationState = ApplicationState.fromJSON(snapshot.applicationState);

    // 清空現有會話
    this._activeSessions = {};

    // 恢復會話狀態
    for (const [sessionId, sessionData] of Object.entries(snapshot.sessions)) {
      const session = SessionState.fromJSON(sessionData);
      this._activeSessions[sessionId] = session;
    }
  }

  /**
   * 序列化為 JSON
   */
  toJSON(): StateSnapshot {
    return this.createSnapshot();
  }

  /**
   * 獲取狀態統計資訊
   */
  getStats(): StateManagerStats {
    const activeSessions = Object.values(this._activeSessions);
    const appSummary = this._applicationState.getSummary();

    return {
      totalSessions: activeSessions.length,
      activeSessions: activeSessions.filter(s => s.isActive).length,
      applicationState: appSummary
    };
  }

  /**
   * 檢查狀態健康度
   */
  checkHealth(): HealthCheck {
    const stats = this.getStats();
    const issues: string[] = [];

    // 檢查會話數量
    if (stats.totalSessions > 1000) {
      issues.push(`Too many active sessions (${stats.totalSessions} > 1000)`);
    }

    // 檢查應用程式狀態有效性
    if (!this._applicationState.isValid()) {
      issues.push('Application state is invalid');
    }

    // 檢查記憶體使用情況（簡化版）
    const estimatedMemoryUsage = this.estimateMemoryUsage();
    if (estimatedMemoryUsage > 100 * 1024 * 1024) { // 100MB
      issues.push(`High memory usage estimated: ${Math.round(estimatedMemoryUsage / 1024 / 1024)}MB`);
    }

    // 檢查過期會話
    const expiredSessions = Object.values(this._activeSessions).filter(s => s.isExpired());
    if (expiredSessions.length > 0) {
      issues.push(`Found ${expiredSessions.length} expired sessions`);
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      stats
    };
  }

  /**
   * 估算記憶體使用量（簡化版）
   */
  private estimateMemoryUsage(): number {
    const jsonString = JSON.stringify(this.toJSON());
    return jsonString.length * 2; // 估計每個字符佔用 2 bytes
  }

  /**
   * 添加事件監聽器（類型安全）
   */
  on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  /**
   * 移除事件監聽器（類型安全）
   */
  off(event: string, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }
}