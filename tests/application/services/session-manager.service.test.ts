/**
 * SessionManager 服務測試
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../../../src/application/services/session-manager.service.js';
import { StateManager } from '../../../src/application/state/state-manager.js';
import { EventBus } from '../../../src/application/events/event-bus.js';
import type { Session, SessionState, OperationHistory } from '../../../src/application/types.js';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let stateManager: StateManager;
  let eventBus: EventBus;

  beforeEach(() => {
    stateManager = new StateManager();
    eventBus = new EventBus();
    sessionManager = new SessionManager(stateManager, eventBus);
  });

  afterEach(() => {
    eventBus.destroy();
  });

  describe('createSession', () => {
    it('應該建立新會話', async () => {
      // Act
      const session = await sessionManager.createSession();

      // Assert
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.startTime).toBeInstanceOf(Date);
      expect(session.lastActivity).toBeInstanceOf(Date);
      expect(session.state).toBeDefined();
      expect(session.state.status).toBe('active');
    });

    it('應該建立帶有用戶 ID 的會話', async () => {
      // Arrange
      const userId = 'user123';

      // Act
      const session = await sessionManager.createSession(userId);

      // Assert
      expect(session.userId).toBe(userId);
      expect(session.state.userId).toBe(userId);
    });

    it('應該生成唯一的會話 ID', async () => {
      // Act
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();

      // Assert
      expect(session1.id).not.toBe(session2.id);
    });

    it('應該發送會話建立事件', async () => {
      // Arrange
      const eventSpy = vi.fn();
      eventBus.subscribe('session-created', eventSpy);

      // Act
      const session = await sessionManager.createSession();

      // Assert - 等待事件處理完成
      await vi.waitFor(() => {
        expect(eventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'session-created',
            payload: expect.objectContaining({
              sessionId: session.id
            })
          })
        );
      }, { timeout: 1000 });
    });
  });

  describe('getSession', () => {
    it('應該返回存在的會話', async () => {
      // Arrange
      const createdSession = await sessionManager.createSession();

      // Act
      const retrievedSession = await sessionManager.getSession(createdSession.id);

      // Assert
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession!.id).toBe(createdSession.id);
    });

    it('應該返回 null 當會話不存在', async () => {
      // Act
      const session = await sessionManager.getSession('non-existent-id');

      // Assert
      expect(session).toBeNull();
    });
  });

  describe('updateSession', () => {
    it('應該更新會話狀態', async () => {
      // Arrange
      const session = await sessionManager.createSession();
      const updates = {
        status: 'inactive' as const,
        context: { workingDirectory: '/test/path' }
      };

      // Act
      await sessionManager.updateSession(session.id, updates);

      // Assert
      const updatedSession = await sessionManager.getSession(session.id);
      expect(updatedSession!.state.status).toBe('inactive');
      expect(updatedSession!.state.context.workingDirectory).toBe('/test/path');
    });

    it('應該拋出錯誤當會話不存在', async () => {
      // Act & Assert
      await expect(
        sessionManager.updateSession('non-existent-id', { status: 'inactive' })
      ).rejects.toThrow('Session not found: non-existent-id');
    });

    it('應該發送會話更新事件', async () => {
      // Arrange
      const session = await sessionManager.createSession();
      const eventSpy = vi.fn();
      eventBus.subscribe('session-updated', eventSpy);

      // Act
      await sessionManager.updateSession(session.id, { status: 'inactive' });

      // Assert
      await new Promise(resolve => setTimeout(resolve, 10)); // 等待事件處理
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'session-updated',
          payload: expect.objectContaining({
            sessionId: session.id
          })
        })
      );
    });
  });

  describe('cleanup', () => {
    it('應該清理過期會話', async () => {
      // Arrange
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();

      // 模擬過期會話 - 直接設定為非活躍且時間過長
      const oldDate = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3小時前
      await sessionManager.updateSession(session1.id, {
        status: 'inactive',
        updatedAt: oldDate
      });

      // Act
      await sessionManager.cleanup();

      // Assert
      const retrievedSession1 = await sessionManager.getSession(session1.id);
      const retrievedSession2 = await sessionManager.getSession(session2.id);

      expect(retrievedSession1).toBeNull();
      expect(retrievedSession2).toBeDefined();
    });

    it('應該清理非活躍會話超過一定時間', async () => {
      // Arrange
      const session = await sessionManager.createSession();

      // 模擬舊的最後活動時間
      const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2小時前
      await sessionManager.updateSession(session.id, {
        status: 'inactive',
        updatedAt: oldDate
      });

      // Act
      await sessionManager.cleanup();

      // Assert
      const retrievedSession = await sessionManager.getSession(session.id);
      expect(retrievedSession).toBeNull();
    });

    it('應該保留活躍會話', async () => {
      // Arrange
      const session = await sessionManager.createSession();

      // Act
      await sessionManager.cleanup();

      // Assert
      const retrievedSession = await sessionManager.getSession(session.id);
      expect(retrievedSession).toBeDefined();
    });
  });

  describe('getHistory', () => {
    it('應該返回會話的操作歷史', async () => {
      // Arrange
      const session = await sessionManager.createSession();
      const operationHistory: OperationHistory = {
        id: 'op1',
        operationType: 'rename',
        timestamp: new Date(),
        parameters: { oldName: 'old', newName: 'new' },
        result: { success: true }
      };

      // 使用正確的格式更新操作歷史
      const sessionState = stateManager.getSession(session.id);
      const updatedState = sessionState!.addOperation({
        id: operationHistory.id,
        type: operationHistory.operationType as any,
        timestamp: operationHistory.timestamp,
        description: `${operationHistory.operationType} operation`,
        metadata: {
          parameters: operationHistory.parameters,
          result: operationHistory.result
        }
      });
      stateManager.updateSession(session.id, () => updatedState);

      // Act
      const history = await sessionManager.getHistory(session.id);

      // Assert
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(expect.objectContaining({
        id: operationHistory.id,
        operationType: operationHistory.operationType,
        timestamp: operationHistory.timestamp,
        parameters: operationHistory.parameters,
        result: operationHistory.result
      }));
    });

    it('應該返回空陣列當會話沒有歷史', async () => {
      // Arrange
      const session = await sessionManager.createSession();

      // Act
      const history = await sessionManager.getHistory(session.id);

      // Assert
      expect(history).toEqual([]);
    });

    it('應該拋出錯誤當會話不存在', async () => {
      // Act & Assert
      await expect(
        sessionManager.getHistory('non-existent-id')
      ).rejects.toThrow('Session not found: non-existent-id');
    });
  });

  describe('並發會話隔離', () => {
    it('應該支援多個並發會話', async () => {
      // Arrange & Act
      const sessions = await Promise.all([
        sessionManager.createSession('user1'),
        sessionManager.createSession('user2'),
        sessionManager.createSession('user3')
      ]);

      // Assert
      expect(sessions).toHaveLength(3);
      expect(new Set(sessions.map(s => s.id)).size).toBe(3); // 所有 ID 都是唯一的
      expect(sessions[0].userId).toBe('user1');
      expect(sessions[1].userId).toBe('user2');
      expect(sessions[2].userId).toBe('user3');
    });

    it('應該獨立管理每個會話的狀態', async () => {
      // Arrange
      const session1 = await sessionManager.createSession('user1');
      const session2 = await sessionManager.createSession('user2');

      // Act
      await sessionManager.updateSession(session1.id, {
        context: { workingDirectory: '/path1' }
      });
      await sessionManager.updateSession(session2.id, {
        context: { workingDirectory: '/path2' }
      });

      // Assert
      const retrievedSession1 = await sessionManager.getSession(session1.id);
      const retrievedSession2 = await sessionManager.getSession(session2.id);

      expect(retrievedSession1!.state.context.workingDirectory).toBe('/path1');
      expect(retrievedSession2!.state.context.workingDirectory).toBe('/path2');
    });
  });

  describe('錯誤處理', () => {
    it('應該處理狀態管理器錯誤', async () => {
      // Arrange
      const errorStateManager = {
        createSession: vi.fn().mockRejectedValue(new Error('State manager error')),
        getSession: vi.fn(),
        updateSession: vi.fn()
      } as any;

      const errorSessionManager = new SessionManager(errorStateManager, eventBus);

      // Act & Assert
      await expect(errorSessionManager.createSession()).rejects.toThrow('Failed to create session');
    });

    it('應該處理事件發送錯誤', async () => {
      // Arrange
      const errorEventBus = {
        emit: vi.fn().mockRejectedValue(new Error('Event bus error')),
        subscribe: vi.fn(),
        destroy: vi.fn()
      } as any;

      const errorSessionManager = new SessionManager(stateManager, errorEventBus);

      // Act - 應該不會拋出錯誤，而是靜默處理
      const session = await errorSessionManager.createSession();

      // Assert
      expect(session).toBeDefined();
    });
  });
});