/**
 * RefactorWorkflow 重構工作流程實作
 * 實作重構操作的完整工作流程：分析 → 驗證 → 執行重構 → 驗證結果
 */

import { BaseWorkflow, WorkflowError, type StepContext } from './base-workflow.js';
import { BaseError } from '../../shared/errors/base-error.js';
import type {
  IModuleCoordinatorService,
  RefactorOptions,
  RefactorResult,
  StepResult
} from '../types.js';

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
export class RefactorWorkflow extends BaseWorkflow<RefactorWorkflowContext, RefactorWorkflowResult> {
  constructor(moduleCoordinator: IModuleCoordinatorService) {
    super(
      {
        id: 'refactor-workflow',
        name: 'refactor',
        description: '程式碼重構工作流程',
        timeout: 30000, // 30 秒
        maxRetries: 2,
        enableRollback: true
      },
      moduleCoordinator
    );
  }

  /**
   * 定義重構工作流程步驟
   */
  protected defineSteps(): void {
    // 步驟 1: 檔案分析
    this.addStep(
      this.createStep(
        'analyze-file',
        '分析檔案結構和複雜度',
        this.analyzeFile.bind(this),
        {
          canRetry: true,
          maxRetries: 2
        }
      )
    );

    // 步驟 2: 重構前驗證
    this.addStep(
      this.createStep(
        'pre-validation',
        '驗證重構操作的可行性',
        this.preValidation.bind(this),
        {
          canRetry: true,
          maxRetries: 1
        }
      )
    );

    // 步驟 3: 執行重構
    this.addStep(
      this.createStep(
        'execute-refactor',
        '執行重構操作',
        this.executeRefactor.bind(this),
        {
          rollback: this.rollbackRefactor.bind(this),
          canRetry: false // 重構操作不重試，避免副作用
        }
      )
    );

    // 步驟 4: 重構後驗證
    this.addStep(
      this.createStep(
        'post-validation',
        '驗證重構結果的正確性',
        this.postValidation.bind(this),
        {
          canRetry: true,
          maxRetries: 1
        }
      )
    );
  }

  /**
   * 初始化工作流程上下文
   */
  protected async initializeContext(input: unknown): Promise<RefactorWorkflowContext> {
    if (!this.isValidInput(input)) {
      throw new WorkflowError(
        '無效的重構工作流程輸入',
        { input }
      );
    }

    const refactorInput = input as RefactorWorkflowInput;

    // 讀取原始檔案內容
    let originalContent: string;
    try {
      const fs = await import('fs/promises');
      originalContent = await fs.readFile(refactorInput.filePath, 'utf-8');
    } catch (error) {
      throw new WorkflowError(
        `無法讀取檔案: ${refactorInput.filePath}`,
        { filePath: refactorInput.filePath },
        error as Error
      );
    }

    return {
      filePath: refactorInput.filePath,
      options: refactorInput.options,
      originalContent
    };
  }

  /**
   * 處理工作流程結果
   */
  protected async processResult(context: RefactorWorkflowContext): Promise<RefactorWorkflowResult> {
    if (!context.refactorResult) {
      throw new WorkflowError('重構結果不存在');
    }

    return {
      success: context.refactorResult.success,
      refactorResult: context.refactorResult,
      analysisData: context.analysisResult,
      validationData: context.finalValidationResult
    };
  }

  /**
   * 步驟 1: 分析檔案
   */
  private async analyzeFile(context: StepContext): Promise<StepResult> {
    try {
      const workflowContext = context.previousResults.get('context') as RefactorWorkflowContext ||
                            await this.getContextFromMetadata(context);

      // 使用 ModuleCoordinator 的狀態來獲取模組，但這裡我們直接模擬分析
      const analysisResult = {
        complexity: this.calculateComplexity(workflowContext.originalContent || ''),
        structure: this.analyzeStructure(workflowContext.originalContent || ''),
        dependencies: this.analyzeDependencies(workflowContext.originalContent || ''),
        recommendations: this.generateRecommendations(workflowContext.options)
      };

      workflowContext.analysisResult = analysisResult;

      return this.createSuccessResult(analysisResult);

    } catch (error) {
      return this.createFailureResult(
        new WorkflowError(
          `檔案分析失敗: ${(error as Error).message}`,
          { stepId: context.stepId },
          error as Error
        )
      );
    }
  }

  /**
   * 步驟 2: 重構前驗證
   */
  private async preValidation(context: StepContext): Promise<StepResult> {
    try {
      const workflowContext = await this.getContextFromMetadata(context);
      const analysisResult = context.previousResults.get('analyze-file');

      // 驗證重構操作的可行性
      const validationResult = this.validateRefactorOperation(
        workflowContext.options,
        analysisResult
      );

      if (!validationResult.isValid) {
        return this.createFailureResult(
          new WorkflowError(
            `重構操作驗證失敗: ${validationResult.reason}`,
            { validation: validationResult }
          )
        );
      }

      workflowContext.validationResult = validationResult;

      return this.createSuccessResult(validationResult);

    } catch (error) {
      return this.createFailureResult(
        new WorkflowError(
          `重構前驗證失敗: ${(error as Error).message}`,
          { stepId: context.stepId },
          error as Error
        )
      );
    }
  }

  /**
   * 步驟 3: 執行重構
   */
  private async executeRefactor(context: StepContext): Promise<StepResult> {
    try {
      const workflowContext = await this.getContextFromMetadata(context);

      // 使用 ModuleCoordinator 執行重構
      const refactorResult = await context.moduleCoordinator.analyzeAndRefactor(
        workflowContext.filePath,
        workflowContext.options
      );

      workflowContext.refactorResult = refactorResult;

      if (!refactorResult.success) {
        return this.createFailureResult(
          refactorResult.error || new WorkflowError('重構操作失敗')
        );
      }

      return this.createSuccessResult(refactorResult);

    } catch (error) {
      return this.createFailureResult(
        new WorkflowError(
          `重構執行失敗: ${(error as Error).message}`,
          { stepId: context.stepId },
          error as Error
        )
      );
    }
  }

  /**
   * 步驟 4: 重構後驗證
   */
  private async postValidation(context: StepContext): Promise<StepResult> {
    try {
      const workflowContext = await this.getContextFromMetadata(context);
      const refactorResult = context.previousResults.get('execute-refactor') as RefactorResult;

      if (!refactorResult || !refactorResult.success) {
        return this.createFailureResult(
          new WorkflowError('無法驗證失敗的重構結果')
        );
      }

      // 驗證重構後的程式碼
      const validationResult = await this.validateRefactoredCode(
        workflowContext.filePath,
        refactorResult
      );

      workflowContext.finalValidationResult = validationResult;

      if (!validationResult.isValid) {
        return this.createFailureResult(
          new WorkflowError(
            `重構後驗證失敗: ${validationResult.reason}`,
            { validation: validationResult }
          )
        );
      }

      return this.createSuccessResult(validationResult);

    } catch (error) {
      return this.createFailureResult(
        new WorkflowError(
          `重構後驗證失敗: ${(error as Error).message}`,
          { stepId: context.stepId },
          error as Error
        )
      );
    }
  }

  /**
   * 回滾重構操作
   */
  private async rollbackRefactor(context: StepContext): Promise<void> {
    try {
      const workflowContext = await this.getContextFromMetadata(context);

      if (workflowContext.originalContent && workflowContext.filePath) {
        const fs = await import('fs/promises');
        await fs.writeFile(workflowContext.filePath, workflowContext.originalContent, 'utf-8');
      }
    } catch (error) {
      // 記錄回滾失敗，但不拋出錯誤
      console.error('重構回滾失敗:', error);
    }
  }

  /**
   * 驗證輸入格式
   */
  private isValidInput(input: unknown): input is RefactorWorkflowInput {
    return (
      typeof input === 'object' &&
      input !== null &&
      'filePath' in input &&
      'options' in input &&
      typeof (input as any).filePath === 'string' &&
      typeof (input as any).options === 'object'
    );
  }

  /**
   * 從元數據獲取上下文
   */
  private async getContextFromMetadata(context: StepContext): Promise<RefactorWorkflowContext> {
    // 在實際實作中，這會從工作流程狀態中獲取
    // 目前簡化為從 metadata 中獲取，如果不存在則建立預設上下文
    if (context.metadata.workflowContext) {
      return context.metadata.workflowContext as RefactorWorkflowContext;
    }

    // 提供預設上下文，避免 undefined 錯誤
    return {
      filePath: '',
      options: { type: 'extract-function' }
    };
  }

  /**
   * 計算程式碼複雜度
   */
  private calculateComplexity(content: string): number {
    // 簡化的複雜度計算
    const lines = content.split('\n').length;
    const functions = (content.match(/function\s+\w+|=>\s*{|class\s+\w+/g) || []).length;
    const conditions = (content.match(/if\s*\(|while\s*\(|for\s*\(|switch\s*\(/g) || []).length;

    return Math.round((lines * 0.1 + functions * 2 + conditions * 1.5) * 100) / 100;
  }

  /**
   * 分析程式碼結構
   */
  private analyzeStructure(content: string): unknown {
    return {
      lineCount: content.split('\n').length,
      functionCount: (content.match(/function\s+\w+|=>\s*{/g) || []).length,
      classCount: (content.match(/class\s+\w+/g) || []).length,
      importCount: (content.match(/import\s+.*from/g) || []).length
    };
  }

  /**
   * 分析依賴關係
   */
  private analyzeDependencies(content: string): string[] {
    const imports = content.match(/import\s+.*from\s+['"`]([^'"`]+)['"`]/g) || [];
    return imports.map(imp => {
      const match = imp.match(/from\s+['"`]([^'"`]+)['"`]/);
      return match ? match[1] : '';
    }).filter(Boolean);
  }

  /**
   * 生成重構建議
   */
  private generateRecommendations(options: RefactorOptions): string[] {
    const recommendations: string[] = [];

    switch (options.type) {
      case 'extract-function':
        recommendations.push('確保提取的函式具有單一職責');
        recommendations.push('檢查函式參數數量是否合理');
        break;
      case 'inline-function':
        recommendations.push('確認內聯後不會增加複雜度');
        recommendations.push('檢查是否會造成程式碼重複');
        break;
      case 'rename':
        recommendations.push('確保新名稱符合命名慣例');
        recommendations.push('檢查是否會與現有符號衝突');
        break;
    }

    return recommendations;
  }

  /**
   * 驗證重構操作
   */
  private validateRefactorOperation(options: RefactorOptions, analysisResult: unknown): {
    isValid: boolean;
    reason?: string;
  } {
    // 基本驗證
    if (!options.type) {
      return { isValid: false, reason: '缺少重構類型' };
    }

    switch (options.type) {
      case 'extract-function':
        if (!options.selection || !options.newName) {
          return { isValid: false, reason: '提取函式需要選擇範圍和新函式名稱' };
        }
        break;
      case 'inline-function':
        if (!options.selection) {
          return { isValid: false, reason: '內聯函式需要選擇範圍' };
        }
        break;
      case 'rename':
        if (!options.selection || !options.newName) {
          return { isValid: false, reason: '重新命名需要選擇範圍和新名稱' };
        }
        break;
    }

    return { isValid: true };
  }

  /**
   * 驗證重構後的程式碼
   */
  private async validateRefactoredCode(filePath: string, refactorResult: RefactorResult): Promise<{
    isValid: boolean;
    reason?: string;
  }> {
    try {
      // 檢查重構結果
      if (!refactorResult.success || !refactorResult.changes.length) {
        return { isValid: false, reason: '重構結果無效或無變更' };
      }

      // 簡化的語法檢查
      for (const change of refactorResult.changes) {
        if (!change.newContent || change.newContent.trim().length === 0) {
          return { isValid: false, reason: '重構後的程式碼為空' };
        }

        // 基本語法檢查（簡化）
        const braces = change.newContent.split('{').length - change.newContent.split('}').length;
        if (braces !== 0) {
          return { isValid: false, reason: '重構後的程式碼大括號不匹配' };
        }
      }

      return { isValid: true };

    } catch (error) {
      return { isValid: false, reason: `驗證失敗: ${(error as Error).message}` };
    }
  }
}