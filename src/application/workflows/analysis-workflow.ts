/**
 * AnalysisWorkflow 程式碼分析工作流程實作
 * 實作程式碼分析的完整工作流程：索引 → 複雜度分析 → 依賴分析 → 生成報告
 */

import { BaseWorkflow, WorkflowError, type StepContext } from './base-workflow.js';
import { BaseError } from '@shared/errors/base-error.js';
import type {
  IModuleCoordinatorService,
  StepResult
} from '../types.js';

/**
 * 分析類型枚舉
 */
export enum AnalysisType {
  COMPLEXITY = 'complexity',
  DEPENDENCY = 'dependency',
  QUALITY = 'quality',
  DEAD_CODE = 'dead-code',
  DUPLICATION = 'duplication',
  COMPREHENSIVE = 'comprehensive'
}

/**
 * 分析工作流程輸入
 */
export interface AnalysisWorkflowInput {
  target: string; // 可以是檔案路徑或目錄路徑
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
    hotspots: Array<{ file: string; complexity: number; line?: number }>;
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
    highComplexityFiles: Array<{ file: string; score: number }>;
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
export class AnalysisWorkflow extends BaseWorkflow<AnalysisWorkflowContext, AnalysisWorkflowResult> {
  constructor(moduleCoordinator: IModuleCoordinatorService) {
    super(
      {
        id: 'analysis-workflow',
        name: 'analysis',
        description: '程式碼分析工作流程',
        timeout: 60000, // 60 秒
        maxRetries: 1,
        enableRollback: false // 分析操作不需要回滾
      },
      moduleCoordinator
    );
  }

  /**
   * 定義分析工作流程步驟
   */
  protected defineSteps(): void {
    // 步驟 1: 建立索引
    this.addStep(
      this.createStep(
        'create-index',
        '建立程式碼索引',
        this.createIndex.bind(this),
        {
          canRetry: true,
          maxRetries: 2
        }
      )
    );

    // 步驟 2: 複雜度分析
    this.addStep(
      this.createStep(
        'analyze-complexity',
        '分析程式碼複雜度',
        this.analyzeComplexity.bind(this),
        {
          canRetry: true,
          maxRetries: 1
        }
      )
    );

    // 步驟 3: 依賴分析
    this.addStep(
      this.createStep(
        'analyze-dependencies',
        '分析依賴關係',
        this.analyzeDependencies.bind(this),
        {
          canRetry: true,
          maxRetries: 1
        }
      )
    );

    // 步驟 4: 品質分析
    this.addStep(
      this.createStep(
        'analyze-quality',
        '分析程式碼品質',
        this.analyzeQuality.bind(this),
        {
          canRetry: true,
          maxRetries: 1
        }
      )
    );

    // 步驟 5: 死代碼檢測
    this.addStep(
      this.createStep(
        'detect-dead-code',
        '檢測死代碼',
        this.detectDeadCode.bind(this),
        {
          canRetry: true,
          maxRetries: 1
        }
      )
    );

    // 步驟 6: 重複代碼檢測
    this.addStep(
      this.createStep(
        'detect-duplication',
        '檢測重複代碼',
        this.detectDuplication.bind(this),
        {
          canRetry: true,
          maxRetries: 1
        }
      )
    );

    // 步驟 7: 生成報告
    this.addStep(
      this.createStep(
        'generate-report',
        '生成分析報告',
        this.generateReport.bind(this),
        {
          canRetry: false // 報告生成不重試
        }
      )
    );
  }

  /**
   * 初始化工作流程上下文
   */
  protected async initializeContext(input: unknown): Promise<AnalysisWorkflowContext> {
    if (!this.isValidInput(input)) {
      throw new WorkflowError(
        '無效的分析工作流程輸入',
        { input }
      );
    }

    const analysisInput = input as AnalysisWorkflowInput;

    // 設定預設選項
    const defaultOptions = {
      includeTests: false,
      excludePatterns: ['node_modules', '.git', 'dist', 'build'],
      outputFormat: 'json' as const,
      includeRecommendations: true,
      detailLevel: 'detailed' as const
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
  protected async processResult(context: AnalysisWorkflowContext): Promise<AnalysisWorkflowResult> {
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
  private async createIndex(context: StepContext): Promise<StepResult> {
    try {
      const workflowContext = await this.getContextFromMetadata(context);

      // 模擬索引建立過程
      const indexResult = await this.performIndexing(workflowContext.target, workflowContext.options);

      workflowContext.indexResult = indexResult;

      return this.createSuccessResult(indexResult);

    } catch (error) {
      return this.createFailureResult(
        new WorkflowError(
          `索引建立失敗: ${(error as Error).message}`,
          { stepId: context.stepId },
          error as Error
        )
      );
    }
  }

  /**
   * 步驟 2: 複雜度分析
   */
  private async analyzeComplexity(context: StepContext): Promise<StepResult> {
    try {
      const workflowContext = await this.getContextFromMetadata(context);

      if (!this.shouldRunAnalysis(AnalysisType.COMPLEXITY, workflowContext.analysisTypes)) {
        return this.createSuccessResult({ skipped: true });
      }

      const complexityResult = await this.performComplexityAnalysis(
        workflowContext.target,
        workflowContext.indexResult!
      );

      workflowContext.complexityResult = complexityResult;

      return this.createSuccessResult(complexityResult);

    } catch (error) {
      return this.createFailureResult(
        new WorkflowError(
          `複雜度分析失敗: ${(error as Error).message}`,
          { stepId: context.stepId },
          error as Error
        )
      );
    }
  }

  /**
   * 步驟 3: 依賴分析
   */
  private async analyzeDependencies(context: StepContext): Promise<StepResult> {
    try {
      const workflowContext = await this.getContextFromMetadata(context);

      if (!this.shouldRunAnalysis(AnalysisType.DEPENDENCY, workflowContext.analysisTypes)) {
        return this.createSuccessResult({ skipped: true });
      }

      const dependencyResult = await this.performDependencyAnalysis(
        workflowContext.target,
        workflowContext.indexResult!
      );

      workflowContext.dependencyResult = dependencyResult;

      return this.createSuccessResult(dependencyResult);

    } catch (error) {
      return this.createFailureResult(
        new WorkflowError(
          `依賴分析失敗: ${(error as Error).message}`,
          { stepId: context.stepId },
          error as Error
        )
      );
    }
  }

  /**
   * 步驟 4: 品質分析
   */
  private async analyzeQuality(context: StepContext): Promise<StepResult> {
    try {
      const workflowContext = await this.getContextFromMetadata(context);

      if (!this.shouldRunAnalysis(AnalysisType.QUALITY, workflowContext.analysisTypes)) {
        return this.createSuccessResult({ skipped: true });
      }

      const qualityResult = await this.performQualityAnalysis(
        workflowContext.target,
        workflowContext.indexResult!
      );

      workflowContext.qualityResult = qualityResult;

      return this.createSuccessResult(qualityResult);

    } catch (error) {
      return this.createFailureResult(
        new WorkflowError(
          `品質分析失敗: ${(error as Error).message}`,
          { stepId: context.stepId },
          error as Error
        )
      );
    }
  }

  /**
   * 步驟 5: 死代碼檢測
   */
  private async detectDeadCode(context: StepContext): Promise<StepResult> {
    try {
      const workflowContext = await this.getContextFromMetadata(context);

      if (!this.shouldRunAnalysis(AnalysisType.DEAD_CODE, workflowContext.analysisTypes)) {
        return this.createSuccessResult({ skipped: true });
      }

      const deadCodeResult = await this.performDeadCodeDetection(
        workflowContext.target,
        workflowContext.indexResult!
      );

      workflowContext.deadCodeResult = deadCodeResult;

      return this.createSuccessResult(deadCodeResult);

    } catch (error) {
      return this.createFailureResult(
        new WorkflowError(
          `死代碼檢測失敗: ${(error as Error).message}`,
          { stepId: context.stepId },
          error as Error
        )
      );
    }
  }

  /**
   * 步驟 6: 重複代碼檢測
   */
  private async detectDuplication(context: StepContext): Promise<StepResult> {
    try {
      const workflowContext = await this.getContextFromMetadata(context);

      if (!this.shouldRunAnalysis(AnalysisType.DUPLICATION, workflowContext.analysisTypes)) {
        return this.createSuccessResult({ skipped: true });
      }

      const duplicationResult = await this.performDuplicationDetection(
        workflowContext.target,
        workflowContext.indexResult!
      );

      workflowContext.duplicationResult = duplicationResult;

      return this.createSuccessResult(duplicationResult);

    } catch (error) {
      return this.createFailureResult(
        new WorkflowError(
          `重複代碼檢測失敗: ${(error as Error).message}`,
          { stepId: context.stepId },
          error as Error
        )
      );
    }
  }

  /**
   * 步驟 7: 生成報告
   */
  private async generateReport(context: StepContext): Promise<StepResult> {
    try {
      const workflowContext = await this.getContextFromMetadata(context);

      const report = this.createAnalysisReport(workflowContext);

      return this.createSuccessResult(report);

    } catch (error) {
      return this.createFailureResult(
        new WorkflowError(
          `報告生成失敗: ${(error as Error).message}`,
          { stepId: context.stepId },
          error as Error
        )
      );
    }
  }

  /**
   * 驗證輸入格式
   */
  private isValidInput(input: unknown): input is AnalysisWorkflowInput {
    return (
      typeof input === 'object' &&
      input !== null &&
      'target' in input &&
      'analysisTypes' in input &&
      typeof (input as any).target === 'string' &&
      Array.isArray((input as any).analysisTypes)
    );
  }

  /**
   * 從元數據獲取上下文
   */
  private async getContextFromMetadata(context: StepContext): Promise<AnalysisWorkflowContext> {
    return context.metadata.workflowContext as AnalysisWorkflowContext;
  }

  /**
   * 檢查是否應該執行特定分析
   */
  private shouldRunAnalysis(analysisType: AnalysisType, requestedTypes: AnalysisType[]): boolean {
    return requestedTypes.includes(analysisType) || requestedTypes.includes(AnalysisType.COMPREHENSIVE);
  }

  /**
   * 執行索引建立
   */
  private async performIndexing(target: string, options: any): Promise<any> {
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
  private async performComplexityAnalysis(target: string, indexResult: any): Promise<any> {
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
  private async performDependencyAnalysis(target: string, indexResult: any): Promise<any> {
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
  private async performQualityAnalysis(target: string, indexResult: any): Promise<any> {
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
  private async performDeadCodeDetection(target: string, indexResult: any): Promise<any> {
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
  private async performDuplicationDetection(target: string, indexResult: any): Promise<any> {
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
  private createAnalysisReport(context: AnalysisWorkflowContext): AnalysisReport {
    const summary = {
      target: context.target,
      analysisTypes: context.analysisTypes,
      totalFiles: context.indexResult?.totalFiles || 0,
      analysisDate: new Date().toISOString(),
      duration: 0 // 實際實作中會計算
    };

    const report: AnalysisReport = {
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
  private generateOverallRecommendations(context: AnalysisWorkflowContext): string[] {
    const recommendations: string[] = [];

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
  private generateActionItems(context: AnalysisWorkflowContext): Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    description: string;
    effort: 'low' | 'medium' | 'high';
  }> {
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