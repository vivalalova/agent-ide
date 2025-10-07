/**
 * ModuleCoordinatorService 模組協調服務實作
 * 負責協調 7 個核心模組的操作，提供統一的模組間協調介面
 */
import { BaseError } from '../../shared/errors/base-error.js';
import { EventBus } from '../events/event-bus.js';
import { StateManager } from '../state/state-manager.js';
import { ErrorHandlerService } from './error-handler.service.js';
import type { IModuleCoordinatorService, ModuleStatus, RefactorOptions, RefactorResult, RenameOperation, RenameResult, MoveResult } from '../types.js';
/**
 * 模組協調器錯誤
 */
export declare class ModuleCoordinatorError extends BaseError {
    constructor(message: string, details?: Record<string, unknown>, cause?: Error);
}
/**
 * ModuleCoordinatorService 實作
 */
export declare class ModuleCoordinatorService implements IModuleCoordinatorService {
    private readonly eventBus;
    private readonly stateManager;
    private readonly errorHandler;
    private readonly modules;
    private readonly complexityAnalyzer;
    private readonly functionExtractor;
    private readonly inlineAnalyzer;
    private readonly renameEngine;
    private readonly moveService;
    private readonly dependencyAnalyzer;
    private readonly searchService;
    private readonly indexEngine;
    constructor(eventBus: EventBus, stateManager: StateManager, errorHandler: ErrorHandlerService);
    /**
     * 分析並重構
     */
    analyzeAndRefactor(filePath: string, options: RefactorOptions): Promise<RefactorResult>;
    /**
     * 批次重新命名操作
     */
    batchRename(operations: RenameOperation[]): Promise<RenameResult[]>;
    /**
     * 智能移動功能（分析依賴後移動）
     */
    smartMove(source: string, target: string): Promise<MoveResult>;
    /**
     * 取得模組狀態
     */
    getModuleStatus(): Promise<ModuleStatus[]>;
    /**
     * 註冊所有核心模組
     */
    private registerModules;
    /**
     * 讀取檔案內容
     */
    private readFile;
    /**
     * 發送模組事件
     */
    private emitModuleEvent;
    /**
     * 讀取檔案內容（別名方法）
     */
    private readFileContent;
    /**
     * 生成預覽內容
     */
    private generatePreview;
}
//# sourceMappingURL=module-coordinator.service.d.ts.map