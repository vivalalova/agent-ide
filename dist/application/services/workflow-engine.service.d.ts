/**
 * WorkflowEngine 服務實作
 * 提供工作流程執行、暫停、恢復、回滾等功能
 */
import { BaseError } from '../../shared/errors/base-error.js';
import { EventBus } from '../events/event-bus.js';
import { ErrorHandlerService } from './error-handler.service.js';
import { StateManager } from '../state/state-manager.js';
import { WorkflowStatus, type IWorkflowEngine, type Workflow, type WorkflowResult } from '../types.js';
/**
 * 工作流程執行錯誤
 */
export declare class WorkflowError extends BaseError {
    constructor(message: string, details?: Record<string, any>, cause?: Error);
}
/**
 * 工作流程引擎服務
 */
export declare class WorkflowEngineService implements IWorkflowEngine {
    private readonly eventBus;
    private readonly errorHandler;
    private readonly stateManager;
    private readonly activeWorkflows;
    private readonly executionPromises;
    private readonly workflowRegistry;
    constructor(eventBus: EventBus, errorHandler: ErrorHandlerService, stateManager: StateManager);
    /**
     * 執行工作流程
     */
    execute<T>(workflow: Workflow<T>): Promise<WorkflowResult<T>>;
    /**
     * 暫停工作流程
     */
    pause(workflowId: string): Promise<void>;
    /**
     * 恢復工作流程
     */
    resume<T>(workflowId: string): Promise<WorkflowResult<T>>;
    /**
     * 回滾工作流程
     */
    rollback(workflowId: string, stepId?: string): Promise<void>;
    /**
     * 取得工作流程狀態
     */
    getStatus(workflowId: string): Promise<WorkflowStatus>;
    /**
     * 執行工作流程的核心邏輯
     */
    private executeWorkflow;
    /**
     * 繼續執行暫停的工作流程
     */
    private continueExecution;
    /**
     * 執行單個步驟
     */
    private executeStep;
    /**
     * 執行回滾
     */
    private performRollback;
    /**
     * 發布工作流程事件
     */
    private publishWorkflowEvent;
    /**
     * 驗證工作流程定義
     */
    private validateWorkflow;
    /**
     * 驗證工作流程步驟
     */
    private validateStep;
}
//# sourceMappingURL=workflow-engine.service.d.ts.map