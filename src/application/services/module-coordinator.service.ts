/**
 * ModuleCoordinatorService 模組協調服務實作
 * 負責協調核心模組的操作，提供統一的模組間協調介面
 */

import { BaseError } from '@shared/errors/base-error.js';
import { EventBus } from '@application/events/event-bus.js';
import { StateManager } from '@application/state/state-manager.js';
import { ErrorHandlerService } from '@application/services/error-handler.service.js';
import { EventPriority } from '@application/events/event-types.js';

// 核心模組引入
import { RenameEngine } from '@core/rename/rename-engine.js';
import { MoveService } from '@core/move-file/move-service.js';
import { DependencyAnalyzer } from '@core/dependency/dependency-analyzer.js';
import { IndexEngine } from '@core/indexing/index-engine.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';

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
  private readonly renameEngine: RenameEngine;
  private readonly moveService: MoveService;
  private readonly dependencyAnalyzer: DependencyAnalyzer;
  private readonly indexEngine: IndexEngine;
  private readonly fileSystem: IFileSystem;

  constructor(
    eventBus: EventBus,
    stateManager: StateManager,
    errorHandler: ErrorHandlerService,
    fileSystem: IFileSystem
  ) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.errorHandler = errorHandler;
    this.fileSystem = fileSystem;

    // 初始化模組狀態追蹤
    this.modules = new Map();

    // 初始化核心模組實例
    this.renameEngine = new RenameEngine();
    this.moveService = new MoveService(this.fileSystem);
    this.dependencyAnalyzer = new DependencyAnalyzer(this.fileSystem);
    this.indexEngine = new IndexEngine({} as any, this.fileSystem);

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
      // 執行重構操作
      const changes: CodeChange[] = [];
      let success = true;

      switch (options.type) {
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
              changes.push(...renameResult.operations.map((op) => ({
                filePath: op.filePath,
                oldContent: op.oldText,
                newContent: op.newText,
                range: op.range
              })));
            } else {
              success = false;
            }
          } catch {
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

      // 發送模組協調事件
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
            changes: renameResult.operations.map((op) => ({
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
          importUpdates: moveResult.pathUpdates?.map((update: { filePath: string; oldImport: string; newImport: string }) => ({
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
      { id: 'dependency', name: 'dependency', instance: this.dependencyAnalyzer },
      { id: 'indexing', name: 'indexing', instance: this.indexEngine },
      { id: 'move', name: 'move', instance: this.moveService },
      { id: 'rename', name: 'rename', instance: this.renameEngine }
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
