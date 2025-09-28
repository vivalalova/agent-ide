/**
 * Workflows 模組匯出
 * 提供所有工作流程類別和相關型別的統一匯出
 */

// 基礎工作流程
export { BaseWorkflow, WorkflowError, type StepContext, type WorkflowConfig } from './base-workflow.js';

// 重構工作流程
export {
  RefactorWorkflow,
  type RefactorWorkflowInput,
  type RefactorWorkflowContext,
  type RefactorWorkflowResult
} from './refactor-workflow.js';

// 分析工作流程
export {
  AnalysisWorkflow,
  AnalysisType,
  type AnalysisWorkflowInput,
  type AnalysisWorkflowContext,
  type AnalysisWorkflowResult,
  type AnalysisReport
} from './analysis-workflow.js';

// 工作流程工廠方法
import type { IModuleCoordinatorService } from '../types.js';
import { RefactorWorkflow } from './refactor-workflow.js';
import { AnalysisWorkflow } from './analysis-workflow.js';

/**
 * 工作流程類型枚舉
 */
export enum WorkflowType {
  REFACTOR = 'refactor',
  ANALYSIS = 'analysis'
}

/**
 * 工作流程工廠
 * 提供統一的工作流程建立介面
 */
export class WorkflowFactory {
  private readonly moduleCoordinator: IModuleCoordinatorService;

  constructor(moduleCoordinator: IModuleCoordinatorService) {
    this.moduleCoordinator = moduleCoordinator;
  }

  /**
   * 建立重構工作流程
   */
  public createRefactorWorkflow(): RefactorWorkflow {
    return new RefactorWorkflow(this.moduleCoordinator);
  }

  /**
   * 建立分析工作流程
   */
  public createAnalysisWorkflow(): AnalysisWorkflow {
    return new AnalysisWorkflow(this.moduleCoordinator);
  }

  /**
   * 根據類型建立工作流程
   */
  public createWorkflow(type: WorkflowType): RefactorWorkflow | AnalysisWorkflow {
    switch (type) {
    case WorkflowType.REFACTOR:
      return this.createRefactorWorkflow();
    case WorkflowType.ANALYSIS:
      return this.createAnalysisWorkflow();
    default:
      throw new Error(`不支援的工作流程類型: ${type}`);
    }
  }

  /**
   * 取得所有支援的工作流程類型
   */
  public getSupportedTypes(): WorkflowType[] {
    return Object.values(WorkflowType);
  }
}

/**
 * 工作流程註冊表
 * 用於管理和查詢可用的工作流程
 */
export class WorkflowRegistry {
  private static readonly workflows = new Map<string, {
    type: WorkflowType;
    name: string;
    description: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
  }>();

  static {
    // 註冊內建工作流程
    WorkflowRegistry.register(WorkflowType.REFACTOR, {
      type: WorkflowType.REFACTOR,
      name: '重構工作流程',
      description: '執行程式碼重構操作，包括分析、驗證、執行和結果驗證',
      inputSchema: {
        filePath: 'string',
        options: {
          type: 'extract-function | inline-function | rename',
          selection: 'Range?',
          newName: 'string?',
          preview: 'boolean?'
        }
      },
      outputSchema: {
        success: 'boolean',
        refactorResult: 'RefactorResult',
        analysisData: 'unknown?',
        validationData: 'unknown?',
        error: 'BaseError?'
      }
    });

    WorkflowRegistry.register(WorkflowType.ANALYSIS, {
      type: WorkflowType.ANALYSIS,
      name: '分析工作流程',
      description: '執行程式碼分析，包括複雜度、依賴、品質、死代碼和重複代碼分析',
      inputSchema: {
        target: 'string',
        analysisTypes: 'AnalysisType[]',
        options: {
          includeTests: 'boolean?',
          excludePatterns: 'string[]?',
          outputFormat: 'json | markdown | html?',
          includeRecommendations: 'boolean?',
          detailLevel: 'basic | detailed | comprehensive?'
        }
      },
      outputSchema: {
        success: 'boolean',
        report: 'AnalysisReport',
        rawData: 'unknown?',
        error: 'BaseError?'
      }
    });
  }

  /**
   * 註冊工作流程
   */
  public static register(id: string, workflow: {
    type: WorkflowType;
    name: string;
    description: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
  }): void {
    WorkflowRegistry.workflows.set(id, workflow);
  }

  /**
   * 取得工作流程資訊
   */
  public static get(id: string): {
    type: WorkflowType;
    name: string;
    description: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
  } | undefined {
    return WorkflowRegistry.workflows.get(id);
  }

  /**
   * 取得所有註冊的工作流程
   */
  public static getAll(): Array<{
    id: string;
    type: WorkflowType;
    name: string;
    description: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
  }> {
    const result: Array<{
      id: string;
      type: WorkflowType;
      name: string;
      description: string;
      inputSchema?: unknown;
      outputSchema?: unknown;
    }> = [];

    for (const [id, workflow] of WorkflowRegistry.workflows) {
      result.push({ id, ...workflow });
    }

    return result;
  }

  /**
   * 根據類型取得工作流程
   */
  public static getByType(type: WorkflowType): Array<{
    id: string;
    type: WorkflowType;
    name: string;
    description: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
  }> {
    return WorkflowRegistry.getAll().filter(workflow => workflow.type === type);
  }

  /**
   * 檢查工作流程是否存在
   */
  public static exists(id: string): boolean {
    return WorkflowRegistry.workflows.has(id);
  }

  /**
   * 移除工作流程註冊
   */
  public static unregister(id: string): boolean {
    return WorkflowRegistry.workflows.delete(id);
  }
}

/**
 * 工作流程輔助方法
 */
export class WorkflowUtils {
  /**
   * 驗證工作流程輸入
   */
  public static validateInput(type: WorkflowType, input: unknown): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    switch (type) {
    case WorkflowType.REFACTOR:
      if (!input || typeof input !== 'object') {
        errors.push('輸入必須是物件');
        break;
      }
      const refactorInput = input as any;
      if (!refactorInput.filePath || typeof refactorInput.filePath !== 'string') {
        errors.push('filePath 必須是字串');
      }
      if (!refactorInput.options || typeof refactorInput.options !== 'object') {
        errors.push('options 必須是物件');
      }
      break;

    case WorkflowType.ANALYSIS:
      if (!input || typeof input !== 'object') {
        errors.push('輸入必須是物件');
        break;
      }
      const analysisInput = input as any;
      if (!analysisInput.target || typeof analysisInput.target !== 'string') {
        errors.push('target 必須是字串');
      }
      if (!Array.isArray(analysisInput.analysisTypes)) {
        errors.push('analysisTypes 必須是陣列');
      }
      break;

    default:
      errors.push(`不支援的工作流程類型: ${type}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 格式化工作流程結果
   */
  public static formatResult(type: WorkflowType, result: unknown): string {
    if (!result || typeof result !== 'object') {
      return JSON.stringify(result, null, 2);
    }

    const resultObj = result as any;

    switch (type) {
    case WorkflowType.REFACTOR:
      return `重構結果:\n成功: ${resultObj.success}\n變更數量: ${resultObj.refactorResult?.changes?.length || 0}`;

    case WorkflowType.ANALYSIS:
      const report = resultObj.report;
      return `分析結果:\n目標: ${report?.summary?.target}\n檔案數量: ${report?.summary?.totalFiles}\n分析類型: ${report?.summary?.analysisTypes?.join(', ')}`;

    default:
      return JSON.stringify(result, null, 2);
    }
  }
}