/**
 * Application Services 層主入口
 * 統一匯出所有應用服務、工作流程、事件系統和狀態管理
 */

// ============= 事件系統 =============
export { EventBus } from './events/event-bus.js';
export type {
  EventHandler,
  EventPriority,
  EventStats,
} from './events/event-types.js';
export * from './events/index.js';

// ============= 狀態管理 =============
export { SessionState } from './state/session-state.js';
export { ApplicationState } from './state/application-state.js';
export { StateManager } from './state/state-manager.js';
export * from './state/index.js';

// ============= 服務層 =============
export { ErrorHandlerService } from './services/error-handler.service.js';
export { SessionManager } from './services/session-manager.service.js';
export { CacheCoordinatorService } from './services/cache-coordinator.service.js';
export { ModuleCoordinatorService } from './services/module-coordinator.service.js';
export { WorkflowEngineService } from './services/workflow-engine.service.js';
export * from './services/index.js';

// ============= 工作流程 =============
export { BaseWorkflow } from './workflows/base-workflow.js';
export { RefactorWorkflow } from './workflows/refactor-workflow.js';
export { AnalysisWorkflow } from './workflows/analysis-workflow.js';
export * from './workflows/index.js';

// ============= 型別定義 =============
export type {
  // 模組協調型別
  ModuleStatus,
  RefactorOptions,
  RefactorResult,
  CodeChange,
  RenameOperation,
  RenameResult,
  MoveResult,

  // 工作流程型別
  Workflow,
  WorkflowStep,
  StepResult,
  WorkflowResult,
  WorkflowStatus,
  WorkflowState,

  // 會話管理型別
  Session,
  SessionState as SessionStateType,
  SessionContext,
  OperationHistory,

  // 快取協調型別
  CacheStrategy,
  CacheStats,
  ModuleCacheStats,

  // 錯誤處理型別
  ErrorContext,
  HandledError,
  RetryOptions,
  RecoveryStrategy,
  RecoveryResult,
  ErrorStats,

  // 服務介面
  IModuleCoordinatorService,
  IWorkflowEngine,
  ISessionManager,
  ICacheCoordinator,
  IErrorHandler,

  // 事件型別
  ApplicationEvent,
  StateChangeEvent,
  ModuleEvent,
  WorkflowEvent,
  CacheEvent,
  ErrorEvent,
} from './types.js';

// ============= 應用服務工廠 =============
import { EventBus } from './events/event-bus.js';
import { StateManager } from './state/state-manager.js';
import { ErrorHandlerService } from './services/error-handler.service.js';
import { SessionManager } from './services/session-manager.service.js';
import { CacheCoordinatorService } from './services/cache-coordinator.service.js';
import { ModuleCoordinatorService } from './services/module-coordinator.service.js';
import { WorkflowEngineService } from './services/workflow-engine.service.js';
import { CacheManager } from '@infrastructure/cache/cache-manager.js';

/**
 * 應用服務容器，提供所有服務的統一存取介面
 */
export class ApplicationServices {
  private static instance: ApplicationServices;

  private readonly eventBus: EventBus;
  private readonly stateManager: StateManager;
  private readonly errorHandler: ErrorHandlerService;
  private readonly sessionManager: SessionManager;
  private readonly cacheCoordinator: CacheCoordinatorService;
  private readonly moduleCoordinator: ModuleCoordinatorService;
  private readonly workflowEngine: WorkflowEngineService;

  private constructor() {
    // 初始化基礎設施
    this.eventBus = new EventBus();
    this.stateManager = new StateManager();

    // 初始化核心服務
    this.errorHandler = new ErrorHandlerService(this.eventBus);
    this.sessionManager = new SessionManager(this.stateManager, this.eventBus);

    // 初始化協調服務
    const cacheManager = new CacheManager();
    this.cacheCoordinator = new CacheCoordinatorService(cacheManager, this.eventBus);
    this.moduleCoordinator = new ModuleCoordinatorService(
      this.eventBus,
      this.stateManager,
      this.errorHandler
    );

    // 初始化工作流程引擎
    this.workflowEngine = new WorkflowEngineService(
      this.eventBus,
      this.errorHandler,
      this.stateManager
    );
  }

  /**
   * 取得 ApplicationServices 單例
   */
  public static getInstance(): ApplicationServices {
    if (!ApplicationServices.instance) {
      ApplicationServices.instance = new ApplicationServices();
    }
    return ApplicationServices.instance;
  }

  /**
   * 取得事件匯流排
   */
  public getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * 取得狀態管理器
   */
  public getStateManager(): StateManager {
    return this.stateManager;
  }

  /**
   * 取得錯誤處理服務
   */
  public getErrorHandler(): ErrorHandlerService {
    return this.errorHandler;
  }

  /**
   * 取得會話管理服務
   */
  public getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * 取得快取協調服務
   */
  public getCacheCoordinator(): CacheCoordinatorService {
    return this.cacheCoordinator;
  }

  /**
   * 取得模組協調服務
   */
  public getModuleCoordinator(): ModuleCoordinatorService {
    return this.moduleCoordinator;
  }

  /**
   * 取得工作流程引擎
   */
  public getWorkflowEngine(): WorkflowEngineService {
    return this.workflowEngine;
  }

  /**
   * 釋放所有資源
   */
  public async dispose(): Promise<void> {
    // 停止會話管理器的清理任務
    if (this.sessionManager) {
      await this.sessionManager.cleanup();
    }

    // 清理快取協調器
    if (this.cacheCoordinator) {
      await this.cacheCoordinator.dispose();
    }

    // 事件匯流排和狀態管理器的清理
    // EventBus 和 StateManager 會在垃圾回收時自動清理
  }

  /**
   * 重設單例（僅用於測試）
   */
  public static resetInstance(): void {
    if (ApplicationServices.instance) {
      ApplicationServices.instance.dispose();
      ApplicationServices.instance = null as any;
    }
  }
}

// 預設匯出
export default ApplicationServices;