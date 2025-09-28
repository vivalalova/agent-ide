/**
 * WorkflowEngine 服務實作
 * 提供工作流程執行、暫停、恢復、回滾等功能
 */

import { BaseError } from '../../shared/errors/base-error.js';
import { EventBus } from '../events/event-bus.js';
import { EventPriority } from '../events/event-types.js';
import { ErrorHandlerService } from './error-handler.service.js';
import { StateManager } from '../state/state-manager.js';
import {
  WorkflowStatus,
  type IWorkflowEngine,
  type Workflow,
  type WorkflowStep,
  type WorkflowResult,
  type WorkflowState,
  type StepResult,
  type ErrorContext
} from '../types.js';

/**
 * 工作流程執行錯誤
 */
export class WorkflowError extends BaseError {
  constructor(message: string, details?: Record<string, any>, cause?: Error) {
    super('WORKFLOW_ERROR', message, details, cause);
  }
}

/**
 * 工作流程引擎服務
 */
export class WorkflowEngineService implements IWorkflowEngine {
  private readonly eventBus: EventBus;
  private readonly errorHandler: ErrorHandlerService;
  private readonly stateManager: StateManager;
  private readonly activeWorkflows: Map<string, WorkflowState>;
  private readonly executionPromises: Map<string, Promise<WorkflowResult>>;
  private readonly workflowRegistry: Map<string, Workflow>;

  constructor(
    eventBus: EventBus,
    errorHandler: ErrorHandlerService,
    stateManager: StateManager
  ) {
    this.eventBus = eventBus;
    this.errorHandler = errorHandler;
    this.stateManager = stateManager;
    this.activeWorkflows = new Map();
    this.executionPromises = new Map();
    this.workflowRegistry = new Map();
  }

  /**
   * 執行工作流程
   */
  async execute<T>(workflow: Workflow<T>): Promise<WorkflowResult<T>> {
    this.validateWorkflow(workflow);

    // 檢查是否已經在執行中
    if (this.activeWorkflows.has(workflow.id)) {
      throw new WorkflowError(`Workflow with ID ${workflow.id} is already running`);
    }

    // 註冊工作流程定義以供後續回滾使用
    this.workflowRegistry.set(workflow.id, workflow);

    // 建立工作流程狀態
    const workflowState: WorkflowState = {
      workflowId: workflow.id,
      status: WorkflowStatus.Pending,
      executedSteps: [],
      context: workflow.context,
      startTime: new Date()
    };

    this.activeWorkflows.set(workflow.id, workflowState);

    // 發布開始事件
    await this.publishWorkflowEvent(workflow.id, 'started');

    // 建立執行 Promise
    const executionPromise = this.executeWorkflow(workflow, workflowState);
    this.executionPromises.set(workflow.id, executionPromise);

    try {
      const result = await executionPromise;
      return result;
    } finally {
      this.executionPromises.delete(workflow.id);
    }
  }

  /**
   * 暫停工作流程
   */
  async pause(workflowId: string): Promise<void> {
    const workflowState = this.activeWorkflows.get(workflowId);
    if (!workflowState) {
      throw new WorkflowError(`Workflow not found: ${workflowId}`);
    }

    if (workflowState.status === WorkflowStatus.Running) {
      workflowState.status = WorkflowStatus.Paused;
      await this.publishWorkflowEvent(workflowId, 'paused');
    }
  }

  /**
   * 恢復工作流程
   */
  async resume(workflowId: string): Promise<void> {
    const workflowState = this.activeWorkflows.get(workflowId);
    if (!workflowState) {
      throw new WorkflowError(`Workflow not found: ${workflowId}`);
    }

    if (workflowState.status !== WorkflowStatus.Paused) {
      throw new WorkflowError(`Workflow ${workflowId} is not paused`);
    }

    workflowState.status = WorkflowStatus.Running;
    await this.publishWorkflowEvent(workflowId, 'resumed');

    // 重新開始執行（從當前步驟繼續）
    const workflow = this.workflowRegistry.get(workflowState.workflowId);
    if (!workflow) {
      throw new WorkflowError(`Workflow definition not found: ${workflowState.workflowId}`);
    }
    await this.continueExecution(workflow, workflowState);
  }

  /**
   * 回滾工作流程
   */
  async rollback(workflowId: string, stepId?: string): Promise<void> {
    const workflowState = this.activeWorkflows.get(workflowId);
    if (!workflowState) {
      throw new WorkflowError(`Workflow not found: ${workflowId}`);
    }

    // 從已執行的步驟中獲取工作流程定義
    const originalWorkflow = this.workflowRegistry.get(workflowId);
    if (!originalWorkflow) {
      throw new WorkflowError(`Original workflow definition not found: ${workflowId}`);
    }

    await this.performRollback(originalWorkflow, workflowState, stepId);

    // 重置狀態
    if (stepId) {
      // 回滾到指定步驟
      const stepIndex = workflowState.executedSteps.indexOf(stepId);
      if (stepIndex !== -1) {
        workflowState.executedSteps = workflowState.executedSteps.slice(0, stepIndex);
        workflowState.currentStepId = stepId;
      }
    } else {
      // 完全回滾
      workflowState.executedSteps = [];
      workflowState.currentStepId = undefined;
    }

    workflowState.status = WorkflowStatus.Pending;
  }

  /**
   * 取得工作流程狀態
   */
  async getStatus(workflowId: string): Promise<WorkflowStatus> {
    const workflowState = this.activeWorkflows.get(workflowId);
    if (!workflowState) {
      // 如果工作流程不存在，可能還沒開始，返回 Pending
      return WorkflowStatus.Pending;
    }

    return workflowState.status;
  }

  /**
   * 執行工作流程的核心邏輯
   */
  private async executeWorkflow<T>(
    workflow: Workflow<T>,
    workflowState: WorkflowState
  ): Promise<WorkflowResult<T>> {
    const startTime = Date.now();
    let lastResult: any = workflow.context;

    try {
      workflowState.status = WorkflowStatus.Running;

      // 執行步驟
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];

        // 執行前檢查是否被暫停
        const currentState = this.activeWorkflows.get(workflow.id);
        if (currentState?.status === WorkflowStatus.Paused) {
          workflowState.currentStepId = step.id;
          return {
            workflowId: workflow.id,
            status: WorkflowStatus.Paused,
            executedSteps: [...workflowState.executedSteps],
            duration: Date.now() - startTime
          };
        }

        // 執行步驟
        const stepResult = await this.executeStep(step, lastResult, workflow.id);

        if (stepResult.success) {
          workflowState.executedSteps.push(step.id);
          lastResult = stepResult.data || lastResult; // 確保有資料時才更新上下文

          await this.publishWorkflowEvent(workflow.id, 'step-completed', step.id, stepResult);

          // 步驟完成後再次檢查是否被暫停
          const updatedState = this.activeWorkflows.get(workflow.id);
          if (updatedState?.status === WorkflowStatus.Paused) {
            return {
              workflowId: workflow.id,
              status: WorkflowStatus.Paused,
              executedSteps: [...workflowState.executedSteps],
              duration: Date.now() - startTime
            };
          }

          // 檢查是否有條件跳轉
          if (stepResult.nextStepId) {
            const nextStepIndex = workflow.steps.findIndex(s => s.id === stepResult.nextStepId);
            if (nextStepIndex !== -1) {
              i = nextStepIndex - 1; // -1 因為 for 迴圈會 +1
              continue;
            }
          }
        } else {
          // 步驟失敗
          workflowState.status = WorkflowStatus.Failed;
          workflowState.error = stepResult.error;
          workflowState.endTime = new Date();

          await this.publishWorkflowEvent(workflow.id, 'failed', step.id);

          // 處理步驟失敗的錯誤
          if (stepResult.error) {
            const errorContext: ErrorContext = {
              module: 'workflow-engine',
              operation: 'executeStep',
              parameters: { workflowId: workflow.id, stepId: step.id },
              timestamp: new Date()
            };

            const handledError = await this.errorHandler.handle(stepResult.error, errorContext);

            return {
              workflowId: workflow.id,
              status: WorkflowStatus.Failed,
              error: handledError,
              executedSteps: [...workflowState.executedSteps],
              duration: Date.now() - startTime
            };
          }

          return {
            workflowId: workflow.id,
            status: WorkflowStatus.Failed,
            error: stepResult.error,
            executedSteps: [...workflowState.executedSteps],
            duration: Date.now() - startTime
          };
        }
      }

      // 工作流程完成
      workflowState.status = WorkflowStatus.Completed;
      workflowState.endTime = new Date();

      await this.publishWorkflowEvent(workflow.id, 'completed');

      // 保留已完成的工作流程狀態，供後續查詢使用
      // this.activeWorkflows.delete(workflow.id);

      return {
        workflowId: workflow.id,
        status: WorkflowStatus.Completed,
        result: lastResult,
        executedSteps: [...workflowState.executedSteps],
        duration: Date.now() - startTime
      };

    } catch (error) {
      workflowState.status = WorkflowStatus.Failed;
      workflowState.error = error instanceof BaseError ? error : new WorkflowError(
        'Workflow execution failed',
        { workflowId: workflow.id },
        error as Error
      );
      workflowState.endTime = new Date();

      await this.publishWorkflowEvent(workflow.id, 'failed');

      // 處理錯誤
      const errorContext: ErrorContext = {
        module: 'workflow-engine',
        operation: 'execute',
        parameters: { workflowId: workflow.id },
        timestamp: new Date()
      };

      const handledError = await this.errorHandler.handle(error as Error, errorContext);

      return {
        workflowId: workflow.id,
        status: WorkflowStatus.Failed,
        error: handledError,
        executedSteps: [...workflowState.executedSteps],
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 繼續執行暫停的工作流程
   */
  private async continueExecution<T>(
    workflow: Workflow<T>,
    workflowState: WorkflowState
  ): Promise<WorkflowResult<T>> {
    // 找到當前應該執行的步驟
    const currentStepIndex = workflowState.currentStepId ?
      workflow.steps.findIndex(s => s.id === workflowState.currentStepId) :
      workflowState.executedSteps.length;

    // 建立修改後的工作流程，從當前步驟開始
    const remainingWorkflow: Workflow<T> = {
      ...workflow,
      steps: workflow.steps.slice(currentStepIndex)
    };

    return this.executeWorkflow(remainingWorkflow, workflowState);
  }

  /**
   * 執行單個步驟
   */
  private async executeStep(
    step: WorkflowStep,
    context: any,
    workflowId: string
  ): Promise<StepResult> {
    let attemptCount = 0;
    const maxRetries = step.maxRetries || 0;

    while (attemptCount <= maxRetries) {
      try {
        const result = await step.execute(context);
        return result;
      } catch (error) {
        attemptCount++;

        // 如果步驟不可重試或達到最大重試次數
        if (!step.canRetry || attemptCount > maxRetries) {
          const stepError = error instanceof BaseError ? error : new WorkflowError(
            `Step ${step.id} failed`,
            { stepId: step.id, workflowId, attempt: attemptCount },
            error as Error
          );

          return {
            success: false,
            error: stepError
          };
        }

        // 短暫等待後重試
        await new Promise(resolve => setTimeout(resolve, 1000 * attemptCount));
      }
    }

    // 這行理論上不會執行到，但為了 TypeScript 類型檢查
    return {
      success: false,
      error: new WorkflowError(`Step ${step.id} failed after ${attemptCount} attempts`)
    };
  }

  /**
   * 執行回滾
   */
  private async performRollback(
    workflow: Workflow,
    workflowState: WorkflowState,
    targetStepId?: string
  ): Promise<void> {
    const executedSteps = [...workflowState.executedSteps];

    // 確定回滾範圍
    let rollbackSteps: string[];
    if (targetStepId) {
      const targetIndex = executedSteps.indexOf(targetStepId);
      if (targetIndex === -1) {
        throw new WorkflowError(`Target step ${targetStepId} not found in executed steps`);
      }
      rollbackSteps = executedSteps.slice(targetIndex + 1).reverse();
    } else {
      rollbackSteps = executedSteps.reverse();
    }

    // 執行回滾
    for (const stepId of rollbackSteps) {
      const step = workflow.steps.find(s => s.id === stepId);
      if (step?.rollback) {
        try {
          await step.rollback(workflowState.context);
        } catch (error) {
          throw new WorkflowError(
            `Rollback failed for step ${stepId}`,
            { stepId, workflowId: workflow.id },
            error as Error
          );
        }
      }
    }
  }

  /**
   * 發布工作流程事件
   */
  private async publishWorkflowEvent(
    workflowId: string,
    eventType: 'started' | 'paused' | 'resumed' | 'completed' | 'failed' | 'step-completed',
    stepId?: string,
    data?: any
  ): Promise<void> {
    try {
      await this.eventBus.emit({
        type: 'workflow-event',
        timestamp: new Date(),
        priority: EventPriority.NORMAL,
        payload: {
          workflowId,
          eventType,
          stepId,
          data
        }
      });
    } catch (error) {
      // 記錄錯誤但不中斷工作流程執行
      console.error('Failed to publish workflow event:', error);
    }
  }


  /**
   * 驗證工作流程定義
   */
  private validateWorkflow(workflow: Workflow): void {
    if (!workflow) {
      throw new WorkflowError('Workflow cannot be null or undefined');
    }

    if (!workflow.id || typeof workflow.id !== 'string') {
      throw new WorkflowError('Workflow must have a valid ID');
    }

    if (!workflow.name || typeof workflow.name !== 'string') {
      throw new WorkflowError('Workflow must have a valid name');
    }

    if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      throw new WorkflowError('Workflow must have at least one step');
    }

    // 驗證步驟
    for (const step of workflow.steps) {
      this.validateStep(step);
    }

    // 檢查步驟 ID 唯一性
    const stepIds = workflow.steps.map(s => s.id);
    const uniqueStepIds = new Set(stepIds);
    if (stepIds.length !== uniqueStepIds.size) {
      throw new WorkflowError('Workflow steps must have unique IDs');
    }
  }

  /**
   * 驗證工作流程步驟
   */
  private validateStep(step: WorkflowStep): void {
    if (!step) {
      throw new WorkflowError('Step cannot be null or undefined');
    }

    if (!step.id || typeof step.id !== 'string') {
      throw new WorkflowError('Step must have a valid ID');
    }

    if (!step.name || typeof step.name !== 'string') {
      throw new WorkflowError('Step must have a valid name');
    }

    if (!step.execute || typeof step.execute !== 'function') {
      throw new WorkflowError('Step must have a valid execute function');
    }

    if (step.rollback && typeof step.rollback !== 'function') {
      throw new WorkflowError('Step rollback must be a function if provided');
    }

    if (step.maxRetries !== undefined && (typeof step.maxRetries !== 'number' || step.maxRetries < 0)) {
      throw new WorkflowError('Step maxRetries must be a non-negative number if provided');
    }
  }
}