/**
 * BaseWorkflow 抽象類別
 * 提供工作流程基礎架構和共用功能
 */

import { BaseError } from '@shared/errors/base-error.js';
import type {
  Workflow,
  WorkflowStep,
  StepResult,
  WorkflowResult,
  IModuleCoordinatorService
} from '../types.js';
import { WorkflowStatus } from '../types.js';

/**
 * 工作流程基礎錯誤
 */
export class WorkflowError extends BaseError {
  constructor(message: string, details?: Record<string, unknown>, cause?: Error) {
    super('WORKFLOW_ERROR', message, details, cause);
  }
}

/**
 * 步驟執行上下文
 */
export interface StepContext {
  workflowId: string;
  stepId: string;
  previousResults: Map<string, unknown>;
  metadata: Record<string, unknown>;
  moduleCoordinator: IModuleCoordinatorService;
}

/**
 * 工作流程配置
 */
export interface WorkflowConfig {
  id: string;
  name: string;
  description?: string;
  timeout?: number;
  maxRetries?: number;
  enableRollback?: boolean;
}

/**
 * BaseWorkflow 抽象類別
 */
export abstract class BaseWorkflow<TContext = unknown, TResult = unknown> {
  protected readonly config: WorkflowConfig;
  protected readonly steps: Map<string, WorkflowStep>;
  protected readonly stepOrder: string[];
  protected readonly moduleCoordinator: IModuleCoordinatorService;

  constructor(
    config: WorkflowConfig,
    moduleCoordinator: IModuleCoordinatorService
  ) {
    this.config = config;
    this.moduleCoordinator = moduleCoordinator;
    this.steps = new Map();
    this.stepOrder = [];
  }

  /**
   * 子類別必須實作的工作流程定義方法
   */
  protected abstract defineSteps(): void;

  /**
   * 子類別必須實作的上下文初始化方法
   */
  protected abstract initializeContext(input: unknown): Promise<TContext>;

  /**
   * 子類別必須實作的結果處理方法
   */
  protected abstract processResult(context: TContext): Promise<TResult>;

  /**
   * 建立工作流程實例
   */
  public createWorkflow(context?: TContext): Workflow<TContext> {
    this.defineSteps();

    return {
      id: this.config.id,
      name: this.config.name,
      steps: Array.from(this.steps.values()),
      context,
      metadata: {
        description: this.config.description,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
        enableRollback: this.config.enableRollback,
        createdAt: new Date().toISOString()
      }
    };
  }

  /**
   * 執行工作流程
   */
  public async execute(input: unknown): Promise<WorkflowResult<TResult>> {
    const startTime = Date.now();
    const workflowId = this.generateWorkflowId();

    try {
      // 初始化上下文
      const context = await this.initializeContext(input);

      // 建立工作流程
      const workflow = this.createWorkflow(context);
      workflow.id = workflowId;

      // 執行步驟
      const executedSteps: string[] = [];
      const stepResults = new Map<string, unknown>();

      for (const stepId of this.stepOrder) {
        const step = this.steps.get(stepId);
        if (!step) {
          throw new WorkflowError(
            `找不到步驟: ${stepId}`,
            { workflowId, stepId }
          );
        }

        try {
          const stepContext: StepContext = {
            workflowId,
            stepId,
            previousResults: stepResults,
            metadata: workflow.metadata || {},
            moduleCoordinator: this.moduleCoordinator
          };

          const stepResult = await this.executeStep(step, stepContext);

          if (!stepResult.success) {
            return {
              workflowId,
              status: WorkflowStatus.Failed,
              error: stepResult.error || new WorkflowError(`步驟 ${stepId} 執行失敗`),
              executedSteps,
              duration: Date.now() - startTime
            };
          }

          executedSteps.push(stepId);
          if (stepResult.data !== undefined) {
            stepResults.set(stepId, stepResult.data);
          }

          // 檢查是否有指定下一步驟
          if (stepResult.nextStepId) {
            const nextStepIndex = this.stepOrder.indexOf(stepResult.nextStepId);
            if (nextStepIndex !== -1 && nextStepIndex > this.stepOrder.indexOf(stepId)) {
              // 跳到指定步驟
              continue;
            }
          }

        } catch (error) {
          const workflowError = error instanceof WorkflowError
            ? error
            : new WorkflowError(
              `步驟 ${stepId} 執行時發生錯誤: ${(error as Error).message}`,
              { workflowId, stepId },
                error as Error
            );

          return {
            workflowId,
            status: WorkflowStatus.Failed,
            error: workflowError,
            executedSteps,
            duration: Date.now() - startTime
          };
        }
      }

      // 處理最終結果
      const result = await this.processResult(context);

      return {
        workflowId,
        status: WorkflowStatus.Completed,
        result,
        executedSteps,
        duration: Date.now() - startTime
      };

    } catch (error) {
      const workflowError = error instanceof WorkflowError
        ? error
        : new WorkflowError(
          `工作流程執行失敗: ${(error as Error).message}`,
          { workflowId },
            error as Error
        );

      return {
        workflowId,
        status: WorkflowStatus.Failed,
        error: workflowError,
        executedSteps: [],
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 新增步驟到工作流程
   */
  protected addStep(step: WorkflowStep): void {
    if (this.steps.has(step.id)) {
      throw new WorkflowError(
        `步驟 ID 重複: ${step.id}`,
        { stepId: step.id }
      );
    }

    this.steps.set(step.id, step);
    this.stepOrder.push(step.id);
  }

  /**
   * 建立步驟的輔助方法
   */
  protected createStep(
    id: string,
    name: string,
    executor: (context: StepContext) => Promise<StepResult>,
    options?: {
      rollback?: (context: StepContext) => Promise<void>;
      canRetry?: boolean;
      maxRetries?: number;
    }
  ): WorkflowStep {
    return {
      id,
      name,
      execute: async (context: unknown) => {
        return executor(context as StepContext);
      },
      rollback: options?.rollback
        ? async (context: unknown) => options.rollback!(context as StepContext)
        : undefined,
      canRetry: options?.canRetry ?? false,
      maxRetries: options?.maxRetries ?? 0
    };
  }

  /**
   * 建立成功步驟結果的輔助方法
   */
  protected createSuccessResult(data?: unknown, nextStepId?: string): StepResult {
    return {
      success: true,
      data,
      nextStepId
    };
  }

  /**
   * 建立失敗步驟結果的輔助方法
   */
  protected createFailureResult(error: BaseError): StepResult {
    return {
      success: false,
      error
    };
  }

  /**
   * 執行單一步驟
   */
  private async executeStep(step: WorkflowStep, context: StepContext): Promise<StepResult> {
    const maxRetries = step.maxRetries || this.config.maxRetries || 0;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await step.execute(context);
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries && (step.canRetry ?? false)) {
          // 等待一段時間後重試
          await this.sleep(Math.pow(2, attempt) * 1000);
          continue;
        }

        throw error;
      }
    }

    throw lastError || new WorkflowError('步驟執行失敗');
  }

  /**
   * 產生唯一的工作流程 ID
   */
  private generateWorkflowId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${this.config.name}-${timestamp}-${random}`;
  }

  /**
   * 休眠輔助方法
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 取得工作流程配置
   */
  public getConfig(): WorkflowConfig {
    return { ...this.config };
  }

  /**
   * 取得步驟列表
   */
  public getSteps(): WorkflowStep[] {
    return Array.from(this.steps.values());
  }

  /**
   * 取得步驟執行順序
   */
  public getStepOrder(): string[] {
    return [...this.stepOrder];
  }
}