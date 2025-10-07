/**
 * AnalysisWorkflow 程式碼分析工作流程實作
 * 實作程式碼分析的完整工作流程：索引 → 複雜度分析 → 依賴分析 → 生成報告
 */
import { BaseWorkflow } from './base-workflow.js';
import { BaseError } from '../../shared/errors/base-error.js';
import type { IModuleCoordinatorService } from '../types.js';
/**
 * 分析類型枚舉
 */
export declare enum AnalysisType {
    COMPLEXITY = "complexity",
    DEPENDENCY = "dependency",
    QUALITY = "quality",
    DEAD_CODE = "dead-code",
    DUPLICATION = "duplication",
    COMPREHENSIVE = "comprehensive"
}
/**
 * 分析工作流程輸入
 */
export interface AnalysisWorkflowInput {
    target: string;
    analysisTypes: AnalysisType[];
    options?: {
        includeTests?: boolean;
        excludePatterns?: string[];
        outputFormat?: 'json' | 'markdown' | 'html';
        includeRecommendations?: boolean;
        detailLevel?: 'basic' | 'detailed' | 'comprehensive';
    };
}
/**
 * 分析工作流程上下文
 */
export interface AnalysisWorkflowContext {
    target: string;
    analysisTypes: AnalysisType[];
    options: Required<AnalysisWorkflowInput['options']>;
    indexResult?: {
        totalFiles: number;
        indexedFiles: string[];
        symbols: unknown[];
        dependencies: unknown[];
    };
    complexityResult?: {
        overallComplexity: number;
        fileComplexities: Map<string, number>;
        hotspots: Array<{
            file: string;
            complexity: number;
            line?: number;
        }>;
    };
    dependencyResult?: {
        dependencies: unknown[];
        circularDependencies: unknown[];
        dependencyGraph: unknown;
        metrics: unknown;
    };
    qualityResult?: {
        codeSmells: unknown[];
        suggestions: string[];
        metrics: unknown;
    };
    deadCodeResult?: {
        deadFunctions: unknown[];
        deadVariables: unknown[];
        deadImports: unknown[];
    };
    duplicationResult?: {
        duplicatedBlocks: unknown[];
        duplicationRate: number;
        suggestions: string[];
    };
}
/**
 * 分析報告
 */
export interface AnalysisReport {
    summary: {
        target: string;
        analysisTypes: AnalysisType[];
        totalFiles: number;
        analysisDate: string;
        duration: number;
    };
    complexity?: {
        overallScore: number;
        averageComplexity: number;
        highComplexityFiles: Array<{
            file: string;
            score: number;
        }>;
        recommendations: string[];
    };
    dependencies?: {
        totalDependencies: number;
        circularDependencies: number;
        dependencyDepth: number;
        recommendations: string[];
    };
    quality?: {
        overallQuality: number;
        codeSmellCount: number;
        maintainabilityIndex: number;
        recommendations: string[];
    };
    deadCode?: {
        deadCodePercentage: number;
        functionsToRemove: number;
        variablesToRemove: number;
        importsToRemove: number;
        recommendations: string[];
    };
    duplication?: {
        duplicationRate: number;
        duplicatedLinesCount: number;
        blocksToRefactor: number;
        recommendations: string[];
    };
    recommendations: string[];
    actionItems: Array<{
        priority: 'high' | 'medium' | 'low';
        category: string;
        description: string;
        effort: 'low' | 'medium' | 'high';
    }>;
}
/**
 * 分析工作流程結果
 */
export interface AnalysisWorkflowResult {
    success: boolean;
    report: AnalysisReport;
    rawData?: {
        complexity?: unknown;
        dependencies?: unknown;
        quality?: unknown;
        deadCode?: unknown;
        duplication?: unknown;
    };
    error?: BaseError;
}
/**
 * AnalysisWorkflow 實作
 */
export declare class AnalysisWorkflow extends BaseWorkflow<AnalysisWorkflowContext, AnalysisWorkflowResult> {
    constructor(moduleCoordinator: IModuleCoordinatorService);
    /**
     * 定義分析工作流程步驟
     */
    protected defineSteps(): void;
    /**
     * 初始化工作流程上下文
     */
    protected initializeContext(input: unknown): Promise<AnalysisWorkflowContext>;
    /**
     * 處理工作流程結果
     */
    protected processResult(context: AnalysisWorkflowContext): Promise<AnalysisWorkflowResult>;
    /**
     * 步驟 1: 建立索引
     */
    private createIndex;
    /**
     * 步驟 2: 複雜度分析
     */
    private analyzeComplexity;
    /**
     * 步驟 3: 依賴分析
     */
    private analyzeDependencies;
    /**
     * 步驟 4: 品質分析
     */
    private analyzeQuality;
    /**
     * 步驟 5: 死代碼檢測
     */
    private detectDeadCode;
    /**
     * 步驟 6: 重複代碼檢測
     */
    private detectDuplication;
    /**
     * 步驟 7: 生成報告
     */
    private generateReport;
    /**
     * 驗證輸入格式
     */
    private isValidInput;
    /**
     * 從元數據獲取上下文
     */
    private getContextFromMetadata;
    /**
     * 檢查是否應該執行特定分析
     */
    private shouldRunAnalysis;
    /**
     * 執行索引建立
     */
    private performIndexing;
    /**
     * 執行複雜度分析
     */
    private performComplexityAnalysis;
    /**
     * 執行依賴分析
     */
    private performDependencyAnalysis;
    /**
     * 執行品質分析
     */
    private performQualityAnalysis;
    /**
     * 執行死代碼檢測
     */
    private performDeadCodeDetection;
    /**
     * 執行重複代碼檢測
     */
    private performDuplicationDetection;
    /**
     * 建立分析報告
     */
    private createAnalysisReport;
    /**
     * 生成整體建議
     */
    private generateOverallRecommendations;
    /**
     * 生成行動項目
     */
    private generateActionItems;
}
//# sourceMappingURL=analysis-workflow.d.ts.map