/**
 * Workflows 模組匯出
 * 提供所有工作流程類別和相關型別的統一匯出
 */
export { BaseWorkflow, WorkflowError, type StepContext, type WorkflowConfig } from './base-workflow.js';
export { RefactorWorkflow, type RefactorWorkflowInput, type RefactorWorkflowContext, type RefactorWorkflowResult } from './refactor-workflow.js';
export { AnalysisWorkflow, AnalysisType, type AnalysisWorkflowInput, type AnalysisWorkflowContext, type AnalysisWorkflowResult, type AnalysisReport } from './analysis-workflow.js';
import type { IModuleCoordinatorService } from '../types.js';
import { RefactorWorkflow } from './refactor-workflow.js';
import { AnalysisWorkflow } from './analysis-workflow.js';
/**
 * 工作流程類型枚舉
 */
export declare enum WorkflowType {
    REFACTOR = "refactor",
    ANALYSIS = "analysis"
}
/**
 * 工作流程工廠
 * 提供統一的工作流程建立介面
 */
export declare class WorkflowFactory {
    private readonly moduleCoordinator;
    constructor(moduleCoordinator: IModuleCoordinatorService);
    /**
     * 建立重構工作流程
     */
    createRefactorWorkflow(): RefactorWorkflow;
    /**
     * 建立分析工作流程
     */
    createAnalysisWorkflow(): AnalysisWorkflow;
    /**
     * 根據類型建立工作流程
     */
    createWorkflow(type: WorkflowType): RefactorWorkflow | AnalysisWorkflow;
    /**
     * 取得所有支援的工作流程類型
     */
    getSupportedTypes(): WorkflowType[];
}
/**
 * 工作流程註冊表
 * 用於管理和查詢可用的工作流程
 */
export declare class WorkflowRegistry {
    private static readonly workflows;
    /**
     * 註冊工作流程
     */
    static register(id: string, workflow: {
        type: WorkflowType;
        name: string;
        description: string;
        inputSchema?: unknown;
        outputSchema?: unknown;
    }): void;
    /**
     * 取得工作流程資訊
     */
    static get(id: string): {
        type: WorkflowType;
        name: string;
        description: string;
        inputSchema?: unknown;
        outputSchema?: unknown;
    } | undefined;
    /**
     * 取得所有註冊的工作流程
     */
    static getAll(): Array<{
        id: string;
        type: WorkflowType;
        name: string;
        description: string;
        inputSchema?: unknown;
        outputSchema?: unknown;
    }>;
    /**
     * 根據類型取得工作流程
     */
    static getByType(type: WorkflowType): Array<{
        id: string;
        type: WorkflowType;
        name: string;
        description: string;
        inputSchema?: unknown;
        outputSchema?: unknown;
    }>;
    /**
     * 檢查工作流程是否存在
     */
    static exists(id: string): boolean;
    /**
     * 移除工作流程註冊
     */
    static unregister(id: string): boolean;
}
/**
 * 工作流程輔助方法
 */
export declare class WorkflowUtils {
    /**
     * 驗證工作流程輸入
     */
    static validateInput(type: WorkflowType, input: unknown): {
        isValid: boolean;
        errors: string[];
    };
    /**
     * 格式化工作流程結果
     */
    static formatResult(type: WorkflowType, result: unknown): string;
}
//# sourceMappingURL=index.d.ts.map