/**
 * StateManager 測試
 * 測試狀態管理器的所有功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StateManager,
  type StateSnapshot,
  type StateEvent,
} from '@application/state/state-manager.js';
import { ApplicationState } from '@application/state/application-state.js';
import { SessionState } from '@application/state/session-state.js';

// ============================================================================
// StateManager Tests
// ============================================================================

describe('StateManager', () => {
  let manager: StateManager;
  let initialState: ApplicationState;

  beforeEach(() => {
    initialState = new ApplicationState();
    manager = new StateManager(initialState);
  });

  describe('constructor', () => {
    it('應該建立新的 StateManager 實例', () => {
      expect(manager).toBeDefined();
      expect(manager.applicationState).toBe(initialState);
      expect(manager.activeSessions).toEqual({});
    });
  });

  describe('fromJSON', () => {
    it('應該從 JSON 字串建立 StateManager', () => {
      const snapshot: StateSnapshot = {
        applicationState: new ApplicationState().toJSON(),
        sessions: {
          'session-1': new SessionState('session-1').toJSON(),
        },
        timestamp: new Date(),
      };

      const restored = StateManager.fromJSON(JSON.stringify(snapshot));

      expect(restored).toBeDefined();
      expect(restored.activeSessions['session-1']).toBeDefined();
    });

    it('應該正確恢復多個會話', () => {
      const snapshot: StateSnapshot = {
        applicationState: new ApplicationState().toJSON(),
        sessions: {
          'session-1': new SessionState('session-1', 'user-1').toJSON(),
          'session-2': new SessionState('session-2', 'user-2').toJSON(),
        },
        timestamp: new Date(),
      };

      const restored = StateManager.fromJSON(JSON.stringify(snapshot));

      expect(Object.keys(restored.activeSessions)).toHaveLength(2);
      expect(restored.activeSessions['session-1'].userId).toBe('user-1');
      expect(restored.activeSessions['session-2'].userId).toBe('user-2');
    });
  });

  describe('applicationState getter', () => {
    it('應該回傳應用程式狀態', () => {
      expect(manager.applicationState).toBe(initialState);
    });
  });

  describe('activeSessions getter', () => {
    it('應該回傳活躍會話的副本', () => {
      manager.createSession('session-1');
      const sessions = manager.activeSessions;

      expect(sessions['session-1']).toBeDefined();

      // 修改副本不應影響原始資料
      delete sessions['session-1'];
      expect(manager.activeSessions['session-1']).toBeDefined();
    });
  });

  describe('createSession', () => {
    it('應該建立新會話', () => {
      const session = manager.createSession('session-1');

      expect(session.sessionId).toBe('session-1');
      expect(manager.activeSessions['session-1']).toBeDefined();
    });

    it('應該建立帶有 userId 的會話', () => {
      const session = manager.createSession('session-1', 'user-123');

      expect(session.userId).toBe('user-123');
    });

    it('應該拋出錯誤當會話已存在', () => {
      manager.createSession('session-1');

      expect(() => manager.createSession('session-1')).toThrow(
        'Session with ID session-1 already exists'
      );
    });

    it('應該觸發 sessionCreated 事件', () => {
      const handler = vi.fn();
      manager.on('sessionCreated', handler);

      manager.createSession('session-1');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sessionCreated',
          sessionId: 'session-1',
        })
      );
    });
  });

  describe('getSession', () => {
    it('應該取得存在的會話', () => {
      manager.createSession('session-1');

      const session = manager.getSession('session-1');

      expect(session).toBeDefined();
      expect(session?.sessionId).toBe('session-1');
    });

    it('應該回傳 undefined 當會話不存在', () => {
      const session = manager.getSession('nonexistent');

      expect(session).toBeUndefined();
    });
  });

  describe('updateSession', () => {
    it('應該更新會話狀態', () => {
      manager.createSession('session-1');

      const updated = manager.updateSession('session-1', session =>
        session.updateContext({ workingDirectory: '/project' })
      );

      expect(updated.context.workingDirectory).toBe('/project');
      expect(manager.getSession('session-1')?.context.workingDirectory).toBe('/project');
    });

    it('應該拋出錯誤當會話不存在', () => {
      expect(() =>
        manager.updateSession('nonexistent', session => session)
      ).toThrow('Session with ID nonexistent not found');
    });

    it('應該觸發 sessionUpdated 事件', () => {
      manager.createSession('session-1');
      const handler = vi.fn();
      manager.on('sessionUpdated', handler);

      manager.updateSession('session-1', session =>
        session.updateContext({ key: 'value' })
      );

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sessionUpdated',
          sessionId: 'session-1',
        })
      );
    });
  });

  describe('removeSession', () => {
    it('應該移除會話', () => {
      manager.createSession('session-1');

      const removed = manager.removeSession('session-1');

      expect(removed?.sessionId).toBe('session-1');
      expect(manager.getSession('session-1')).toBeUndefined();
    });

    it('應該回傳 undefined 當會話不存在', () => {
      const removed = manager.removeSession('nonexistent');

      expect(removed).toBeUndefined();
    });

    it('應該觸發 sessionRemoved 事件', () => {
      manager.createSession('session-1');
      const handler = vi.fn();
      manager.on('sessionRemoved', handler);

      manager.removeSession('session-1');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sessionRemoved',
          sessionId: 'session-1',
        })
      );
    });
  });

  describe('listActiveSessions', () => {
    it('應該列出所有活躍會話', () => {
      manager.createSession('session-1');
      manager.createSession('session-2');
      manager.createSession('session-3');

      const sessions = manager.listActiveSessions();

      expect(sessions).toHaveLength(3);
    });

    it('應該回傳空陣列當沒有會話', () => {
      const sessions = manager.listActiveSessions();

      expect(sessions).toEqual([]);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('應該清理過期會話', () => {
      // 建立一個過期的會話
      const expiredSession = SessionState.fromJSON({
        sessionId: 'expired-session',
        isActive: true,
        lastAccessedAt: new Date(Date.now() - 60000),
        options: { timeoutMs: 1000 },
      });

      // 手動加入過期會話
      (manager as unknown as { _activeSessions: Record<string, SessionState> })._activeSessions['expired-session'] = expiredSession;

      // 建立一個正常會話
      manager.createSession('active-session');

      const cleanedCount = manager.cleanupExpiredSessions();

      expect(cleanedCount).toBe(1);
      expect(manager.getSession('expired-session')).toBeUndefined();
      expect(manager.getSession('active-session')).toBeDefined();
    });

    it('應該回傳 0 當沒有過期會話', () => {
      manager.createSession('session-1');
      manager.createSession('session-2');

      const cleanedCount = manager.cleanupExpiredSessions();

      expect(cleanedCount).toBe(0);
    });
  });

  describe('updateApplicationState', () => {
    it('應該更新應用程式狀態', () => {
      const updated = manager.updateApplicationState(state =>
        state.markInitialized()
      );

      expect(updated.isInitialized).toBe(true);
      expect(manager.applicationState.isInitialized).toBe(true);
    });

    it('應該觸發 applicationStateUpdated 事件', () => {
      const handler = vi.fn();
      manager.on('applicationStateUpdated', handler);

      manager.updateApplicationState(state => state.markInitialized());

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'applicationStateUpdated',
        })
      );
    });

    it('事件應該包含舊狀態和新狀態', () => {
      const handler = vi.fn();
      manager.on('applicationStateUpdated', handler);

      manager.updateApplicationState(state => state.markInitialized());

      const event = handler.mock.calls[0][0] as StateEvent;
      expect(event.oldState?.isInitialized).toBe(false);
      expect(event.newState?.isInitialized).toBe(true);
    });
  });

  describe('createSnapshot', () => {
    it('應該建立狀態快照', () => {
      manager.createSession('session-1');
      manager.updateApplicationState(state =>
        state.updateSettings({ theme: 'dark' })
      );

      const snapshot = manager.createSnapshot();

      expect(snapshot.applicationState).toBeDefined();
      expect(snapshot.sessions['session-1']).toBeDefined();
      expect(snapshot.timestamp).toBeInstanceOf(Date);
    });

    it('應該序列化所有會話', () => {
      manager.createSession('session-1', 'user-1');
      manager.createSession('session-2', 'user-2');

      const snapshot = manager.createSnapshot();

      expect(Object.keys(snapshot.sessions)).toHaveLength(2);
      expect(snapshot.sessions['session-1'].userId).toBe('user-1');
    });
  });

  describe('restoreFromSnapshot', () => {
    it('應該從快照恢復狀態', () => {
      manager.createSession('session-1');
      manager.updateApplicationState(state =>
        state.updateSettings({ theme: 'dark' })
      );

      const snapshot = manager.createSnapshot();

      // 建立新的 manager 並清空
      manager = new StateManager(new ApplicationState());

      manager.restoreFromSnapshot(snapshot);

      expect(manager.applicationState.globalSettings.theme).toBe('dark');
      expect(manager.getSession('session-1')).toBeDefined();
    });

    it('應該清空現有會話後恢復', () => {
      manager.createSession('session-old');

      const snapshot: StateSnapshot = {
        applicationState: new ApplicationState().toJSON(),
        sessions: {
          'session-new': new SessionState('session-new').toJSON(),
        },
        timestamp: new Date(),
      };

      manager.restoreFromSnapshot(snapshot);

      expect(manager.getSession('session-old')).toBeUndefined();
      expect(manager.getSession('session-new')).toBeDefined();
    });
  });

  describe('toJSON', () => {
    it('應該序列化為 JSON', () => {
      manager.createSession('session-1');

      const json = manager.toJSON();

      expect(json.applicationState).toBeDefined();
      expect(json.sessions['session-1']).toBeDefined();
      expect(json.timestamp).toBeInstanceOf(Date);
    });

    it('toJSON 應該等同於 createSnapshot', () => {
      manager.createSession('session-1');

      const json = manager.toJSON();
      const snapshot = manager.createSnapshot();

      expect(json.applicationState).toEqual(snapshot.applicationState);
      expect(Object.keys(json.sessions)).toEqual(Object.keys(snapshot.sessions));
    });
  });

  describe('getStats', () => {
    it('應該取得統計資訊', () => {
      manager.createSession('session-1');
      manager.createSession('session-2');
      manager.updateSession('session-1', s => s.deactivate());

      const stats = manager.getStats();

      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(1);
      expect(stats.applicationState).toBeDefined();
    });

    it('應該包含應用程式狀態摘要', () => {
      manager.updateApplicationState(state =>
        state.updateVersion('2.0.0').setEnvironment('production')
      );

      const stats = manager.getStats();

      expect(stats.applicationState.version).toBe('2.0.0');
      expect(stats.applicationState.environment).toBe('production');
    });
  });

  describe('checkHealth', () => {
    it('應該回傳健康狀態', () => {
      const health = manager.checkHealth();

      expect(health.isHealthy).toBe(true);
      expect(health.issues).toEqual([]);
      expect(health.stats).toBeDefined();
    });

    it('應該檢測過期會話問題', () => {
      const expiredSession = SessionState.fromJSON({
        sessionId: 'expired',
        isActive: true,
        lastAccessedAt: new Date(Date.now() - 60000),
        options: { timeoutMs: 1000 },
      });

      (manager as unknown as { _activeSessions: Record<string, SessionState> })._activeSessions['expired'] = expiredSession;

      const health = manager.checkHealth();

      expect(health.issues.some(i => i.includes('expired'))).toBe(true);
    });

    it('應該檢測無效的應用程式狀態', () => {
      // 建立無效狀態
      const invalidState = Object.assign(
        Object.create(Object.getPrototypeOf(initialState)),
        {
          ...initialState,
          version: '',
        }
      );

      (manager as unknown as { _applicationState: ApplicationState })._applicationState = invalidState;

      const health = manager.checkHealth();

      expect(health.isHealthy).toBe(false);
      expect(health.issues.some(i => i.includes('invalid'))).toBe(true);
    });

    it('應該檢測會話數量過多', () => {
      // 模擬大量會話
      for (let i = 0; i < 1001; i++) {
        (manager as unknown as { _activeSessions: Record<string, SessionState> })._activeSessions[`session-${i}`] = new SessionState(`session-${i}`);
      }

      const health = manager.checkHealth();

      expect(health.issues.some(i => i.includes('Too many'))).toBe(true);
    });
  });

  describe('event listeners', () => {
    it('應該支援 on 方法', () => {
      const handler = vi.fn();
      manager.on('sessionCreated', handler);

      manager.createSession('session-1');

      expect(handler).toHaveBeenCalled();
    });

    it('應該支援 off 方法', () => {
      const handler = vi.fn();
      manager.on('sessionCreated', handler);
      manager.off('sessionCreated', handler);

      manager.createSession('session-1');

      expect(handler).not.toHaveBeenCalled();
    });

    it('應該支援多個監聽器', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      manager.on('sessionCreated', handler1);
      manager.on('sessionCreated', handler2);

      manager.createSession('session-1');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('memory estimation', () => {
    it('checkHealth 應該估算記憶體使用量', () => {
      // 加入一些資料增加記憶體使用
      for (let i = 0; i < 10; i++) {
        manager.createSession(`session-${i}`, `user-${i}`);
      }

      const health = manager.checkHealth();

      // 記憶體使用量應該在合理範圍內
      expect(health.isHealthy).toBe(true);
    });
  });

  describe('complex workflows', () => {
    it('應該處理完整的會話生命週期', () => {
      // 建立會話
      manager.createSession('session-1', 'user-1');

      // 更新會話
      manager.updateSession('session-1', session =>
        session.updateContext({ workingDirectory: '/project' })
          .addOperation({
            id: 'op-1',
            type: 'search',
            timestamp: new Date(),
            description: 'Search operation',
            metadata: {},
          })
      );

      // 建立快照
      const snapshot = manager.createSnapshot();

      // 從快照恢復
      manager.restoreFromSnapshot(snapshot);

      // 驗證
      const session = manager.getSession('session-1');
      expect(session?.context.workingDirectory).toBe('/project');
      expect(session?.operationHistory).toHaveLength(1);
    });

    it('應該處理多個會話的並行更新', () => {
      manager.createSession('session-1');
      manager.createSession('session-2');
      manager.createSession('session-3');

      manager.updateSession('session-1', s => s.updateContext({ key: '1' }));
      manager.updateSession('session-2', s => s.updateContext({ key: '2' }));
      manager.updateSession('session-3', s => s.updateContext({ key: '3' }));

      expect(manager.getSession('session-1')?.context.key).toBe('1');
      expect(manager.getSession('session-2')?.context.key).toBe('2');
      expect(manager.getSession('session-3')?.context.key).toBe('3');
    });
  });
});
