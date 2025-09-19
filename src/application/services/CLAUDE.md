# Application Services 模組

## 概述
Application Services 層提供應用程式的業務邏輯實作，協調各個核心模組的功能，為 CLI 和 MCP 介面提供統一的服務層。這是整個應用程式的核心協調層，負責整合所有底層模組的功能。

## 主要職責
1. **業務邏輯協調** - 組合多個核心模組完成複雜業務需求
2. **工作流程管理** - 管理複雜操作的執行流程
3. **錯誤處理** - 統一的錯誤處理和回復機制
4. **狀態管理** - 維護應用程式狀態和會話
5. **效能優化** - 快取協調和批次處理

## 架構設計

### 服務層級結構
```
Application Services
├── Orchestration Services (高階協調)
├── Workflow Services (工作流程)
├── Integration Services (模組整合)
└── Session Services (會話管理)
```

## 核心服務

### 1. CodeAssistantService
主要的程式碼輔助服務，整合所有核心功能。

```typescript
interface CodeAssistantService {
  // 索引管理
  indexProject(projectPath: string, options?: IndexOptions): Promise<IndexResult>;
  updateIndex(filePath: string): Promise<void>;
  getIndexStatus(): Promise<IndexStatus>;
  
  // 重構操作
  renameSymbol(request: RenameRequest): Promise<RenameResult>;
  moveFile(request: MoveRequest): Promise<MoveResult>;
  extractMethod(request: ExtractRequest): Promise<ExtractResult>;
  
  // 分析功能
  analyzeCode(request: AnalyzeRequest): Promise<AnalysisResult>;
  findReferences(symbol: string): Promise<Reference[]>;
  getDependencies(filePath: string): Promise<DependencyGraph>;
  
  // 搜尋功能
  searchSymbol(query: string): Promise<SearchResult[]>;
  searchByPattern(pattern: string): Promise<CodeMatch[]>;
}
```

### 2. WorkflowService
管理複雜的多步驟操作流程。

```typescript
interface WorkflowService {
  // 工作流程定義
  defineWorkflow(definition: WorkflowDefinition): void;
  
  // 工作流程執行
  executeWorkflow(
    name: string,
    context: WorkflowContext
  ): Promise<WorkflowResult>;
  
  // 流程監控
  getWorkflowStatus(id: string): Promise<WorkflowStatus>;
  cancelWorkflow(id: string): Promise<void>;
  
  // 流程歷史
  getWorkflowHistory(): Promise<WorkflowHistory[]>;
}

interface WorkflowDefinition {
  name: string;
  steps: WorkflowStep[];
  errorHandling: ErrorHandlingStrategy;
  timeout?: number;
}

interface WorkflowStep {
  name: string;
  action: (context: WorkflowContext) => Promise<any>;
  retryPolicy?: RetryPolicy;
  fallback?: (error: Error) => Promise<any>;
}
```

### 3. SessionService
管理使用者會話和狀態。

```typescript
interface SessionService {
  // 會話管理
  createSession(config: SessionConfig): Promise<Session>;
  getSession(id: string): Promise<Session>;
  updateSession(id: string, data: Partial<Session>): Promise<void>;
  closeSession(id: string): Promise<void>;
  
  // 狀態管理
  getState<T>(key: string): T | undefined;
  setState<T>(key: string, value: T): void;
  clearState(): void;
  
  // 歷史記錄
  addToHistory(action: Action): void;
  getHistory(): Action[];
  undo(): Promise<void>;
  redo(): Promise<void>;
}
```

### 4. IntegrationService
整合各個核心模組的功能。

```typescript
interface IntegrationService {
  // 模組註冊
  registerModule(name: string, module: CoreModule): void;
  getModule<T extends CoreModule>(name: string): T;
  
  // 跨模組協調
  coordinate(operation: CrossModuleOperation): Promise<any>;
  
  // 事件處理
  on(event: string, handler: EventHandler): void;
  emit(event: string, data: any): void;
  
  // 健康檢查
  checkHealth(): Promise<HealthStatus>;
}
```

## 複雜操作範例

### 1. 智慧重新命名
結合多個模組完成智慧重新命名操作。

```typescript
class SmartRenameWorkflow {
  async execute(request: RenameRequest): Promise<RenameResult> {
    // 步驟 1: 分析符號
    const analysis = await this.analyzeSymbol(request.oldName);
    
    // 步驟 2: 找出所有引用
    const references = await this.findAllReferences(analysis);
    
    // 步驟 3: 檢查衝突
    const conflicts = await this.checkConflicts(
      request.newName,
      references
    );
    
    if (conflicts.length > 0) {
      return this.handleConflicts(conflicts);
    }
    
    // 步驟 4: 準備變更
    const changes = await this.prepareChanges(
      references,
      request.newName
    );
    
    // 步驟 5: 執行變更
    return await this.applyChanges(changes);
  }
  
  private async analyzeSymbol(name: string): Promise<SymbolAnalysis> {
    // 使用 analysis 模組分析符號
    const symbolInfo = await this.analysisModule.analyzeSymbol(name);
    
    // 取得符號的語意資訊
    const semantics = await this.getSemantics(symbolInfo);
    
    return {
      ...symbolInfo,
      semantics,
      scope: this.determineScope(symbolInfo)
    };
  }
  
  private async checkConflicts(
    newName: string,
    references: Reference[]
  ): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];
    
    for (const ref of references) {
      // 檢查命名衝突
      if (await this.hasNamingConflict(newName, ref)) {
        conflicts.push({
          type: 'naming',
          location: ref.location,
          message: `Name '${newName}' already exists in scope`
        });
      }
      
      // 檢查型別相容性
      if (await this.hasTypeConflict(newName, ref)) {
        conflicts.push({
          type: 'type',
          location: ref.location,
          message: 'Type incompatibility after rename'
        });
      }
    }
    
    return conflicts;
  }
}
```

### 2. 專案重構
大規模專案重構的工作流程。

```typescript
class ProjectRefactoringWorkflow {
  async restructureProject(
    config: RestructureConfig
  ): Promise<RestructureResult> {
    const workflow = this.defineWorkflow({
      name: 'project-restructure',
      steps: [
        {
          name: 'analyze-structure',
          action: async (ctx) => {
            // 分析現有專案結構
            const structure = await this.analyzeProjectStructure();
            ctx.set('currentStructure', structure);
            
            // 產生優化建議
            const suggestions = await this.generateSuggestions(structure);
            ctx.set('suggestions', suggestions);
          }
        },
        {
          name: 'plan-changes',
          action: async (ctx) => {
            const suggestions = ctx.get('suggestions');
            
            // 規劃檔案移動
            const moves = await this.planFileMoves(suggestions);
            
            // 規劃重新命名
            const renames = await this.planRenames(suggestions);
            
            // 規劃程式碼分割
            const splits = await this.planCodeSplits(suggestions);
            
            ctx.set('changePlan', { moves, renames, splits });
          }
        },
        {
          name: 'validate-plan',
          action: async (ctx) => {
            const plan = ctx.get('changePlan');
            
            // 驗證變更不會破壞依賴
            await this.validateDependencies(plan);
            
            // 驗證測試仍會通過
            await this.validateTests(plan);
            
            // 驗證建置仍會成功
            await this.validateBuild(plan);
          }
        },
        {
          name: 'execute-changes',
          action: async (ctx) => {
            const plan = ctx.get('changePlan');
            
            // 建立備份
            await this.createBackup();
            
            try {
              // 執行檔案移動
              await this.executeMoves(plan.moves);
              
              // 執行重新命名
              await this.executeRenames(plan.renames);
              
              // 執行程式碼分割
              await this.executeSplits(plan.splits);
              
              // 更新所有引用
              await this.updateAllReferences();
              
            } catch (error) {
              // 發生錯誤時回復
              await this.rollback();
              throw error;
            }
          }
        },
        {
          name: 'verify-result',
          action: async (ctx) => {
            // 執行測試
            const testResult = await this.runTests();
            
            // 執行建置
            const buildResult = await this.runBuild();
            
            // 產生報告
            const report = await this.generateReport({
              testResult,
              buildResult,
              changes: ctx.get('changePlan')
            });
            
            ctx.set('report', report);
          }
        }
      ],
      errorHandling: 'rollback'
    });
    
    return await this.workflowService.executeWorkflow(
      'project-restructure',
      config
    );
  }
}
```

### 3. 程式碼品質改善
自動化程式碼品質改善流程。

```typescript
class CodeQualityWorkflow {
  async improveCodeQuality(
    options: QualityOptions
  ): Promise<QualityResult> {
    // 階段 1: 分析
    const issues = await this.analyzeQualityIssues(options);
    
    // 階段 2: 優先排序
    const prioritized = this.prioritizeIssues(issues);
    
    // 階段 3: 自動修復
    const results: FixResult[] = [];
    
    for (const issue of prioritized) {
      if (issue.autoFixable) {
        try {
          const result = await this.autoFix(issue);
          results.push(result);
        } catch (error) {
          console.warn(`Failed to auto-fix ${issue.type}:`, error);
        }
      }
    }
    
    // 階段 4: 產生手動修復建議
    const manualFixes = await this.generateManualFixSuggestions(
      issues.filter(i => !i.autoFixable)
    );
    
    return {
      autoFixed: results,
      manualRequired: manualFixes,
      metrics: await this.calculateMetrics()
    };
  }
  
  private async autoFix(issue: QualityIssue): Promise<FixResult> {
    switch (issue.type) {
      case 'unused-imports':
        return await this.removeUnusedImports(issue);
        
      case 'duplicate-code':
        return await this.extractDuplicateCode(issue);
        
      case 'complex-function':
        return await this.simplifyComplexFunction(issue);
        
      case 'missing-types':
        return await this.addMissingTypes(issue);
        
      default:
        throw new Error(`No auto-fix for ${issue.type}`);
    }
  }
}
```

## 錯誤處理策略

### 1. 重試機制
```typescript
class RetryStrategy {
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      backoff = 'exponential',
      initialDelay = 1000
    } = options;
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxAttempts) {
          throw lastError;
        }
        
        const delay = this.calculateDelay(attempt, backoff, initialDelay);
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }
  
  private calculateDelay(
    attempt: number,
    backoff: string,
    initialDelay: number
  ): number {
    switch (backoff) {
      case 'exponential':
        return initialDelay * Math.pow(2, attempt - 1);
      case 'linear':
        return initialDelay * attempt;
      default:
        return initialDelay;
    }
  }
}
```

### 2. 回復機制
```typescript
class RollbackManager {
  private checkpoints: Checkpoint[] = [];
  
  async createCheckpoint(): Promise<string> {
    const checkpoint = {
      id: generateId(),
      timestamp: Date.now(),
      state: await this.captureState()
    };
    
    this.checkpoints.push(checkpoint);
    return checkpoint.id;
  }
  
  async rollbackTo(checkpointId: string): Promise<void> {
    const checkpoint = this.checkpoints.find(c => c.id === checkpointId);
    
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }
    
    await this.restoreState(checkpoint.state);
  }
  
  private async captureState(): Promise<ApplicationState> {
    return {
      files: await this.captureFiles(),
      cache: await this.captureCache(),
      index: await this.captureIndex()
    };
  }
  
  private async restoreState(state: ApplicationState): Promise<void> {
    await this.restoreFiles(state.files);
    await this.restoreCache(state.cache);
    await this.restoreIndex(state.index);
  }
}
```

## 效能優化

### 1. 批次處理
```typescript
class BatchProcessor {
  private queue: BatchItem[] = [];
  private processing = false;
  
  async add<T>(operation: BatchOperation<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        operation,
        resolve,
        reject
      });
      
      if (!this.processing) {
        this.processBatch();
      }
    });
  }
  
  private async processBatch(): Promise<void> {
    this.processing = true;
    
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);
      
      try {
        const results = await this.executeBatch(batch);
        
        batch.forEach((item, index) => {
          item.resolve(results[index]);
        });
      } catch (error) {
        batch.forEach(item => {
          item.reject(error);
        });
      }
    }
    
    this.processing = false;
  }
}
```

### 2. 快取協調
```typescript
class CacheCoordinator {
  async withCache<T>(
    key: string,
    factory: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // 檢查快取
    const cached = await this.cache.get<T>(key);
    if (cached && !this.isExpired(cached, options)) {
      return cached.value;
    }
    
    // 使用分散式鎖避免重複計算
    const lock = await this.acquireLock(key);
    
    try {
      // 再次檢查快取（可能其他程序已更新）
      const rechecked = await this.cache.get<T>(key);
      if (rechecked && !this.isExpired(rechecked, options)) {
        return rechecked.value;
      }
      
      // 計算新值
      const value = await factory();
      
      // 更新快取
      await this.cache.set(key, value, options.ttl);
      
      return value;
    } finally {
      await lock.release();
    }
  }
}
```

## 監控與記錄

### 1. 操作追蹤
```typescript
class OperationTracker {
  private operations: Map<string, OperationInfo> = new Map();
  
  startOperation(name: string, metadata?: any): string {
    const id = generateId();
    
    this.operations.set(id, {
      id,
      name,
      startTime: Date.now(),
      status: 'running',
      metadata
    });
    
    return id;
  }
  
  completeOperation(id: string, result?: any): void {
    const operation = this.operations.get(id);
    
    if (operation) {
      operation.status = 'completed';
      operation.endTime = Date.now();
      operation.duration = operation.endTime - operation.startTime;
      operation.result = result;
      
      this.emitMetrics(operation);
    }
  }
  
  failOperation(id: string, error: Error): void {
    const operation = this.operations.get(id);
    
    if (operation) {
      operation.status = 'failed';
      operation.endTime = Date.now();
      operation.duration = operation.endTime - operation.startTime;
      operation.error = error;
      
      this.emitMetrics(operation);
      this.logError(operation, error);
    }
  }
}
```

### 2. 效能監控
```typescript
class PerformanceMonitor {
  private metrics: Map<string, Metric[]> = new Map();
  
  recordMetric(name: string, value: number, tags?: Tags): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    this.metrics.get(name)!.push({
      timestamp: Date.now(),
      value,
      tags
    });
    
    // 定期清理舊指標
    this.cleanOldMetrics(name);
  }
  
  getStatistics(name: string, window?: TimeWindow): Statistics {
    const metrics = this.getMetricsInWindow(name, window);
    
    if (metrics.length === 0) {
      return { count: 0 };
    }
    
    const values = metrics.map(m => m.value);
    
    return {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b) / values.length,
      p50: this.percentile(values, 50),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99)
    };
  }
}
```

## 測試策略

### 1. 服務層測試
```typescript
describe('CodeAssistantService', () => {
  let service: CodeAssistantService;
  let mockModules: MockModules;
  
  beforeEach(() => {
    mockModules = createMockModules();
    service = new CodeAssistantService(mockModules);
  });
  
  describe('renameSymbol', () => {
    it('應該成功重新命名符號並更新所有引用', async () => {
      // Arrange
      const request = {
        oldName: 'oldFunction',
        newName: 'newFunction',
        scope: 'project'
      };
      
      mockModules.search.findReferences.mockResolvedValue([
        { file: 'a.ts', line: 10, column: 5 },
        { file: 'b.ts', line: 20, column: 10 }
      ]);
      
      // Act
      const result = await service.renameSymbol(request);
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.filesChanged).toBe(2);
      expect(mockModules.refactor.rename).toHaveBeenCalledWith(
        expect.objectContaining(request)
      );
    });
    
    it('應該在發生衝突時回報錯誤', async () => {
      // Arrange
      const request = {
        oldName: 'function1',
        newName: 'existingFunction',
        scope: 'project'
      };
      
      mockModules.analysis.checkConflicts.mockResolvedValue([
        { type: 'naming', message: 'Name already exists' }
      ]);
      
      // Act & Assert
      await expect(service.renameSymbol(request))
        .rejects
        .toThrow('Naming conflict detected');
    });
  });
});
```

### 2. 工作流程測試
```typescript
describe('WorkflowService', () => {
  it('應該按順序執行工作流程步驟', async () => {
    const workflow = {
      name: 'test-workflow',
      steps: [
        {
          name: 'step1',
          action: jest.fn().mockResolvedValue('result1')
        },
        {
          name: 'step2',
          action: jest.fn().mockResolvedValue('result2')
        }
      ]
    };
    
    const result = await service.executeWorkflow(workflow);
    
    expect(workflow.steps[0].action).toHaveBeenCalledBefore(
      workflow.steps[1].action
    );
    expect(result.steps).toHaveLength(2);
    expect(result.success).toBe(true);
  });
  
  it('應該在步驟失敗時執行回復', async () => {
    const workflow = {
      name: 'test-workflow',
      steps: [
        {
          name: 'step1',
          action: jest.fn().mockResolvedValue('result1')
        },
        {
          name: 'step2',
          action: jest.fn().mockRejectedValue(new Error('Failed'))
        }
      ],
      errorHandling: 'rollback'
    };
    
    await expect(service.executeWorkflow(workflow))
      .rejects
      .toThrow('Failed');
    
    expect(mockRollbackManager.rollback).toHaveBeenCalled();
  });
});
```

### 3. 整合測試
```typescript
describe('Integration Tests', () => {
  it('應該完成端到端的重構操作', async () => {
    // 設置測試專案
    const testProject = await setupTestProject();
    
    // 初始化服務
    const service = new CodeAssistantService();
    await service.indexProject(testProject.path);
    
    // 執行重新命名
    const renameResult = await service.renameSymbol({
      oldName: 'TestClass',
      newName: 'RenamedClass',
      scope: 'project'
    });
    
    // 驗證結果
    expect(renameResult.success).toBe(true);
    
    // 驗證檔案內容
    const content = await readFile(
      path.join(testProject.path, 'src/main.ts')
    );
    expect(content).toContain('RenamedClass');
    expect(content).not.toContain('TestClass');
    
    // 驗證專案仍可建置
    const buildResult = await runBuild(testProject.path);
    expect(buildResult.success).toBe(true);
  });
});
```

## 設定與初始化

### 1. 服務設定
```typescript
interface ServiceConfig {
  // 核心設定
  modules: ModuleConfig;
  cache: CacheConfig;
  storage: StorageConfig;
  
  // 效能設定
  performance: {
    maxConcurrentOperations: number;
    batchSize: number;
    cacheStrategy: 'aggressive' | 'balanced' | 'minimal';
  };
  
  // 監控設定
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  
  // 安全設定
  security: {
    enableSandbox: boolean;
    maxFileSize: number;
    allowedExtensions: string[];
  };
}
```

### 2. 初始化流程
```typescript
class ApplicationInitializer {
  async initialize(config: ServiceConfig): Promise<Application> {
    // 步驟 1: 初始化基礎設施
    const infrastructure = await this.initializeInfrastructure(config);
    
    // 步驟 2: 初始化核心模組
    const modules = await this.initializeCoreModules(config, infrastructure);
    
    // 步驟 3: 初始化服務層
    const services = await this.initializeServices(modules, infrastructure);
    
    // 步驟 4: 初始化介面
    const interfaces = await this.initializeInterfaces(services);
    
    // 步驟 5: 執行健康檢查
    await this.performHealthCheck({
      infrastructure,
      modules,
      services,
      interfaces
    });
    
    return new Application({
      infrastructure,
      modules,
      services,
      interfaces
    });
  }
}
```

## 最佳實踐

### 1. 服務設計原則
- **單一職責**: 每個服務專注於特定業務領域
- **鬆耦合**: 服務間透過介面通訊，避免直接依賴
- **高內聚**: 相關功能組織在同一服務內
- **可測試**: 所有服務都可獨立測試

### 2. 錯誤處理原則
- **快速失敗**: 發現錯誤立即報告
- **優雅降級**: 提供備用方案
- **詳細記錄**: 記錄足夠的上下文資訊
- **使用者友善**: 提供清晰的錯誤訊息

### 3. 效能優化原則
- **延遲載入**: 按需載入資源
- **批次處理**: 合併相似操作
- **智慧快取**: 根據使用模式調整快取策略
- **非同步處理**: 不阻塞主執行緒

### 4. 安全性原則
- **最小權限**: 只授予必要的權限
- **輸入驗證**: 驗證所有外部輸入
- **審計記錄**: 記錄所有重要操作
- **沙箱執行**: 隔離不受信任的程式碼

## 擴展點

### 1. 自訂服務
```typescript
abstract class CustomService {
  abstract name: string;
  abstract version: string;
  
  abstract initialize(context: ServiceContext): Promise<void>;
  abstract execute(request: any): Promise<any>;
  abstract shutdown(): Promise<void>;
}

// 註冊自訂服務
application.registerService(new MyCustomService());
```

### 2. 工作流程擴展
```typescript
// 註冊自訂工作流程
workflowService.registerWorkflow({
  name: 'custom-refactoring',
  steps: [
    // 自訂步驟
  ],
  hooks: {
    beforeStep: async (step, context) => {
      // 步驟前處理
    },
    afterStep: async (step, result, context) => {
      // 步驟後處理
    }
  }
});
```

### 3. 中介軟體
```typescript
// 註冊服務中介軟體
application.use(async (request, next) => {
  // 前處理
  console.log('Request:', request);
  
  const result = await next();
  
  // 後處理
  console.log('Response:', result);
  
  return result;
});
```

## 相依套件
- `inversify`: 依賴注入容器
- `p-queue`: 並發控制
- `node-cache`: 記憶體快取
- `winston`: 日誌記錄
- `joi`: 輸入驗證

## 性能指標
- 服務回應時間: < 100ms (P95)
- 工作流程執行: < 5s (一般操作)
- 記憶體使用: < 500MB
- 並發處理: 100+ 操作/秒

## 注意事項
1. 服務層不直接操作檔案系統，透過 storage 模組
2. 所有長時間操作都應支援取消
3. 重要操作都應有審計記錄
4. 快取策略應根據使用場景調整
5. 錯誤訊息應包含足夠的診斷資訊