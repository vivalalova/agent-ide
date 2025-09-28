/**
 * WorkflowEngine 服務測試
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../../src/application/events/event-bus.js';
import { ErrorHandlerService } from '../../../src/application/services/error-handler.service.js';
import { StateManager } from '../../../src/application/state/state-manager.js';
import { WorkflowEngineService } from '../../../src/application/services/workflow-engine.service.js';
import { BaseError } from '../../../src/shared/errors/base-error.js';
import { EventPriority } from '../../../src/application/events/event-types.js';
import {
  WorkflowStatus,
  type Workflow,
  type WorkflowStep,
  type StepResult,
  type WorkflowResult
} from '../../../src/application/types.js';

describe('WorkflowEngineService', () => {
  let eventBus: EventBus;
  let errorHandler: ErrorHandlerService;
  let stateManager: StateManager;
  let workflowEngine: WorkflowEngineService;

  beforeEach(() => {
    eventBus = new EventBus();
    errorHandler = new ErrorHandlerService(eventBus);
    stateManager = new StateManager();
    workflowEngine = new WorkflowEngineService(eventBus, errorHandler, stateManager);
  });

  afterEach(() => {
    eventBus.destroy();
  });

  describe('execute', () => {
    test('應該成功執行簡單工作流程', async () => {
      // Arrange
      const step1: WorkflowStep = {
        id: 'step1',
        name: 'Step 1',
        execute: async (context: any) => ({
          success: true,
          data: { value: (context?.input || 0) + 1 }
        })
      };

      const step2: WorkflowStep = {
        id: 'step2',
        name: 'Step 2',
        execute: async (context: any) => ({
          success: true,
          data: { value: context.value * 2 }
        })
      };

      const workflow: Workflow<{ input: number }> = {
        id: 'test-workflow',
        name: 'Test Workflow',
        steps: [step1, step2],
        context: { input: 5 }
      };

      // Act
      const result = await workflowEngine.execute(workflow);

      // Assert
      expect(result.status).toBe(WorkflowStatus.Completed);
      expect(result.result).toEqual({ value: 12 }); // (5 + 1) * 2 = 12
      expect(result.executedSteps).toEqual(['step1', 'step2']);
      expect(result.error).toBeUndefined();
    });

    test('應該處理步驟執行失敗', async () => {
      // Arrange
      const step1: WorkflowStep = {
        id: 'step1',
        name: 'Success Step',
        execute: async () => ({ success: true, data: 'success' })
      };

      const step2: WorkflowStep = {
        id: 'step2',
        name: 'Failing Step',
        execute: async () => {
          throw new BaseError('STEP_ERROR', 'Step failed');
        }
      };

      const workflow: Workflow = {
        id: 'failing-workflow',
        name: 'Failing Workflow',
        steps: [step1, step2]
      };

      // Act
      const result = await workflowEngine.execute(workflow);

      // Assert
      expect(result.status).toBe(WorkflowStatus.Failed);
      expect(result.executedSteps).toEqual(['step1']);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('STEP_ERROR');
    });

    test('應該支援重試失敗的步驟', async () => {
      // Arrange
      let attemptCount = 0;
      const retryStep: WorkflowStep = {
        id: 'retry-step',
        name: 'Retry Step',
        canRetry: true,
        maxRetries: 2,
        execute: async () => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Temporary failure');
          }
          return { success: true, data: 'success after retry' };
        }
      };

      const workflow: Workflow = {
        id: 'retry-workflow',
        name: 'Retry Workflow',
        steps: [retryStep]
      };

      // Act
      const result = await workflowEngine.execute(workflow);

      // Assert
      expect(result.status).toBe(WorkflowStatus.Completed);
      expect(result.result).toBe('success after retry');
      expect(attemptCount).toBe(3);
    });

    test('應該支援條件性步驟跳轉', async () => {
      // Arrange
      const step1: WorkflowStep = {
        id: 'step1',
        name: 'Decision Step',
        execute: async (context: any) => ({
          success: true,
          data: 'step1 result',
          nextStepId: context?.skipStep2 ? 'step3' : undefined
        })
      };

      const step2: WorkflowStep = {
        id: 'step2',
        name: 'Skipped Step',
        execute: async () => ({ success: true, data: 'step2 result' })
      };

      const step3: WorkflowStep = {
        id: 'step3',
        name: 'Final Step',
        execute: async () => ({ success: true, data: 'step3 result' })
      };

      const workflow: Workflow<{ skipStep2: boolean }> = {
        id: 'conditional-workflow',
        name: 'Conditional Workflow',
        steps: [step1, step2, step3],
        context: { skipStep2: true }
      };

      // Act
      const result = await workflowEngine.execute(workflow);

      // Assert
      expect(result.status).toBe(WorkflowStatus.Completed);
      expect(result.executedSteps).toEqual(['step1', 'step3']);
      expect(result.result).toBe('step3 result');
    });

    test('應該發布工作流程事件', async () => {
      // Arrange
      const events: any[] = [];
      eventBus.subscribe('workflow-event', (event) => {
        events.push(event);
      });

      const step: WorkflowStep = {
        id: 'test-step',
        name: 'Test Step',
        execute: async () => ({ success: true, data: 'done' })
      };

      const workflow: Workflow = {
        id: 'event-workflow',
        name: 'Event Workflow',
        steps: [step]
      };

      // Act
      await workflowEngine.execute(workflow);

      // Assert
      expect(events).toHaveLength(3); // started, step-completed, completed
      expect(events[0].payload.eventType).toBe('started');
      expect(events[1].payload.eventType).toBe('step-completed');
      expect(events[2].payload.eventType).toBe('completed');
    });
  });

  describe('pause', () => {
    test('應該能暫停正在執行的工作流程', async () => {
      // Arrange
      const step1: WorkflowStep = {
        id: 'step1',
        name: 'Step 1',
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 10)); // 小延遲
          return { success: true, data: 'step1 done' };
        }
      };

      const step2: WorkflowStep = {
        id: 'step2',
        name: 'Step 2',
        execute: async () => {
          return { success: true, data: 'step2 done' };
        }
      };

      const workflow: Workflow = {
        id: 'pause-workflow',
        name: 'Pause Workflow',
        steps: [step1, step2]
      };

      // Act
      const executePromise = workflowEngine.execute(workflow);

      // 小延遲後暫停，確保工作流程已開始執行
      await new Promise(resolve => setTimeout(resolve, 5));
      await workflowEngine.pause('pause-workflow');

      const result = await executePromise;

      // Assert
      expect(result.status).toBe(WorkflowStatus.Paused);
      expect(result.executedSteps.length).toBeGreaterThanOrEqual(1);
    });

    test('暫停不存在的工作流程應該拋出錯誤', async () => {
      // Act & Assert
      await expect(workflowEngine.pause('non-existent')).rejects.toThrow('Workflow not found');
    });
  });

  describe('resume', () => {
    test('應該能恢復暫停的工作流程', async () => {
      // Arrange
      const step1: WorkflowStep = {
        id: 'step1',
        name: 'Step 1',
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return { success: true, data: 'step1 done' };
        }
      };

      const step2: WorkflowStep = {
        id: 'step2',
        name: 'Step 2',
        execute: async () => ({ success: true, data: 'step2 done' })
      };

      const workflow: Workflow = {
        id: 'resume-workflow',
        name: 'Resume Workflow',
        steps: [step1, step2]
      };

      // 先執行並暫停
      const executePromise = workflowEngine.execute(workflow);
      await new Promise(resolve => setTimeout(resolve, 5));
      await workflowEngine.pause('resume-workflow');
      const pausedResult = await executePromise;

      // 確保工作流程確實被暫停
      expect(pausedResult.status).toBe(WorkflowStatus.Paused);

      // Act - 恢復執行
      const result = await workflowEngine.resume('resume-workflow');

      // Assert
      expect(result.status).toBe(WorkflowStatus.Completed);
      expect(result.executedSteps).toEqual(['step1', 'step2']);
    });

    test('恢復不存在的工作流程應該拋出錯誤', async () => {
      // Act & Assert
      await expect(workflowEngine.resume('non-existent')).rejects.toThrow('Workflow not found');
    });
  });

  describe('rollback', () => {
    test('應該能回滾到指定步驟', async () => {
      // Arrange
      const rollbackData: any[] = [];

      const step1: WorkflowStep = {
        id: 'step1',
        name: 'Step 1',
        execute: async () => ({ success: true, data: 'step1 done' }),
        rollback: async (context) => {
          rollbackData.push('step1 rollback');
        }
      };

      const step2: WorkflowStep = {
        id: 'step2',
        name: 'Step 2',
        execute: async () => ({ success: true, data: 'step2 done' }),
        rollback: async (context) => {
          rollbackData.push('step2 rollback');
        }
      };

      const workflow: Workflow = {
        id: 'rollback-workflow',
        name: 'Rollback Workflow',
        steps: [step1, step2]
      };

      // 先執行完成
      await workflowEngine.execute(workflow);

      // Act - 回滾到 step1
      await workflowEngine.rollback('rollback-workflow', 'step1');

      // Assert
      expect(rollbackData).toEqual(['step2 rollback']);
      const status = await workflowEngine.getStatus('rollback-workflow');
      expect(status).toBe(WorkflowStatus.Pending);
    });

    test('應該能完全回滾工作流程', async () => {
      // Arrange
      const rollbackData: any[] = [];

      const step1: WorkflowStep = {
        id: 'step1',
        name: 'Step 1',
        execute: async () => ({ success: true, data: 'step1 done' }),
        rollback: async () => { rollbackData.push('step1 rollback'); }
      };

      const step2: WorkflowStep = {
        id: 'step2',
        name: 'Step 2',
        execute: async () => ({ success: true, data: 'step2 done' }),
        rollback: async () => { rollbackData.push('step2 rollback'); }
      };

      const workflow: Workflow = {
        id: 'full-rollback-workflow',
        name: 'Full Rollback Workflow',
        steps: [step1, step2]
      };

      // 先執行完成
      await workflowEngine.execute(workflow);

      // Act - 完全回滾
      await workflowEngine.rollback('full-rollback-workflow');

      // Assert
      expect(rollbackData).toEqual(['step2 rollback', 'step1 rollback']);
      const status = await workflowEngine.getStatus('full-rollback-workflow');
      expect(status).toBe(WorkflowStatus.Pending);
    });

    test('回滾不存在的工作流程應該拋出錯誤', async () => {
      // Act & Assert
      await expect(workflowEngine.rollback('non-existent')).rejects.toThrow('Workflow not found');
    });
  });

  describe('getStatus', () => {
    test('應該回傳正確的工作流程狀態', async () => {
      // Arrange
      const step: WorkflowStep = {
        id: 'test-step',
        name: 'Test Step',
        execute: async () => ({ success: true, data: 'done' })
      };

      const workflow: Workflow = {
        id: 'status-workflow',
        name: 'Status Workflow',
        steps: [step]
      };

      // Act & Assert
      // 初始狀態
      let status = await workflowEngine.getStatus('status-workflow');
      expect(status).toBe(WorkflowStatus.Pending);

      // 執行後狀態
      await workflowEngine.execute(workflow);
      status = await workflowEngine.getStatus('status-workflow');
      expect(status).toBe(WorkflowStatus.Completed);
    });

    test('查詢不存在的工作流程應該返回 Pending', async () => {
      // Act
      const status = await workflowEngine.getStatus('non-existent');

      // Assert
      expect(status).toBe(WorkflowStatus.Pending);
    });
  });

  describe('錯誤處理', () => {
    test('應該正確處理步驟執行中的錯誤', async () => {
      // Arrange
      const errorEvents: any[] = [];
      eventBus.subscribe('error-event', (event) => {
        errorEvents.push(event);
      });

      const failingStep: WorkflowStep = {
        id: 'failing-step',
        name: 'Failing Step',
        execute: async () => {
          throw new BaseError('CUSTOM_ERROR', 'Custom error message');
        }
      };

      const workflow: Workflow = {
        id: 'error-workflow',
        name: 'Error Workflow',
        steps: [failingStep]
      };

      // Act
      const result = await workflowEngine.execute(workflow);

      // Assert
      expect(result.status).toBe(WorkflowStatus.Failed);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('CUSTOM_ERROR');
      expect(errorEvents).toHaveLength(1);
    });

    test('應該處理回滾過程中的錯誤', async () => {
      // Arrange
      const step: WorkflowStep = {
        id: 'rollback-error-step',
        name: 'Rollback Error Step',
        execute: async () => ({ success: true, data: 'done' }),
        rollback: async () => {
          throw new Error('Rollback failed');
        }
      };

      const workflow: Workflow = {
        id: 'rollback-error-workflow',
        name: 'Rollback Error Workflow',
        steps: [step]
      };

      // 先執行完成
      const result = await workflowEngine.execute(workflow);
      expect(result.status).toBe(WorkflowStatus.Completed);

      // Act & Assert
      await expect(workflowEngine.rollback('rollback-error-workflow')).rejects.toThrow('Rollback failed');
    });
  });

  describe('並發處理', () => {
    test('應該能同時執行多個不同的工作流程', async () => {
      // Arrange
      const createWorkflow = (id: string, delay: number): Workflow => ({
        id,
        name: `Workflow ${id}`,
        steps: [{
          id: `${id}-step`,
          name: `Step for ${id}`,
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, delay));
            return { success: true, data: `${id} completed` };
          }
        }]
      });

      const workflow1 = createWorkflow('concurrent-1', 100);
      const workflow2 = createWorkflow('concurrent-2', 50);

      // Act
      const [result1, result2] = await Promise.all([
        workflowEngine.execute(workflow1),
        workflowEngine.execute(workflow2)
      ]);

      // Assert
      expect(result1.status).toBe(WorkflowStatus.Completed);
      expect(result2.status).toBe(WorkflowStatus.Completed);
      expect(result1.result).toBe('concurrent-1 completed');
      expect(result2.result).toBe('concurrent-2 completed');
    });

    test('不應該允許同時執行相同 ID 的工作流程', async () => {
      // Arrange
      const workflow: Workflow = {
        id: 'duplicate-id',
        name: 'Duplicate Workflow',
        steps: [{
          id: 'step1',
          name: 'Step 1',
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return { success: true, data: 'done' };
          }
        }]
      };

      // Act
      const promise1 = workflowEngine.execute(workflow);
      const promise2 = workflowEngine.execute(workflow);

      // Assert
      await expect(promise2).rejects.toThrow('Workflow with ID duplicate-id is already running');
      await promise1; // 清理第一個工作流程
    });
  });

  describe('狀態管理整合', () => {
    test('應該在 StateManager 中正確管理工作流程狀態', async () => {
      // Arrange
      const step: WorkflowStep = {
        id: 'state-step',
        name: 'State Step',
        execute: async () => ({ success: true, data: 'state managed' })
      };

      const workflow: Workflow = {
        id: 'state-workflow',
        name: 'State Workflow',
        steps: [step]
      };

      // Act
      await workflowEngine.execute(workflow);

      // Assert
      const status = await workflowEngine.getStatus('state-workflow');
      expect(status).toBe(WorkflowStatus.Completed);

      // 驗證 StateManager 中是否有工作流程狀態
      const snapshot = stateManager.createSnapshot();
      expect(snapshot.applicationState).toBeDefined();
    });
  });
});