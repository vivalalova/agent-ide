# Application Services 層實作規範

## 一、功能需求

### 核心服務模組
1. **模組協調服務 (ModuleCoordinatorService)**
   - 協調 7 個核心模組的操作順序和依賴關係
   - 管理模組間的資料流和狀態同步
   - 提供統一的模組操作介面

2. **工作流程引擎 (WorkflowEngine)**
   - 管理複雜的多步驟操作（如重構工作流）
   - 支援工作流程的暫停、恢復和回滾
   - 提供工作流程模板和自定義能力

3. **會話管理服務 (SessionManager)**
   - 管理用戶會話狀態和上下文
   - 追蹤操作歷史和狀態變更
   - 支援並發會話隔離

4. **快取協調服務 (CacheCoordinator)**
   - 統一管理各模組的快取策略
   - 協調快取失效和更新策略
   - 提供快取效能監控

5. **錯誤處理服務 (ErrorHandler)**
   - 統一處理和轉換各模組錯誤
   - 提供錯誤恢復和重試機制
   - 生成用戶友好的錯誤訊息

## 二、技術規範

### 架構模式
- **服務層模式**：每個服務職責單一，介面清晰
- **依賴注入**：使用建構函式注入，支援測試替身
- **觀察者模式**：事件驅動的模組間通訊
- **命令模式**：工作流程步驟的封裝和執行

### 技術選擇
- **TypeScript**: 嚴格模式，禁止 any 類型
- **事件系統**: 基於 EventEmitter 的事件驅動架構
- **狀態管理**: 不可變狀態更新，支援時間旅行除錯
- **並發控制**: Promise.all 並行處理，資源鎖定機制
- **錯誤處理**: 統一繼承 BaseError，結構化錯誤資訊

### 檔案組織
```
src/application/
├── services/
│   ├── module-coordinator.service.ts
│   ├── workflow-engine.service.ts
│   ├── session-manager.service.ts
│   ├── cache-coordinator.service.ts
│   └── error-handler.service.ts
├── workflows/
│   ├── base-workflow.ts
│   ├── refactor-workflow.ts
│   └── analysis-workflow.ts
├── events/
│   ├── event-bus.ts
│   └── event-types.ts
├── state/
│   ├── session-state.ts
│   └── application-state.ts
├── types.ts
└── index.ts
```

## 三、實作細節

### 模組協調服務介面設計
```typescript
interface ModuleCoordinatorService {
  // 協調分析和重構操作
  analyzeAndRefactor(filePath: string, options: RefactorOptions): Promise<RefactorResult>;

  // 批次重新命名操作
  batchRename(operations: RenameOperation[]): Promise<RenameResult[]>;

  // 智能移動（分析依賴後移動）
  smartMove(source: string, target: string): Promise<MoveResult>;

  // 獲取模組狀態
  getModuleStatus(): Promise<ModuleStatus[]>;
}
```

### 工作流程引擎介面設計
```typescript
interface WorkflowEngine {
  // 執行工作流程
  execute<T>(workflow: Workflow<T>): Promise<WorkflowResult<T>>;

  // 暫停工作流程
  pause(workflowId: string): Promise<void>;

  // 恢復工作流程
  resume(workflowId: string): Promise<void>;

  // 回滾工作流程
  rollback(workflowId: string, stepId?: string): Promise<void>;

  // 獲取工作流程狀態
  getStatus(workflowId: string): Promise<WorkflowStatus>;
}
```

### 會話管理介面設計
```typescript
interface SessionManager {
  // 建立新會話
  createSession(userId?: string): Promise<Session>;

  // 獲取會話
  getSession(sessionId: string): Promise<Session | null>;

  // 更新會話狀態
  updateSession(sessionId: string, updates: Partial<SessionState>): Promise<void>;

  // 清理過期會話
  cleanup(): Promise<void>;

  // 獲取會話歷史
  getHistory(sessionId: string): Promise<OperationHistory[]>;
}
```

### 快取協調介面設計
```typescript
interface CacheCoordinator {
  // 統一快取策略設定
  configureCache(moduleId: string, strategy: CacheStrategy): Promise<void>;

  // 全域快取失效
  invalidateAll(): Promise<void>;

  // 模組快取失效
  invalidateModule(moduleId: string): Promise<void>;

  // 獲取快取統計
  getStats(): Promise<CacheStats>;

  // 快取預熱
  warmup(modules: string[]): Promise<void>;
}
```

### 錯誤處理介面設計
```typescript
interface ErrorHandler {
  // 處理和轉換錯誤
  handle(error: Error, context: ErrorContext): Promise<HandledError>;

  // 重試機制
  retry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T>;

  // 錯誤恢復
  recover(error: HandledError): Promise<RecoveryResult>;

  // 獲取錯誤統計
  getErrorStats(): Promise<ErrorStats>;
}
```

## 四、品質標準

### 程式碼品質要求
- **測試覆蓋率**: 每個服務 ≥ 90%
- **循環複雜度**: 每個方法 ≤ 10
- **檔案大小**: 每個檔案 ≤ 500 行
- **依賴深度**: 最大依賴層級 ≤ 5
- **介面一致性**: 統一的錯誤處理和回傳格式

### 效能要求
- **回應時間**: 一般操作 ≤ 100ms，複雜操作 ≤ 1s
- **記憶體使用**: 峰值 ≤ 512MB
- **並發支援**: 同時處理 ≥ 10 個會話
- **快取命中率**: ≥ 80%

### 可靠性要求
- **錯誤恢復**: 所有操作支援回滾
- **狀態一致性**: 保證操作的原子性
- **資料持久化**: 重要狀態自動保存
- **容錯能力**: 單一模組故障不影響整體服務

## 五、驗收條件

### 功能驗收
- [ ] 所有 5 個核心服務正確實作並通過單元測試
- [ ] 模組間協調操作正常，無依賴衝突
- [ ] 工作流程支援暫停、恢復、回滾機制
- [ ] 會話管理支援並發隔離和狀態追蹤
- [ ] 快取協調提供統一管理和效能監控
- [ ] 錯誤處理提供統一轉換和恢復機制

### 整合驗收
- [ ] 與現有 7 個核心模組無縫整合
- [ ] CLI 和 MCP 介面正常調用服務層
- [ ] 端到端工作流程測試通過
- [ ] 效能基準測試達標
- [ ] 錯誤情境測試覆蓋完整

### 技術驗收
- [ ] TypeScript 嚴格模式編譯無錯誤
- [ ] ESLint 檢查通過，無警告
- [ ] 所有測試通過，覆蓋率達標
- [ ] API 文件完整，範例可執行
- [ ] 部署腳本正常運作

## 六、TDD 實作順序

### 第一階段：基礎設施
1. **事件系統** (event-bus.ts, event-types.ts)
   - 測試：事件發送、訂閱、取消訂閱、錯誤處理
   - 實作：EventBus 類別和基本事件類型

2. **狀態管理** (session-state.ts, application-state.ts)
   - 測試：狀態建立、更新、查詢、持久化
   - 實作：不可變狀態類別和狀態管理器

3. **型別定義** (types.ts)
   - 定義所有服務介面和資料結構

### 第二階段：核心服務
4. **錯誤處理服務** (error-handler.service.ts)
   - 測試：錯誤轉換、重試機制、恢復策略
   - 實作：ErrorHandler 類別

5. **會話管理服務** (session-manager.service.ts)
   - 測試：會話建立、更新、清理、並發隔離
   - 實作：SessionManager 類別

6. **快取協調服務** (cache-coordinator.service.ts)
   - 測試：快取設定、失效、統計、預熱
   - 實作：CacheCoordinator 類別

### 第三階段：業務協調
7. **模組協調服務** (module-coordinator.service.ts)
   - 測試：模組調用、資料流、錯誤處理
   - 實作：ModuleCoordinatorService 類別

8. **基礎工作流程** (base-workflow.ts)
   - 測試：工作流程步驟、狀態轉換、回滾
   - 實作：BaseWorkflow 抽象類別

### 第四階段：工作流程實作
9. **工作流程引擎** (workflow-engine.service.ts)
   - 測試：執行、暫停、恢復、回滾工作流程
   - 實作：WorkflowEngine 類別

10. **具體工作流程** (refactor-workflow.ts, analysis-workflow.ts)
    - 測試：具體工作流程場景
    - 實作：RefactorWorkflow、AnalysisWorkflow 類別

### 第五階段：整合和優化
11. **整合測試**
    - 端到端測試各服務協作
    - 效能基準測試

12. **介面層整合**
    - 更新 CLI 和 MCP 以使用 Application Services

## 七、注意事項

### 重要限制
- **禁止破壞性變更**: 不得影響現有模組的 API
- **保持向後相容**: 新增功能必須向後相容
- **避免循環依賴**: 服務間依賴關係須為有向無環圖
- **記憶體管理**: 及時清理不使用的資源和事件監聽器

### 安全考量
- **輸入驗證**: 所有外部輸入必須驗證
- **權限控制**: 敏感操作須驗證權限
- **資料隔離**: 不同會話的資料嚴格隔離
- **錯誤資訊**: 不洩露敏感的系統資訊

### 擴展性設計
- **插件機制**: 支援自定義工作流程和服務
- **事件驅動**: 基於事件的鬆散耦合架構
- **配置化**: 關鍵參數支援外部配置
- **水平擴展**: 為未來分散式部署預留介面

此規範確保 Application Services 層的實作符合專案目標，提供高效、可靠、可擴展的服務協調能力。