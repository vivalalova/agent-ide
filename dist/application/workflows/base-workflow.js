/**
 * BaseWorkflow 抽象類別
 * 提供工作流程基礎架構和共用功能
 */
import { BaseError } from '../../shared/errors/base-error.js';
import { WorkflowStatus } from '../types.js';
/**
 * 工作流程基礎錯誤
 */
export class WorkflowError extends BaseError {
    constructor(message, details, cause) {
        super('WORKFLOW_ERROR', message, details, cause);
    }
}
/**
 * BaseWorkflow 抽象類別
 */
export class BaseWorkflow {
    config;
    steps;
    stepOrder;
    moduleCoordinator;
    constructor(config, moduleCoordinator) {
        this.config = config;
        this.moduleCoordinator = moduleCoordinator;
        this.steps = new Map();
        this.stepOrder = [];
    }
    /**
     * 建立工作流程實例
     */
    createWorkflow(context) {
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
    async execute(input) {
        const startTime = Date.now();
        const workflowId = this.generateWorkflowId();
        try {
            // 初始化上下文
            const context = await this.initializeContext(input);
            // 建立工作流程
            const workflow = this.createWorkflow(context);
            workflow.id = workflowId;
            // 執行步驟
            const executedSteps = [];
            const stepResults = new Map();
            for (const stepId of this.stepOrder) {
                const step = this.steps.get(stepId);
                if (!step) {
                    throw new WorkflowError(`找不到步驟: ${stepId}`, { workflowId, stepId });
                }
                try {
                    const stepContext = {
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
                }
                catch (error) {
                    const workflowError = error instanceof WorkflowError
                        ? error
                        : new WorkflowError(`步驟 ${stepId} 執行時發生錯誤: ${error.message}`, { workflowId, stepId }, error);
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
        }
        catch (error) {
            const workflowError = error instanceof WorkflowError
                ? error
                : new WorkflowError(`工作流程執行失敗: ${error.message}`, { workflowId }, error);
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
    addStep(step) {
        if (this.steps.has(step.id)) {
            throw new WorkflowError(`步驟 ID 重複: ${step.id}`, { stepId: step.id });
        }
        this.steps.set(step.id, step);
        this.stepOrder.push(step.id);
    }
    /**
     * 建立步驟的輔助方法
     */
    createStep(id, name, executor, options) {
        return {
            id,
            name,
            execute: async (context) => {
                return executor(context);
            },
            rollback: options?.rollback
                ? async (context) => options.rollback(context)
                : undefined,
            canRetry: options?.canRetry ?? false,
            maxRetries: options?.maxRetries ?? 0
        };
    }
    /**
     * 建立成功步驟結果的輔助方法
     */
    createSuccessResult(data, nextStepId) {
        return {
            success: true,
            data,
            nextStepId
        };
    }
    /**
     * 建立失敗步驟結果的輔助方法
     */
    createFailureResult(error) {
        return {
            success: false,
            error
        };
    }
    /**
     * 執行單一步驟
     */
    async executeStep(step, context) {
        const maxRetries = step.maxRetries || this.config.maxRetries || 0;
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await step.execute(context);
            }
            catch (error) {
                lastError = error;
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
    generateWorkflowId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 5);
        return `${this.config.name}-${timestamp}-${random}`;
    }
    /**
     * 休眠輔助方法
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * 取得工作流程配置
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * 取得步驟列表
     */
    getSteps() {
        return Array.from(this.steps.values());
    }
    /**
     * 取得步驟執行順序
     */
    getStepOrder() {
        return [...this.stepOrder];
    }
}
//# sourceMappingURL=base-workflow.js.map