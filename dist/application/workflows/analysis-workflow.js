/**
 * AnalysisWorkflow 程式碼分析工作流程實作
 * 實作程式碼分析的完整工作流程：索引 → 複雜度分析 → 依賴分析 → 生成報告
 */
import { BaseWorkflow, WorkflowError } from './base-workflow.js';
/**
 * 分析類型枚舉
 */
export var AnalysisType;
(function (AnalysisType) {
    AnalysisType["COMPLEXITY"] = "complexity";
    AnalysisType["DEPENDENCY"] = "dependency";
    AnalysisType["QUALITY"] = "quality";
    AnalysisType["DEAD_CODE"] = "dead-code";
    AnalysisType["DUPLICATION"] = "duplication";
    AnalysisType["COMPREHENSIVE"] = "comprehensive";
})(AnalysisType || (AnalysisType = {}));
/**
 * AnalysisWorkflow 實作
 */
export class AnalysisWorkflow extends BaseWorkflow {
    constructor(moduleCoordinator) {
        super({
            id: 'analysis-workflow',
            name: 'analysis',
            description: '程式碼分析工作流程',
            timeout: 60000, // 60 秒
            maxRetries: 1,
            enableRollback: false // 分析操作不需要回滾
        }, moduleCoordinator);
    }
    /**
     * 定義分析工作流程步驟
     */
    defineSteps() {
        // 步驟 1: 建立索引
        this.addStep(this.createStep('create-index', '建立程式碼索引', this.createIndex.bind(this), {
            canRetry: true,
            maxRetries: 2
        }));
        // 步驟 2: 複雜度分析
        this.addStep(this.createStep('analyze-complexity', '分析程式碼複雜度', this.analyzeComplexity.bind(this), {
            canRetry: true,
            maxRetries: 1
        }));
        // 步驟 3: 依賴分析
        this.addStep(this.createStep('analyze-dependencies', '分析依賴關係', this.analyzeDependencies.bind(this), {
            canRetry: true,
            maxRetries: 1
        }));
        // 步驟 4: 品質分析
        this.addStep(this.createStep('analyze-quality', '分析程式碼品質', this.analyzeQuality.bind(this), {
            canRetry: true,
            maxRetries: 1
        }));
        // 步驟 5: 死代碼檢測
        this.addStep(this.createStep('detect-dead-code', '檢測死代碼', this.detectDeadCode.bind(this), {
            canRetry: true,
            maxRetries: 1
        }));
        // 步驟 6: 重複代碼檢測
        this.addStep(this.createStep('detect-duplication', '檢測重複代碼', this.detectDuplication.bind(this), {
            canRetry: true,
            maxRetries: 1
        }));
        // 步驟 7: 生成報告
        this.addStep(this.createStep('generate-report', '生成分析報告', this.generateReport.bind(this), {
            canRetry: false // 報告生成不重試
        }));
    }
    /**
     * 初始化工作流程上下文
     */
    async initializeContext(input) {
        if (!this.isValidInput(input)) {
            throw new WorkflowError('無效的分析工作流程輸入', { input });
        }
        const analysisInput = input;
        // 設定預設選項
        const defaultOptions = {
            includeTests: false,
            excludePatterns: ['node_modules', '.git', 'dist', 'build'],
            outputFormat: 'json',
            includeRecommendations: true,
            detailLevel: 'detailed'
        };
        return {
            target: analysisInput.target,
            analysisTypes: analysisInput.analysisTypes,
            options: { ...defaultOptions, ...analysisInput.options }
        };
    }
    /**
     * 處理工作流程結果
     */
    async processResult(context) {
        // 從上下文獲取報告（應該在 generate-report 步驟中設定）
        const report = this.createAnalysisReport(context);
        return {
            success: true,
            report,
            rawData: {
                complexity: context.complexityResult,
                dependencies: context.dependencyResult,
                quality: context.qualityResult,
                deadCode: context.deadCodeResult,
                duplication: context.duplicationResult
            }
        };
    }
    /**
     * 步驟 1: 建立索引
     */
    async createIndex(context) {
        try {
            const workflowContext = await this.getContextFromMetadata(context);
            // 模擬索引建立過程
            const indexResult = await this.performIndexing(workflowContext.target, workflowContext.options);
            workflowContext.indexResult = indexResult;
            return this.createSuccessResult(indexResult);
        }
        catch (error) {
            return this.createFailureResult(new WorkflowError(`索引建立失敗: ${error.message}`, { stepId: context.stepId }, error));
        }
    }
    /**
     * 步驟 2: 複雜度分析
     */
    async analyzeComplexity(context) {
        try {
            const workflowContext = await this.getContextFromMetadata(context);
            if (!this.shouldRunAnalysis(AnalysisType.COMPLEXITY, workflowContext.analysisTypes)) {
                return this.createSuccessResult({ skipped: true });
            }
            const complexityResult = await this.performComplexityAnalysis(workflowContext.target, workflowContext.indexResult);
            workflowContext.complexityResult = complexityResult;
            return this.createSuccessResult(complexityResult);
        }
        catch (error) {
            return this.createFailureResult(new WorkflowError(`複雜度分析失敗: ${error.message}`, { stepId: context.stepId }, error));
        }
    }
    /**
     * 步驟 3: 依賴分析
     */
    async analyzeDependencies(context) {
        try {
            const workflowContext = await this.getContextFromMetadata(context);
            if (!this.shouldRunAnalysis(AnalysisType.DEPENDENCY, workflowContext.analysisTypes)) {
                return this.createSuccessResult({ skipped: true });
            }
            const dependencyResult = await this.performDependencyAnalysis(workflowContext.target, workflowContext.indexResult);
            workflowContext.dependencyResult = dependencyResult;
            return this.createSuccessResult(dependencyResult);
        }
        catch (error) {
            return this.createFailureResult(new WorkflowError(`依賴分析失敗: ${error.message}`, { stepId: context.stepId }, error));
        }
    }
    /**
     * 步驟 4: 品質分析
     */
    async analyzeQuality(context) {
        try {
            const workflowContext = await this.getContextFromMetadata(context);
            if (!this.shouldRunAnalysis(AnalysisType.QUALITY, workflowContext.analysisTypes)) {
                return this.createSuccessResult({ skipped: true });
            }
            const qualityResult = await this.performQualityAnalysis(workflowContext.target, workflowContext.indexResult);
            workflowContext.qualityResult = qualityResult;
            return this.createSuccessResult(qualityResult);
        }
        catch (error) {
            return this.createFailureResult(new WorkflowError(`品質分析失敗: ${error.message}`, { stepId: context.stepId }, error));
        }
    }
    /**
     * 步驟 5: 死代碼檢測
     */
    async detectDeadCode(context) {
        try {
            const workflowContext = await this.getContextFromMetadata(context);
            if (!this.shouldRunAnalysis(AnalysisType.DEAD_CODE, workflowContext.analysisTypes)) {
                return this.createSuccessResult({ skipped: true });
            }
            const deadCodeResult = await this.performDeadCodeDetection(workflowContext.target, workflowContext.indexResult);
            workflowContext.deadCodeResult = deadCodeResult;
            return this.createSuccessResult(deadCodeResult);
        }
        catch (error) {
            return this.createFailureResult(new WorkflowError(`死代碼檢測失敗: ${error.message}`, { stepId: context.stepId }, error));
        }
    }
    /**
     * 步驟 6: 重複代碼檢測
     */
    async detectDuplication(context) {
        try {
            const workflowContext = await this.getContextFromMetadata(context);
            if (!this.shouldRunAnalysis(AnalysisType.DUPLICATION, workflowContext.analysisTypes)) {
                return this.createSuccessResult({ skipped: true });
            }
            const duplicationResult = await this.performDuplicationDetection(workflowContext.target, workflowContext.indexResult);
            workflowContext.duplicationResult = duplicationResult;
            return this.createSuccessResult(duplicationResult);
        }
        catch (error) {
            return this.createFailureResult(new WorkflowError(`重複代碼檢測失敗: ${error.message}`, { stepId: context.stepId }, error));
        }
    }
    /**
     * 步驟 7: 生成報告
     */
    async generateReport(context) {
        try {
            const workflowContext = await this.getContextFromMetadata(context);
            const report = this.createAnalysisReport(workflowContext);
            return this.createSuccessResult(report);
        }
        catch (error) {
            return this.createFailureResult(new WorkflowError(`報告生成失敗: ${error.message}`, { stepId: context.stepId }, error));
        }
    }
    /**
     * 驗證輸入格式
     */
    isValidInput(input) {
        return (typeof input === 'object' &&
            input !== null &&
            'target' in input &&
            'analysisTypes' in input &&
            typeof input.target === 'string' &&
            Array.isArray(input.analysisTypes));
    }
    /**
     * 從元數據獲取上下文
     */
    async getContextFromMetadata(context) {
        return context.metadata.workflowContext;
    }
    /**
     * 檢查是否應該執行特定分析
     */
    shouldRunAnalysis(analysisType, requestedTypes) {
        return requestedTypes.includes(analysisType) || requestedTypes.includes(AnalysisType.COMPREHENSIVE);
    }
    /**
     * 執行索引建立
     */
    async performIndexing(target, options) {
        // 模擬索引建立
        await this.sleep(100);
        return {
            totalFiles: 50,
            indexedFiles: [`${target}/file1.ts`, `${target}/file2.ts`],
            symbols: [],
            dependencies: []
        };
    }
    /**
     * 執行複雜度分析
     */
    async performComplexityAnalysis(target, indexResult) {
        await this.sleep(200);
        return {
            overallComplexity: 7.5,
            fileComplexities: new Map([
                [`${target}/file1.ts`, 5.2],
                [`${target}/file2.ts`, 9.8]
            ]),
            hotspots: [
                { file: `${target}/file2.ts`, complexity: 9.8, line: 45 }
            ]
        };
    }
    /**
     * 執行依賴分析
     */
    async performDependencyAnalysis(target, indexResult) {
        await this.sleep(150);
        return {
            dependencies: [],
            circularDependencies: [],
            dependencyGraph: {},
            metrics: { depth: 3, breadth: 12 }
        };
    }
    /**
     * 執行品質分析
     */
    async performQualityAnalysis(target, indexResult) {
        await this.sleep(250);
        return {
            codeSmells: [],
            suggestions: ['Consider extracting large functions', 'Reduce complexity'],
            metrics: { maintainabilityIndex: 78 }
        };
    }
    /**
     * 執行死代碼檢測
     */
    async performDeadCodeDetection(target, indexResult) {
        await this.sleep(180);
        return {
            deadFunctions: [],
            deadVariables: [],
            deadImports: []
        };
    }
    /**
     * 執行重複代碼檢測
     */
    async performDuplicationDetection(target, indexResult) {
        await this.sleep(220);
        return {
            duplicatedBlocks: [],
            duplicationRate: 0.15,
            suggestions: ['Extract common functionality']
        };
    }
    /**
     * 建立分析報告
     */
    createAnalysisReport(context) {
        const summary = {
            target: context.target,
            analysisTypes: context.analysisTypes,
            totalFiles: context.indexResult?.totalFiles || 0,
            analysisDate: new Date().toISOString(),
            duration: 0 // 實際實作中會計算
        };
        const report = {
            summary,
            recommendations: [],
            actionItems: []
        };
        // 根據執行的分析添加對應的報告部分
        if (context.complexityResult) {
            report.complexity = {
                overallScore: context.complexityResult.overallComplexity,
                averageComplexity: context.complexityResult.overallComplexity,
                highComplexityFiles: context.complexityResult.hotspots.map(h => ({
                    file: h.file,
                    score: h.complexity
                })),
                recommendations: ['重構高複雜度函式', '考慮拆分大型類別']
            };
        }
        if (context.dependencyResult) {
            report.dependencies = {
                totalDependencies: 0,
                circularDependencies: 0,
                dependencyDepth: 3,
                recommendations: ['解決循環依賴', '減少依賴深度']
            };
        }
        // 生成總體建議和行動項目
        report.recommendations = this.generateOverallRecommendations(context);
        report.actionItems = this.generateActionItems(context);
        return report;
    }
    /**
     * 生成整體建議
     */
    generateOverallRecommendations(context) {
        const recommendations = [];
        if (context.complexityResult?.overallComplexity && context.complexityResult.overallComplexity > 8) {
            recommendations.push('整體程式碼複雜度偏高，建議進行重構');
        }
        if (context.duplicationResult?.duplicationRate && context.duplicationResult.duplicationRate > 0.1) {
            recommendations.push('重複程式碼比率偏高，建議提取共用功能');
        }
        return recommendations;
    }
    /**
     * 生成行動項目
     */
    generateActionItems(context) {
        return [
            {
                priority: 'high',
                category: 'complexity',
                description: '重構高複雜度函式',
                effort: 'medium'
            },
            {
                priority: 'medium',
                category: 'duplication',
                description: '提取重複程式碼',
                effort: 'low'
            }
        ];
    }
}
//# sourceMappingURL=analysis-workflow.js.map