/**
 * BaseWorkflow 抽象類別
 * 提供工作流程基礎架構和共用功能
 */
import { BaseError } from '../../shared/errors/base-error.js';
import type { Workflow, WorkflowStep, StepResult, WorkflowResult, IModuleCoordinatorService } from '../types.js';
/**
 * 工作流程基礎錯誤
 */
export declare class WorkflowError extends BaseError {
    constructor(message: string, details?: Record<string, unknown>, cause?: Error);
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
export declare abstract class BaseWorkflow<TContext = unknown, TResult = unknown> {
    protected readonly config: WorkflowConfig;
    protected readonly steps: Map<string, WorkflowStep>;
    protected readonly stepOrder: string[];
    protected readonly moduleCoordinator: IModuleCoordinatorService;
    constructor(config: WorkflowConfig, moduleCoordinator: IModuleCoordinatorService);
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
    createWorkflow(context?: TContext): Workflow<TContext>;
    /**
     * 執行工作流程
     */
    execute(input: unknown): Promise<WorkflowResult<TResult>>;
    /**
     * 新增步驟到工作流程
     */
    protected addStep(step: WorkflowStep): void;
    /**
     * 建立步驟的輔助方法
     */
    protected createStep(id: string, name: string, executor: (context: StepContext) => Promise<StepResult>, options?: {
        rollback?: (context: StepContext) => Promise<void>;
        canRetry?: boolean;
        maxRetries?: number;
    }): WorkflowStep;
    /**
     * 建立成功步驟結果的輔助方法
     */
    protected createSuccessResult(data?: unknown, nextStepId?: string): StepResult;
    /**
     * 建立失敗步驟結果的輔助方法
     */
    protected createFailureResult(error: BaseError): StepResult;
    /**
     * 執行單一步驟
     */
    private executeStep;
    /**
     * 產生唯一的工作流程 ID
     */
    private generateWorkflowId;
    /**
     * 休眠輔助方法
     */
    protected sleep(ms: number): Promise<void>;
    /**
     * 取得工作流程配置
     */
    getConfig(): WorkflowConfig;
    /**
     * 取得步驟列表
     */
    getSteps(): WorkflowStep[];
    /**
     * 取得步驟執行順序
     */
    getStepOrder(): string[];
}
//# sourceMappingURL=base-workflow.d.ts.map