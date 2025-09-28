/**
 * ModuleCoordinatorService 模組協調服務實作
 * 負責協調 7 個核心模組的操作，提供統一的模組間協調介面
 */

import { BaseError } from '../../shared/errors/base-error.js';
import { EventBus } from '../events/event-bus.js';
import { StateManager } from '../state/state-manager.js';
import { ErrorHandlerService } from './error-handler.service.js';
import { EventPriority } from '../events/event-types.js';

// 核心模組引入
import { ComplexityAnalyzer } from '../../core/analysis/complexity-analyzer.js';
import { FunctionExtractor } from '../../core/refactor/extract-function.js';
import { InlineAnalyzer } from '../../core/refactor/inline-function.js';
import { RenameEngine } from '../../core/rename/rename-engine.js';
import { MoveService } from '../../core/move/move-service.js';
import { DependencyAnalyzer } from '../../core/dependency/dependency-analyzer.js';
import { SearchService } from '../../core/search/service.js';
import { IndexEngine } from '../../core/indexing/index-engine.js';

import type {
  IModuleCoordinatorService,
  ModuleStatus,
  RefactorOptions,
  RefactorResult,
  RenameOperation,
  RenameResult,
  MoveResult,
  CodeChange,
  ErrorContext
} from '../types.js';

/**
 * 模組協調器錯誤
 */
export class ModuleCoordinatorError extends BaseError {
  constructor(message: string, details?: Record<string, unknown>, cause?: Error) {
    super('MODULE_COORDINATOR_ERROR', message, details, cause);
  }
}

/**
 * 模組狀態介面
 */
interface CoreModule {
  name: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  lastActivity?: Date;
  errorCount: number;
  instance?: unknown;
}

/**
 * ModuleCoordinatorService 實作
 */
export class ModuleCoordinatorService implements IModuleCoordinatorService {
  private readonly eventBus: EventBus;
  private readonly stateManager: StateManager;
  private readonly errorHandler: ErrorHandlerService;
  private readonly modules: Map<string, CoreModule>;

  // 核心模組實例
  private readonly complexityAnalyzer: ComplexityAnalyzer;
  private readonly functionExtractor: FunctionExtractor;
  private readonly inlineAnalyzer: InlineAnalyzer;
  private readonly renameEngine: RenameEngine;
  private readonly moveService: MoveService;
  private readonly dependencyAnalyzer: DependencyAnalyzer;
  private readonly searchService: SearchService;
  private readonly indexEngine: IndexEngine;

  constructor(
    eventBus: EventBus,
    stateManager: StateManager,
    errorHandler: ErrorHandlerService
  ) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.errorHandler = errorHandler;

    // 初始化模組狀態追蹤
    this.modules = new Map();

    // 初始化核心模組實例
    this.complexityAnalyzer = new ComplexityAnalyzer();
    this.functionExtractor = new FunctionExtractor();
    this.inlineAnalyzer = new InlineAnalyzer();
    this.renameEngine = new RenameEngine();
    this.moveService = new MoveService();
    this.dependencyAnalyzer = new DependencyAnalyzer();
    this.searchService = new SearchService();
    this.indexEngine = new IndexEngine({} as any);

    // 註冊所有模組
    this.registerModules();
  }

  /**
   * 分析並重構
   */
  async analyzeAndRefactor(filePath: string, options: RefactorOptions): Promise<RefactorResult> {
    const context: ErrorContext = {
      module: 'module-coordinator',
      operation: 'analyzeAndRefactor',
      parameters: { filePath, options },
      timestamp: new Date()
    };

    try {
      // 1. 分析檔案複雜度
      const code = await this.readFile(filePath);
      const analysisResult = await this.complexityAnalyzer.analyzeCode(code);

      // 2. 執行重構操作
      const changes: CodeChange[] = [];
      let success = true;

      switch (options.type) {
      case 'extract-function':
        if (options.selection && options.newName) {
          try {
            const code = await this.readFileContent(filePath);
            const extractResult = await this.functionExtractor.extract(
              code,
              options.selection,
              {
                functionName: options.newName,
                generateComments: true,
                preserveFormatting: true,
                validateExtraction: true
              }
            );
            if (extractResult.success && extractResult.edits) {
              // 轉換 edits 為 CodeChange 格式
              changes.push(...extractResult.edits.map(edit => ({
                filePath,
                oldContent: code,
                newContent: edit.newText,
                range: {
                  start: {
                    line: edit.range.start.line,
                    column: edit.range.start.column,
                    offset: 0
                  },
                  end: {
                    line: edit.range.end.line,
                    column: edit.range.end.column,
                    offset: 0
                  }
                }
              })));
            } else {
              success = false;
            }
          } catch (extractError) {
            success = false;
          }
        } else {
          success = false;
        }
        break;

      case 'inline-function':
        if (options.selection) {
          try {
            const code = await this.readFileContent(filePath);
            // InlineAnalyzer 主要用於分析，我們需要實際的內聯邏輯
            // 這裡簡化處理，需要先找到函式定義和調用
            const functionDef = { name: 'temp', body: '', parameters: [], range: options.selection } as any;
            const functionCalls: any[] = [];
            const canInline = this.inlineAnalyzer.analyze(functionDef, functionCalls);
            if (canInline.canInline) {
              changes.push({
                filePath,
                oldContent: code,
                newContent: code // 簡化實作
              });
            } else {
              success = false;
            }
          } catch (inlineError) {
            success = false;
          }
        } else {
          success = false;
        }
        break;

      case 'rename':
        if (options.selection && options.newName) {
          try {
            const renameResult = await this.renameEngine.rename({
              symbol: {} as any,
              newName: options.newName,
              filePaths: [filePath],
              position: {
                line: options.selection.start.line,
                column: options.selection.start.column,
                offset: 0
              }
            });
            if (renameResult.success && renameResult.operations) {
              changes.push(...renameResult.operations.map(op => ({
                filePath: op.filePath,
                oldContent: op.oldText,
                newContent: op.newText,
                range: op.range
              })));
            } else {
              success = false;
            }
          } catch (renameError) {
            success = false;
          }
        } else {
          success = false;
        }
        break;

      default:
        throw new ModuleCoordinatorError(
          `不支援的重構類型: ${options.type}`,
          { refactorType: options.type }
        );
      }

      // 3. 發送模組協調事件
      await this.emitModuleEvent('refactor-completed', {
        filePath,
        refactorType: options.type,
        success,
        changesCount: changes.length
      });

      return {
        success,
        changes,
        preview: options.preview ? this.generatePreview(changes) : undefined
      };

    } catch (error) {
      const handledError = await this.errorHandler.handle(error as Error, context);

      return {
        success: false,
        changes: [],
        error: handledError
      };
    }
  }

  /**
   * 批次重新命名操作
   */
  async batchRename(operations: RenameOperation[]): Promise<RenameResult[]> {
    const results: RenameResult[] = [];

    for (const operation of operations) {
      const context: ErrorContext = {
        module: 'module-coordinator',
        operation: 'batchRename',
        parameters: { operation },
        timestamp: new Date()
      };

      try {
        const renameResult = await this.renameEngine.rename({
          symbol: {} as any,
          newName: operation.newName,
          filePaths: [operation.filePath],
          position: operation.position
        });

        // 確保 renameResult 符合預期格式
        if (renameResult && typeof renameResult === 'object') {
          results.push({
            success: renameResult.success,
            filesChanged: renameResult.affectedFiles.length,
            changes: renameResult.operations.map(op => ({
              filePath: op.filePath,
              oldContent: op.oldText,
              newContent: op.newText,
              range: op.range
            }))
          });
        } else {
          results.push({
            success: false,
            filesChanged: 0,
            changes: [],
            error: new ModuleCoordinatorError('重新命名操作返回無效結果')
          });
        }

      } catch (error) {
        const handledError = await this.errorHandler.handle(error as Error, context);

        results.push({
          success: false,
          filesChanged: 0,
          changes: [],
          error: handledError
        });
      }
    }

    // 發送批次操作完成事件
    await this.emitModuleEvent('batch-rename-completed', {
      totalOperations: operations.length,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length
    });

    return results;
  }

  /**
   * 智能移動功能（分析依賴後移動）
   */
  async smartMove(source: string, target: string): Promise<MoveResult> {
    const context: ErrorContext = {
      module: 'module-coordinator',
      operation: 'smartMove',
      parameters: { source, target },
      timestamp: new Date()
    };

    try {
      // 1. 分析移動影響
      const dependencyResult = await this.dependencyAnalyzer.analyzeFile(source);

      // 2. 執行移動操作
      const moveResult = await this.moveService.moveFile({ source, target });

      // 3. 確保 moveResult 格式正確
      if (moveResult && typeof moveResult === 'object') {
        // 發送智能移動事件
        await this.emitModuleEvent('smart-move-completed', {
          source,
          target,
          success: moveResult.success,
          dependenciesAnalyzed: dependencyResult?.dependencies?.length || 0
        });

        return {
          success: moveResult.success,
          from: source,
          to: target,
          filesUpdated: moveResult.pathUpdates?.length || 0,
          importUpdates: moveResult.pathUpdates?.map(update => ({
            filePath: update.filePath,
            oldContent: update.oldImport,
            newContent: update.newImport
          })) || [],
          error: moveResult.error ? new ModuleCoordinatorError(moveResult.error) : undefined
        };
      } else {
        return {
          success: false,
          from: source,
          to: target,
          filesUpdated: 0,
          importUpdates: [],
          error: new ModuleCoordinatorError('移動操作返回無效結果')
        };
      }

    } catch (error) {
      const handledError = await this.errorHandler.handle(error as Error, context);

      return {
        success: false,
        from: source,
        to: target,
        filesUpdated: 0,
        importUpdates: [],
        error: handledError
      };
    }
  }

  /**
   * 取得模組狀態
   */
  async getModuleStatus(): Promise<ModuleStatus[]> {
    const statuses: ModuleStatus[] = [];

    for (const [moduleId, module] of this.modules) {
      statuses.push({
        moduleId,
        name: module.name,
        status: module.status,
        lastActivity: module.lastActivity,
        errorCount: module.errorCount,
        metadata: {
          instanceType: module.instance?.constructor.name || 'unknown'
        }
      });
    }

    // 發送狀態查詢事件
    await this.emitModuleEvent('status-queried', {
      moduleCount: statuses.length,
      readyModules: statuses.filter(s => s.status === 'ready').length
    });

    return statuses;
  }

  /**
   * 註冊所有核心模組
   */
  private registerModules(): void {
    const moduleConfigs = [
      { id: 'analysis', name: 'analysis', instance: this.complexityAnalyzer },
      { id: 'dependency', name: 'dependency', instance: this.dependencyAnalyzer },
      { id: 'indexing', name: 'indexing', instance: this.indexEngine },
      { id: 'move', name: 'move', instance: this.moveService },
      { id: 'refactor', name: 'refactor', instance: this.functionExtractor },
      { id: 'rename', name: 'rename', instance: this.renameEngine },
      { id: 'search', name: 'search', instance: this.searchService }
    ];

    for (const config of moduleConfigs) {
      this.modules.set(config.id, {
        name: config.name,
        status: 'ready',
        lastActivity: new Date(),
        errorCount: 0,
        instance: config.instance
      });
    }
  }

  /**
   * 讀取檔案內容
   */
  private async readFile(filePath: string): Promise<string> {
    const fs = await import('fs/promises');
    return await fs.readFile(filePath, 'utf-8');
  }


  /**
   * 發送模組事件
   */
  private async emitModuleEvent(eventType: string, data: unknown): Promise<void> {
    try {
      await this.eventBus.emit({
        type: 'module-event',
        timestamp: new Date(),
        priority: EventPriority.NORMAL,
        payload: {
          moduleId: 'module-coordinator',
          eventType,
          data
        }
      });
    } catch (error) {
      // 避免在事件發送時產生無限錯誤迴圈
      if (process.env.NODE_ENV !== 'test') {
        console.error('Failed to emit module event:', error);
      }
    }
  }

  /**
   * 讀取檔案內容（別名方法）
   */
  private async readFileContent(filePath: string): Promise<string> {
    return this.readFile(filePath);
  }

  /**
   * 生成預覽內容
   */
  private generatePreview(changes: CodeChange[]): string {
    if (changes.length === 0) {
      return '無變更';
    }

    const previews = changes.map(change =>
      `檔案: ${change.filePath}\n變更:\n${change.newContent.slice(0, 200)}...`
    );

    return previews.join('\n\n');
  }
}