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
import { SessionState } from './session-state.js';
import { ApplicationState } from './application-state.js';
export class StateManager extends EventEmitter {
    _applicationState;
    _activeSessions;
    constructor(initialApplicationState) {
        super();
        this._applicationState = initialApplicationState || new ApplicationState();
        this._activeSessions = {};
    }
    /**
     * 從 JSON 字串建立 StateManager 實例
     */
    static fromJSON(jsonString) {
        const data = JSON.parse(jsonString);
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
    get applicationState() {
        return this._applicationState;
    }
    /**
     * 獲取活躍會話
     */
    get activeSessions() {
        return { ...this._activeSessions };
    }
    /**
     * 建立新會話
     */
    createSession(sessionId, userId) {
        if (this._activeSessions[sessionId]) {
            throw new Error(`Session with ID ${sessionId} already exists`);
        }
        const session = new SessionState(sessionId, userId);
        this._activeSessions[sessionId] = session;
        this.emit('sessionCreated', {
            type: 'sessionCreated',
            sessionId,
            session
        });
        return session;
    }
    /**
     * 獲取會話
     */
    getSession(sessionId) {
        return this._activeSessions[sessionId];
    }
    /**
     * 更新會話狀態
     */
    updateSession(sessionId, updater) {
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
        });
        return updatedSession;
    }
    /**
     * 移除會話
     */
    removeSession(sessionId) {
        const session = this._activeSessions[sessionId];
        if (!session) {
            return undefined;
        }
        delete this._activeSessions[sessionId];
        this.emit('sessionRemoved', {
            type: 'sessionRemoved',
            sessionId,
            session
        });
        return session;
    }
    /**
     * 列出所有活躍會話
     */
    listActiveSessions() {
        return Object.values(this._activeSessions);
    }
    /**
     * 清理過期會話
     */
    cleanupExpiredSessions() {
        const expiredSessionIds = [];
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
    updateApplicationState(updater) {
        const oldState = this._applicationState;
        const newState = updater(oldState);
        this._applicationState = newState;
        this.emit('applicationStateUpdated', {
            type: 'applicationStateUpdated',
            oldState,
            newState
        });
        return newState;
    }
    /**
     * 建立狀態快照
     */
    createSnapshot() {
        const sessions = {};
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
    restoreFromSnapshot(snapshot) {
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
    toJSON() {
        return this.createSnapshot();
    }
    /**
     * 獲取狀態統計資訊
     */
    getStats() {
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
    checkHealth() {
        const stats = this.getStats();
        const issues = [];
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
    estimateMemoryUsage() {
        const jsonString = JSON.stringify(this.toJSON());
        return jsonString.length * 2; // 估計每個字符佔用 2 bytes
    }
    /**
     * 添加事件監聽器（類型安全）
     */
    on(event, listener) {
        return super.on(event, listener);
    }
    /**
     * 移除事件監聽器（類型安全）
     */
    off(event, listener) {
        return super.off(event, listener);
    }
}
//# sourceMappingURL=state-manager.js.map