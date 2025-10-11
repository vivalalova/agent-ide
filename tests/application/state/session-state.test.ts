import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState } from '../../../src/application/state/session-state.js';

describe('SessionState', () => {
  let sessionState: SessionState;
  const sessionId = 'test-session-123';

  beforeEach(() => {
    sessionState = new SessionState(sessionId);
  });

  describe('初始化', () => {
    it('應該能建立新的 SessionState 實例', () => {
      expect(sessionState).toBeDefined();
      expect(sessionState.sessionId).toBe(sessionId);
    });

    it('應該有正確的初始狀態', () => {
      expect(sessionState.isActive).toBe(true);
      expect(sessionState.createdAt).toBeInstanceOf(Date);
      expect(sessionState.lastAccessedAt).toBeInstanceOf(Date);
      expect(sessionState.operationHistory).toEqual([]);
      expect(sessionState.context).toEqual({});
    });

    it('建立時應該自動設定 userId（如果提供）', () => {
      const userId = 'user-456';
      const stateWithUser = new SessionState(sessionId, userId);
      expect(stateWithUser.userId).toBe(userId);
    });
  });

  describe('狀態更新', () => {
    it('應該能更新會話上下文', () => {
      const newContext = { workingDirectory: '/path/to/project', currentFile: 'index.ts' };
      const updatedState = sessionState.updateContext(newContext);

      expect(updatedState).not.toBe(sessionState); // 確保是不可變更新
      expect(updatedState.context).toEqual(newContext);
      expect(updatedState.sessionId).toBe(sessionId);
    });

    it('應該能部分更新上下文', () => {
      const initialContext = { workingDirectory: '/initial/path', currentFile: 'test.ts' };
      const stateWithContext = sessionState.updateContext(initialContext);

      const partialUpdate = { currentFile: 'updated.ts' };
      const updatedState = stateWithContext.updateContext(partialUpdate);

      expect(updatedState.context).toEqual({
        workingDirectory: '/initial/path',
        currentFile: 'updated.ts'
      });
    });

    it('應該能更新最後存取時間', () => {
      const originalTime = sessionState.lastAccessedAt;

      // 直接呼叫 updateLastAccess，確保時間更新
      const updatedState = sessionState.updateLastAccess();

      // 允許時間相同或更新（因為可能在同一毫秒內執行）
      expect(updatedState.lastAccessedAt.getTime()).toBeGreaterThanOrEqual(originalTime.getTime());
      expect(updatedState).not.toBe(sessionState);
    });

    it('應該能停用會話', () => {
      const deactivatedState = sessionState.deactivate();

      expect(deactivatedState.isActive).toBe(false);
      expect(deactivatedState).not.toBe(sessionState);
    });

    it('應該能重新啟用會話', () => {
      const deactivatedState = sessionState.deactivate();
      const reactivatedState = deactivatedState.activate();

      expect(reactivatedState.isActive).toBe(true);
      expect(reactivatedState).not.toBe(deactivatedState);
    });
  });

  describe('操作歷史管理', () => {
    it('應該能添加操作記錄', () => {
      const operation = {
        id: 'op-1',
        type: 'rename' as const,
        timestamp: new Date(),
        description: '重新命名變數 oldName 為 newName',
        metadata: { oldName: 'oldVar', newName: 'newVar' }
      };

      const updatedState = sessionState.addOperation(operation);

      expect(updatedState.operationHistory).toHaveLength(1);
      expect(updatedState.operationHistory[0]).toEqual(operation);
      expect(updatedState).not.toBe(sessionState);
    });

    it('應該能批次添加多個操作記錄', () => {
      const operations = [
        {
          id: 'op-1',
          type: 'rename' as const,
          timestamp: new Date(),
          description: '操作 1',
          metadata: {}
        },
        {
          id: 'op-2',
          type: 'move' as const,
          timestamp: new Date(),
          description: '操作 2',
          metadata: {}
        }
      ];

      const updatedState = sessionState.addOperations(operations);

      expect(updatedState.operationHistory).toHaveLength(2);
      expect(updatedState.operationHistory).toEqual(operations);
    });

    it('應該能限制歷史記錄數量', () => {
      const maxHistory = 3;
      let state = new SessionState(sessionId, undefined, { maxHistorySize: maxHistory });

      // 添加超過限制的操作
      for (let i = 1; i <= 5; i++) {
        const operation = {
          id: `op-${i}`,
          type: 'rename' as const,
          timestamp: new Date(),
          description: `操作 ${i}`,
          metadata: {}
        };
        state = state.addOperation(operation);
      }

      expect(state.operationHistory).toHaveLength(maxHistory);
      // 應該保留最新的 3 個操作
      expect(state.operationHistory[0].id).toBe('op-3');
      expect(state.operationHistory[1].id).toBe('op-4');
      expect(state.operationHistory[2].id).toBe('op-5');
    });

    it('應該能清空操作歷史', () => {
      const operation = {
        id: 'op-1',
        type: 'rename' as const,
        timestamp: new Date(),
        description: '測試操作',
        metadata: {}
      };

      const stateWithHistory = sessionState.addOperation(operation);
      const clearedState = stateWithHistory.clearHistory();

      expect(clearedState.operationHistory).toEqual([]);
      expect(clearedState).not.toBe(stateWithHistory);
    });
  });

  describe('狀態查詢', () => {
    it('應該能檢查會話是否已過期', () => {
      const timeoutMs = 1000; // 1秒
      const stateWithTimeout = new SessionState(sessionId, undefined, { timeoutMs });

      expect(stateWithTimeout.isExpired()).toBe(false);

      // 模擬過期情況（創建一個很舊的狀態）
      const oldTimestamp = new Date(Date.now() - 2000); // 2秒前
      const expiredState = Object.assign(Object.create(Object.getPrototypeOf(stateWithTimeout)), {
        ...stateWithTimeout,
        lastAccessedAt: oldTimestamp
      });

      expect(expiredState.isExpired()).toBe(true);
    });

    it('應該能獲取會話持續時間', () => {
      const duration = sessionState.getDuration();
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(typeof duration).toBe('number');
    });

    it('應該能序列化狀態', () => {
      const context = { workingDirectory: '/test', currentFile: 'test.ts' };
      const operation = {
        id: 'op-1',
        type: 'rename' as const,
        timestamp: new Date(),
        description: '測試操作',
        metadata: {}
      };

      const stateWithData = sessionState
        .updateContext(context)
        .addOperation(operation);

      const serialized = stateWithData.toJSON();

      expect(serialized).toHaveProperty('sessionId', sessionId);
      expect(serialized).toHaveProperty('isActive', true);
      expect(serialized).toHaveProperty('context', context);
      expect(serialized).toHaveProperty('operationHistory');
      expect(serialized.operationHistory).toHaveLength(1);
    });
  });

  describe('狀態持久化', () => {
    it('應該能從 JSON 恢復狀態', () => {
      const serializedData = {
        sessionId: 'restored-session',
        userId: 'user-123',
        isActive: false,
        createdAt: new Date('2023-01-01'),
        lastAccessedAt: new Date('2023-01-02'),
        context: { workingDirectory: '/restored' },
        operationHistory: [{
          id: 'op-restored',
          type: 'move' as const,
          timestamp: new Date('2023-01-01'),
          description: '恢復的操作',
          metadata: {}
        }],
        options: { maxHistorySize: 100, timeoutMs: 30000 }
      };

      const restoredState = SessionState.fromJSON(serializedData);

      expect(restoredState.sessionId).toBe('restored-session');
      expect(restoredState.userId).toBe('user-123');
      expect(restoredState.isActive).toBe(false);
      expect(restoredState.context).toEqual({ workingDirectory: '/restored' });
      expect(restoredState.operationHistory).toHaveLength(1);
    });

    it('從 JSON 恢復時應該處理缺少的欄位', () => {
      const minimalData = {
        sessionId: 'minimal-session'
      };

      const restoredState = SessionState.fromJSON(minimalData);

      expect(restoredState.sessionId).toBe('minimal-session');
      expect(restoredState.isActive).toBe(true);
      expect(restoredState.context).toEqual({});
      expect(restoredState.operationHistory).toEqual([]);
    });
  });

  describe('時間旅行除錯支援', () => {
    it('應該能回到指定的操作狀態', () => {
      let state = sessionState;

      // 添加幾個操作
      const operations = [
        { id: 'op-1', type: 'rename' as const, timestamp: new Date(), description: '操作1', metadata: { step: 1 } },
        { id: 'op-2', type: 'move' as const, timestamp: new Date(), description: '操作2', metadata: { step: 2 } },
        { id: 'op-3', type: 'refactor' as const, timestamp: new Date(), description: '操作3', metadata: { step: 3 } }
      ];

      operations.forEach(op => {
        state = state.addOperation(op);
      });

      // 回到操作 2 的狀態
      const revertedState = state.revertToOperation('op-2');

      expect(revertedState.operationHistory).toHaveLength(2);
      expect(revertedState.operationHistory[1].id).toBe('op-2');
    });

    it('回到不存在的操作應該回傳原始狀態', () => {
      const operation = {
        id: 'op-1',
        type: 'rename' as const,
        timestamp: new Date(),
        description: '測試操作',
        metadata: {}
      };

      const stateWithHistory = sessionState.addOperation(operation);
      const revertedState = stateWithHistory.revertToOperation('non-existent');

      expect(revertedState).toBe(stateWithHistory);
    });

    it('應該能獲取特定時間點的狀態快照', () => {
      let state = sessionState;
      const targetTime = new Date();

      const operation1 = {
        id: 'op-1',
        type: 'rename' as const,
        timestamp: new Date(targetTime.getTime() - 1000),
        description: '早期操作',
        metadata: {}
      };

      const operation2 = {
        id: 'op-2',
        type: 'move' as const,
        timestamp: new Date(targetTime.getTime() + 1000),
        description: '晚期操作',
        metadata: {}
      };

      state = state.addOperation(operation1).addOperation(operation2);

      const snapshot = state.getSnapshotAtTime(targetTime);

      expect(snapshot.operationHistory).toHaveLength(1);
      expect(snapshot.operationHistory[0].id).toBe('op-1');
    });
  });
});