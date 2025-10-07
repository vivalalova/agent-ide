/**
 * RefactorWorkflow 重構工作流程實作
 * 實作重構操作的完整工作流程：分析 → 驗證 → 執行重構 → 驗證結果
 */
import { BaseWorkflow } from './base-workflow.js';
import { BaseError } from '../../shared/errors/base-error.js';
import type { IModuleCoordinatorService, RefactorOptions, RefactorResult } from '../types.js';
/**
 * 重構工作流程輸入
 */
export interface RefactorWorkflowInput {
    filePath: string;
    options: RefactorOptions;
}
/**
 * 重構工作流程上下文
 */
export interface RefactorWorkflowContext {
    filePath: string;
    options: RefactorOptions;
    originalContent?: string;
    analysisResult?: unknown;
    validationResult?: unknown;
    refactorResult?: RefactorResult;
    finalValidationResult?: unknown;
}
/**
 * 重構工作流程結果
 */
export interface RefactorWorkflowResult {
    success: boolean;
    refactorResult: RefactorResult;
    analysisData?: unknown;
    validationData?: unknown;
    error?: BaseError;
}
/**
 * RefactorWorkflow 實作
 */
export declare class RefactorWorkflow extends BaseWorkflow<RefactorWorkflowContext, RefactorWorkflowResult> {
    constructor(moduleCoordinator: IModuleCoordinatorService);
    /**
     * 定義重構工作流程步驟
     */
    protected defineSteps(): void;
    /**
     * 初始化工作流程上下文
     */
    protected initializeContext(input: unknown): Promise<RefactorWorkflowContext>;
    /**
     * 處理工作流程結果
     */
    protected processResult(context: RefactorWorkflowContext): Promise<RefactorWorkflowResult>;
    /**
     * 步驟 1: 分析檔案
     */
    private analyzeFile;
    /**
     * 步驟 2: 重構前驗證
     */
    private preValidation;
    /**
     * 步驟 3: 執行重構
     */
    private executeRefactor;
    /**
     * 步驟 4: 重構後驗證
     */
    private postValidation;
    /**
     * 回滾重構操作
     */
    private rollbackRefactor;
    /**
     * 驗證輸入格式
     */
    private isValidInput;
    /**
     * 從元數據獲取上下文
     */
    private getContextFromMetadata;
    /**
     * 計算程式碼複雜度
     */
    private calculateComplexity;
    /**
     * 分析程式碼結構
     */
    private analyzeStructure;
    /**
     * 分析依賴關係
     */
    private analyzeDependencies;
    /**
     * 生成重構建議
     */
    private generateRecommendations;
    /**
     * 驗證重構操作
     */
    private validateRefactorOperation;
    /**
     * 驗證重構後的程式碼
     */
    private validateRefactoredCode;
}
//# sourceMappingURL=refactor-workflow.d.ts.map