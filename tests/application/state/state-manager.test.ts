import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StateManager } from '../../../src/application/state/state-manager.js';
import { SessionState } from '../../../src/application/state/session-state.js';
import { ApplicationState } from '../../../src/application/state/application-state.js';

describe('StateManager', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('初始化', () => {
    it('應該能建立新的 StateManager 實例', () => {
      expect(stateManager).toBeDefined();
    });

    it('應該有正確的初始狀態', () => {
      expect(stateManager.applicationState).toBeInstanceOf(ApplicationState);
      expect(stateManager.activeSessions).toEqual({});
    });

    it('應該能使用自定義應用程式狀態初始化', () => {
      const customSettings = { maxCacheSize: 2048 };
      const customAppState = new ApplicationState(customSettings);
      const customManager = new StateManager(customAppState);

      expect(customManager.applicationState.getSetting('maxCacheSize')).toBe(2048);
    });
  });

  describe('會話管理', () => {
    it('應該能建立新會話', () => {
      const sessionId = 'test-session-1';
      const userId = 'user-123';

      const session = stateManager.createSession(sessionId, userId);

      expect(session).toBeInstanceOf(SessionState);
      expect(session.sessionId).toBe(sessionId);
      expect(session.userId).toBe(userId);
      expect(stateManager.activeSessions[sessionId]).toBe(session);
    });

    it('應該能建立沒有用戶 ID 的會話', () => {
      const sessionId = 'anonymous-session';

      const session = stateManager.createSession(sessionId);

      expect(session.sessionId).toBe(sessionId);
      expect(session.userId).toBeUndefined();
    });

    it('建立重複會話 ID 應該拋出錯誤', () => {
      const sessionId = 'duplicate-session';

      stateManager.createSession(sessionId);

      expect(() => {
        stateManager.createSession(sessionId);
      }).toThrowError('Session with ID duplicate-session already exists');
    });

    it('應該能獲取會話', () => {
      const sessionId = 'get-session-test';
      const createdSession = stateManager.createSession(sessionId);
      const retrievedSession = stateManager.getSession(sessionId);

      expect(retrievedSession).toBe(createdSession);
    });

    it('獲取不存在的會話應該回傳 undefined', () => {
      const session = stateManager.getSession('nonexistent');
      expect(session).toBeUndefined();
    });

    it('應該能更新會話狀態', () => {
      const sessionId = 'update-session-test';
      stateManager.createSession(sessionId);

      const newContext = { workingDirectory: '/test/path' };
      const updatedSession = stateManager.updateSession(sessionId, session =>
        session.updateContext(newContext)
      );

      expect(updatedSession.context.workingDirectory).toBe('/test/path');
      expect(stateManager.activeSessions[sessionId]).toBe(updatedSession);
    });

    it('更新不存在的會話應該拋出錯誤', () => {
      expect(() => {
        stateManager.updateSession('nonexistent', session => session);
      }).toThrowError('Session with ID nonexistent not found');
    });

    it('應該能移除會話', () => {
      const sessionId = 'remove-session-test';
      stateManager.createSession(sessionId);

      const removedSession = stateManager.removeSession(sessionId);

      expect(removedSession).toBeInstanceOf(SessionState);
      expect(stateManager.activeSessions[sessionId]).toBeUndefined();
    });

    it('移除不存在的會話應該回傳 undefined', () => {
      const result = stateManager.removeSession('nonexistent');
      expect(result).toBeUndefined();
    });

    it('應該能列出所有活躍會話', () => {
      stateManager.createSession('session-1');
      stateManager.createSession('session-2');
      stateManager.createSession('session-3');

      const sessions = stateManager.listActiveSessions();

      expect(sessions).toHaveLength(3);
      expect(sessions.map(s => s.sessionId)).toEqual(['session-1', 'session-2', 'session-3']);
    });

    it('應該能清理過期會話', () => {
      const shortTimeout = 100; // 100ms

      // 建立會話，並立即設為過期
      const session1 = stateManager.createSession('session-1');
      const session2 = stateManager.createSession('session-2');

      // 模擬過期會話 - 使用正確的方式更新私有屬性
      const expiredTime = new Date(Date.now() - 200);
      const expiredSession1 = Object.assign(Object.create(Object.getPrototypeOf(session1)), {
        ...session1,
        lastAccessedAt: expiredTime,
        options: { ...session1.options, timeoutMs: shortTimeout }
      });

      // 直接設定到內部狀態
      (stateManager as any)._activeSessions['session-1'] = expiredSession1;

      const cleanedCount = stateManager.cleanupExpiredSessions();

      expect(cleanedCount).toBe(1);
      expect(stateManager.activeSessions['session-1']).toBeUndefined();
      expect(stateManager.activeSessions['session-2']).toBeDefined();
    });
  });

  describe('應用程式狀態管理', () => {
    it('應該能更新應用程式狀態', () => {
      const newSettings = { maxCacheSize: 4096 };

      stateManager.updateApplicationState(state =>
        state.updateSettings(newSettings)
      );

      expect(stateManager.applicationState.getSetting('maxCacheSize')).toBe(4096);
    });

    it('應該能標記應用程式為已初始化', () => {
      stateManager.updateApplicationState(state => state.markInitialized());

      expect(stateManager.applicationState.isInitialized).toBe(true);
    });

    it('應該能設定模組狀態', () => {
      const moduleState = {
        isLoaded: true,
        lastUsed: new Date(),
        errorCount: 0,
        metadata: {}
      };

      stateManager.updateApplicationState(state =>
        state.setModuleState('parser', moduleState)
      );

      expect(stateManager.applicationState.getModuleState('parser')).toEqual(moduleState);
    });
  });

  describe('狀態快照', () => {
    it('應該能建立完整狀態快照', () => {
      // 建立一些測試資料
      stateManager.createSession('session-1', 'user-1');
      stateManager.createSession('session-2', 'user-2');
      stateManager.updateApplicationState(state =>
        state.updateSettings({ debugMode: true }).markInitialized()
      );

      const snapshot = stateManager.createSnapshot();

      expect(snapshot).toHaveProperty('applicationState');
      expect(snapshot).toHaveProperty('sessions');
      expect(snapshot).toHaveProperty('timestamp');
      expect(Object.keys(snapshot.sessions)).toHaveLength(2);
      expect(snapshot.applicationState.isInitialized).toBe(true);
    });

    it('應該能從快照恢復狀態', () => {
      // 建立快照數據
      const snapshotData = {
        applicationState: {
          version: '2.0.0',
          environment: 'production' as const,
          isInitialized: true,
          moduleStates: {},
          globalSettings: { testSetting: 'value' },
          cacheStats: { hitCount: 10, missCount: 2, totalSize: 100 },
          performanceMetrics: {
            startTime: new Date('2023-01-01'),
            totalOperations: 50,
            averageResponseTime: 120
          }
        },
        sessions: {
          'restored-session': {
            sessionId: 'restored-session',
            userId: 'restored-user',
            isActive: true,
            createdAt: new Date('2023-01-01'),
            lastAccessedAt: new Date('2023-01-02'),
            context: { workingDirectory: '/restored/path' },
            operationHistory: [],
            options: { maxHistorySize: 100, timeoutMs: 30000 }
          }
        },
        timestamp: new Date()
      };

      stateManager.restoreFromSnapshot(snapshotData);

      expect(stateManager.applicationState.version).toBe('2.0.0');
      expect(stateManager.applicationState.environment).toBe('production');
      expect(stateManager.applicationState.getSetting('testSetting')).toBe('value');
      expect(stateManager.getSession('restored-session')).toBeDefined();
      expect(stateManager.getSession('restored-session')?.userId).toBe('restored-user');
    });
  });

  describe('狀態持久化', () => {
    it('應該能序列化狀態為 JSON', () => {
      stateManager.createSession('json-session', 'json-user');
      stateManager.updateApplicationState(state =>
        state.updateSettings({ jsonTest: true })
      );

      const json = stateManager.toJSON();

      expect(json).toHaveProperty('applicationState');
      expect(json).toHaveProperty('sessions');
      expect(json).toHaveProperty('timestamp');
      expect(json.sessions['json-session']).toBeDefined();
      expect(json.applicationState.globalSettings.jsonTest).toBe(true);
    });

    it('應該能從 JSON 恢復狀態', () => {
      const jsonData = JSON.stringify({
        applicationState: {
          version: '1.5.0',
          environment: 'test',
          isInitialized: false,
          moduleStates: {},
          globalSettings: { fromJson: true },
          cacheStats: { hitCount: 0, missCount: 0, totalSize: 0 },
          performanceMetrics: {
            startTime: new Date().toISOString(),
            totalOperations: 0,
            averageResponseTime: 0
          }
        },
        sessions: {
          'json-restored': {
            sessionId: 'json-restored',
            isActive: true,
            createdAt: new Date().toISOString(),
            lastAccessedAt: new Date().toISOString(),
            context: {},
            operationHistory: [],
            options: {}
          }
        },
        timestamp: new Date().toISOString()
      });

      const newManager = StateManager.fromJSON(jsonData);

      expect(newManager.applicationState.version).toBe('1.5.0');
      expect(newManager.applicationState.environment).toBe('test');
      expect(newManager.applicationState.getSetting('fromJson')).toBe(true);
      expect(newManager.getSession('json-restored')).toBeDefined();
    });

    it('從無效 JSON 恢復應該拋出錯誤', () => {
      const invalidJson = '{ invalid json }';

      expect(() => {
        StateManager.fromJSON(invalidJson);
      }).toThrowError();
    });
  });

  describe('事件通知', () => {
    it('應該在會話建立時發出事件', () => {
      const mockListener = vi.fn();
      stateManager.on('sessionCreated', mockListener);

      const session = stateManager.createSession('event-test-session');

      expect(mockListener).toHaveBeenCalledWith({
        type: 'sessionCreated',
        sessionId: 'event-test-session',
        session
      });
    });

    it('應該在會話移除時發出事件', () => {
      const mockListener = vi.fn();
      stateManager.on('sessionRemoved', mockListener);

      stateManager.createSession('remove-event-test');
      const removedSession = stateManager.removeSession('remove-event-test');

      expect(mockListener).toHaveBeenCalledWith({
        type: 'sessionRemoved',
        sessionId: 'remove-event-test',
        session: removedSession
      });
    });

    it('應該在應用程式狀態更新時發出事件', () => {
      const mockListener = vi.fn();
      stateManager.on('applicationStateUpdated', mockListener);

      const oldState = stateManager.applicationState;
      stateManager.updateApplicationState(state => state.markInitialized());

      expect(mockListener).toHaveBeenCalledWith({
        type: 'applicationStateUpdated',
        oldState,
        newState: stateManager.applicationState
      });
    });

    it('應該能移除事件監聽器', () => {
      const mockListener = vi.fn();
      stateManager.on('sessionCreated', mockListener);
      stateManager.off('sessionCreated', mockListener);

      stateManager.createSession('no-event-test');

      expect(mockListener).not.toHaveBeenCalled();
    });

    it('應該能移除所有事件監聽器', () => {
      const mockListener1 = vi.fn();
      const mockListener2 = vi.fn();
      stateManager.on('sessionCreated', mockListener1);
      stateManager.on('sessionRemoved', mockListener2);

      stateManager.removeAllListeners();

      stateManager.createSession('clear-events-test');
      stateManager.removeSession('clear-events-test');

      expect(mockListener1).not.toHaveBeenCalled();
      expect(mockListener2).not.toHaveBeenCalled();
    });
  });

  describe('狀態統計', () => {
    it('應該能獲取狀態統計資訊', () => {
      stateManager.createSession('stats-session-1');
      stateManager.createSession('stats-session-2');
      stateManager.updateApplicationState(state =>
        state.updateSettings({ setting1: 'value1', setting2: 'value2' })
          .markInitialized()
      );

      const stats = stateManager.getStats();

      expect(stats).toHaveProperty('totalSessions', 2);
      expect(stats).toHaveProperty('activeSessions', 2);
      expect(stats).toHaveProperty('applicationState');
      expect(stats.applicationState.isInitialized).toBe(true);
      expect(stats.applicationState.settingsCount).toBe(2);
    });

    it('應該能檢查狀態健康度', () => {
      const health = stateManager.checkHealth();

      expect(health).toHaveProperty('isHealthy');
      expect(health).toHaveProperty('issues');
      expect(health.isHealthy).toBe(true);
      expect(health.issues).toEqual([]);
    });

    it('應該能檢測不健康的狀態', () => {
      // 建立過多會話來模擬不健康狀態
      for (let i = 0; i < 1001; i++) {
        stateManager.createSession(`session-${i}`);
      }

      const health = stateManager.checkHealth();

      expect(health.isHealthy).toBe(false);
      expect(health.issues).toContain('Too many active sessions (1001 > 1000)');
    });
  });
});