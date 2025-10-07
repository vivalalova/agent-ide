/**
 * Application Services 層主入口
 * 統一匯出所有應用服務、工作流程、事件系統和狀態管理
 */
export { EventBus } from './events/event-bus.js';
export type { EventHandler, EventPriority, EventStats, } from './events/event-types.js';
export * from './events/index.js';
export { SessionState } from './state/session-state.js';
export { ApplicationState } from './state/application-state.js';
export { StateManager } from './state/state-manager.js';
export * from './state/index.js';
export { ErrorHandlerService } from './services/error-handler.service.js';
export { SessionManager } from './services/session-manager.service.js';
export { CacheCoordinatorService } from './services/cache-coordinator.service.js';
export { ModuleCoordinatorService } from './services/module-coordinator.service.js';
export { WorkflowEngineService } from './services/workflow-engine.service.js';
export * from './services/index.js';
export { BaseWorkflow } from './workflows/base-workflow.js';
export { RefactorWorkflow } from './workflows/refactor-workflow.js';
export { AnalysisWorkflow } from './workflows/analysis-workflow.js';
export * from './workflows/index.js';
export type { ModuleStatus, RefactorOptions, RefactorResult, CodeChange, RenameOperation, RenameResult, MoveResult, Workflow, WorkflowStep, StepResult, WorkflowResult, WorkflowStatus, WorkflowState, Session, SessionState as SessionStateType, SessionContext, OperationHistory, CacheStrategy, CacheStats, ModuleCacheStats, ErrorContext, HandledError, RetryOptions, RecoveryStrategy, RecoveryResult, ErrorStats, IModuleCoordinatorService, IWorkflowEngine, ISessionManager, ICacheCoordinator, IErrorHandler, ApplicationEvent, StateChangeEvent, ModuleEvent, WorkflowEvent, CacheEvent, ErrorEvent, } from './types.js';
import { EventBus } from './events/event-bus.js';
import { StateManager } from './state/state-manager.js';
import { ErrorHandlerService } from './services/error-handler.service.js';
import { SessionManager } from './services/session-manager.service.js';
import { CacheCoordinatorService } from './services/cache-coordinator.service.js';
import { ModuleCoordinatorService } from './services/module-coordinator.service.js';
import { WorkflowEngineService } from './services/workflow-engine.service.js';
/**
 * 應用服務容器，提供所有服務的統一存取介面
 */
export declare class ApplicationServices {
    private static instance;
    private readonly eventBus;
    private readonly stateManager;
    private readonly errorHandler;
    private readonly sessionManager;
    private readonly cacheCoordinator;
    private readonly moduleCoordinator;
    private readonly workflowEngine;
    private constructor();
    /**
     * 取得 ApplicationServices 單例
     */
    static getInstance(): ApplicationServices;
    /**
     * 取得事件匯流排
     */
    getEventBus(): EventBus;
    /**
     * 取得狀態管理器
     */
    getStateManager(): StateManager;
    /**
     * 取得錯誤處理服務
     */
    getErrorHandler(): ErrorHandlerService;
    /**
     * 取得會話管理服務
     */
    getSessionManager(): SessionManager;
    /**
     * 取得快取協調服務
     */
    getCacheCoordinator(): CacheCoordinatorService;
    /**
     * 取得模組協調服務
     */
    getModuleCoordinator(): ModuleCoordinatorService;
    /**
     * 取得工作流程引擎
     */
    getWorkflowEngine(): WorkflowEngineService;
    /**
     * 釋放所有資源
     */
    dispose(): Promise<void>;
    /**
     * 重設單例（僅用於測試）
     */
    static resetInstance(): void;
}
export default ApplicationServices;
//# sourceMappingURL=index.d.ts.map