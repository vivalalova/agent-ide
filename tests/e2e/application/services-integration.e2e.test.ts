/**
 * Application Services 整合 E2E 測試
 * 測試 EventBus、WorkflowEngine、SessionManager 等的整合場景
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { EventBus } from '../../../src/application/events/event-bus.js';
import { EventPriority } from '../../../src/application/events/event-types.js';
import { WorkflowEngineService } from '../../../src/application/services/workflow-engine.service.js';
import { SessionManager } from '../../../src/application/services/session-manager.service.js';
import { ModuleCoordinatorService } from '../../../src/application/services/module-coordinator.service.js';
import { StateManager } from '../../../src/application/state/state-manager.js';
import { ErrorHandlerService } from '../../../src/application/services/error-handler.service.js';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';

// 確保 e2e 測試不受其他測試的 mock 影響
beforeAll(() => {
  vi.unmock('fs/promises');
  vi.unmock('fs');
  vi.unmock('glob');
});

describe('Application Services 整合 E2E 測試', () => {
  let project: TestProject;
  let eventBus: EventBus;
  let workflowEngine: WorkflowEngineService;
  let sessionManager: SessionManager;
  let stateManager: StateManager;
  let errorHandler: ErrorHandlerService;

  beforeEach(async () => {
    // 建立測試專案
    project = await createTypeScriptProject({
      'src/user.ts': `
export class UserService {
  getUser(id: string) {
    return { id, name: 'Test User' };
  }
}
      `.trim(),
      'src/order.ts': `
import { UserService } from './user';

export class OrderService {
  constructor(private userService: UserService) {}

  createOrder(userId: string) {
    const user = this.userService.getUser(userId);
    return { user, items: [] };
  }
}
      `.trim()
    });

    // 初始化服務
    eventBus = new EventBus();
    stateManager = new StateManager();
    errorHandler = new ErrorHandlerService(eventBus);
    sessionManager = new SessionManager(stateManager, eventBus);
    workflowEngine = new WorkflowEngineService(eventBus, errorHandler, stateManager);
  });

  afterEach(async () => {
    await project.cleanup();
  });

  describe('EventBus 整合場景', () => {
    it('應該能在索引完成後觸發事件', async () => {
      let eventReceived = false;

      // 訂閱事件
      eventBus.subscribe('index:completed', () => {
        eventReceived = true;
      });

      // 發送事件
      await eventBus.emit({
        type: 'index:completed',
        payload: {
          path: project.projectPath,
          fileCount: 2
        },
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      });

      expect(eventReceived).toBe(true);
    });

    it('應該能在重新命名時觸發多個事件', async () => {
      const events: string[] = [];

      eventBus.subscribe('rename:started', () => events.push('started'));
      eventBus.subscribe('rename:analyzing', () => events.push('analyzing'));
      eventBus.subscribe('rename:completed', () => events.push('completed'));

      // 模擬重新命名流程
      await eventBus.emit({
        type: 'rename:started',
        payload: {},
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      });
      await eventBus.emit({
        type: 'rename:analyzing',
        payload: {},
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      });
      await eventBus.emit({
        type: 'rename:completed',
        payload: {},
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      });

      expect(events).toEqual(['started', 'analyzing', 'completed']);
    });

    it('應該能處理事件錯誤', async () => {
      let errorCaught = false;

      eventBus.subscribe('test:error', () => {
        throw new Error('Test error');
      });

      eventBus.onError(() => {
        errorCaught = true;
      });

      try {
        await eventBus.emit({
          type: 'test:error',
          payload: {},
          timestamp: new Date(),
          priority: EventPriority.NORMAL
        });
      } catch {
        errorCaught = true;
      }

      expect(errorCaught).toBe(true);
    });
  });

  describe.skip('WorkflowEngine 整合場景', () => {
    it.skip('應該能執行簡單工作流程', async () => {
      const workflow = {
        id: 'test-workflow',
        name: 'Test Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: async () => ({ success: true, data: { step: 1 } })
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: async () => ({ success: true, data: { step: 2 } })
          }
        ]
      };

      const result = await workflowEngine.execute(workflow);

      expect(result.success).toBe(true);
    });

    it.skip('應該能在步驟失敗時停止工作流程', async () => {
      const workflow = {
        id: 'fail-workflow',
        name: 'Fail Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: async () => ({ success: true, data: {} })
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: async () => {
              throw new Error('Step failed');
            }
          },
          {
            id: 'step3',
            name: 'Step 3',
            execute: async () => ({ success: true, data: {} })
          }
        ]
      };

      try {
        const result = await workflowEngine.execute(workflow);
        expect(result.success).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it.skip('應該能追蹤工作流程狀態', async () => {
      const workflow = {
        id: 'status-workflow',
        name: 'Status Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: async () => ({ success: true, data: {} })
          }
        ]
      };

      const resultPromise = workflowEngine.execute(workflow);
      const status = workflowEngine.getWorkflowStatus(workflow.id);

      expect(status).toBeDefined();

      await resultPromise;
    });
  });

  describe.skip('SessionManager 整合場景', () => {
    it.skip('應該能建立和管理會話', () => {
      const session = sessionManager.createSession();

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();

      const retrieved = sessionManager.getSession(session.id);
      expect(retrieved).toBeDefined();
    });

    it.skip('應該能清除會話', () => {
      const session = sessionManager.createSession();

      sessionManager.destroySession(session.id);

      const retrieved = sessionManager.getSession(session.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe.skip('ModuleCoordinator 整合場景', () => {
    it.skip('應該能初始化協調器', () => {
      const coordinator = new ModuleCoordinatorService(eventBus, stateManager, errorHandler);

      expect(coordinator).toBeDefined();
    });

    it.skip('應該能處理模組狀態變更事件', async () => {
      const coordinator = new ModuleCoordinatorService(eventBus, stateManager, errorHandler);
      let eventReceived = false;

      eventBus.subscribe('module:status:changed', () => {
        eventReceived = true;
      });

      // 發送狀態變更事件
      await eventBus.emit({
        type: 'module:status:changed',
        payload: {
          moduleName: 'indexing',
          status: 'ready'
        },
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      });

      expect(eventReceived).toBe(true);
    });
  });

  describe.skip('跨服務整合場景', () => {
    it.skip('完整流程：建立會話 → 執行工作流程 → 發送事件', async () => {
      // 1. 建立會話
      const session = sessionManager.createSession();
      expect(session).toBeDefined();

      // 2. 記錄事件
      const events: string[] = [];
      eventBus.subscribe('workflow:started', () => events.push('started'));
      eventBus.subscribe('workflow:completed', () => events.push('completed'));

      // 3. 執行工作流程
      const workflow = {
        id: 'integration-test',
        name: 'Integration Test',
        steps: [
          {
            id: 'step1',
            name: 'Index',
            execute: async () => {
              await eventBus.emit({
                type: 'workflow:started',
                payload: {},
                timestamp: new Date(),
                priority: EventPriority.NORMAL
              });
              return { success: true, data: {} };
            }
          },
          {
            id: 'step2',
            name: 'Search',
            execute: async () => {
              await eventBus.emit({
                type: 'workflow:completed',
                payload: {},
                timestamp: new Date(),
                priority: EventPriority.NORMAL
              });
              return { success: true, data: {} };
            }
          }
        ]
      };

      const result = await workflowEngine.execute(workflow);

      // 4. 驗證結果
      expect(result.success).toBe(true);
      expect(events.length).toBeGreaterThan(0);

      // 5. 清理會話
      sessionManager.destroySession(session.id);
    });
  });
});
