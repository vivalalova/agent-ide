# Rename 模組開發規範

## 模組職責
提供安全、精確的程式碼重新命名功能，自動更新所有引用，確保程式碼一致性和正確性。

## 開發原則

### 1. 安全第一
- **原子操作**：所有變更必須是原子性的
- **預檢查**：執行前完整驗證
- **回滾機制**：任何失敗都能完全回滾
- **保留備份**：重要操作前自動備份

### 2. 精確性要求
- 準確識別符號範圍
- 區分相同名稱的不同符號
- 處理遮蔽（shadowing）情況
- 考慮作用域邊界

### 3. 使用者體驗
- 即時預覽變更
- 清晰的衝突提示
- 智能命名建議
- 批次操作支援

## 實作規範

### 檔案結構
```
rename/
├── index.ts              # 模組入口
├── service.ts            # RenameService 實作
├── validators/
│   ├── name-validator.ts     # 命名規則驗證
│   ├── conflict-detector.ts  # 衝突檢測
│   └── scope-analyzer.ts     # 作用域分析
├── executors/
│   ├── symbol-renamer.ts     # 符號重新命名
│   ├── file-renamer.ts       # 檔案重新命名
│   └── batch-renamer.ts      # 批次重新命名
├── suggestions/
│   ├── name-suggester.ts     # 命名建議
│   └── convention-checker.ts # 命名慣例檢查
├── utils/
│   ├── text-edit.ts          # 文字編輯工具
│   └── rollback.ts           # 回滾機制
└── types.ts              # 型別定義
```

### 重新命名流程
```typescript
// 標準重新命名流程
class RenameFlow {
  // 1. 驗證階段
  async validate(request: RenameRequest): Promise<ValidationResult>;
  
  // 2. 分析階段
  async analyze(request: RenameRequest): Promise<RenameAnalysis>;
  
  // 3. 預覽階段
  async preview(analysis: RenameAnalysis): Promise<RenamePreview>;
  
  // 4. 執行階段
  async execute(preview: RenamePreview): Promise<RenameResult>;
  
  // 5. 驗證階段
  async verify(result: RenameResult): Promise<VerificationResult>;
}
```

## 關鍵實作細節

### 符號識別
```typescript
// 精確的符號識別
interface SymbolIdentification {
  // 使用多重標識確保準確性
  byPosition: Location;
  byName: string;
  byType: SymbolType;
  byScope: ScopeInfo;
  bySignature?: string; // 函式簽名
}
```

### 衝突檢測演算法
```typescript
class ConflictDetector {
  // 檢測所有可能的衝突
  detectConflicts(newName: string, context: RenameContext): Conflict[] {
    const conflicts: Conflict[] = [];
    
    // 1. 同範圍衝突
    conflicts.push(...this.checkScopeConflicts(newName, context));
    
    // 2. 繼承鏈衝突
    conflicts.push(...this.checkInheritanceConflicts(newName, context));
    
    // 3. 介面實作衝突
    conflicts.push(...this.checkInterfaceConflicts(newName, context));
    
    // 4. 保留字衝突
    conflicts.push(...this.checkReservedWords(newName, context));
    
    return conflicts;
  }
}
```

### 批次重新命名
```typescript
// 支援模式匹配的批次重新命名
class BatchRenamer {
  // 使用正則表達式轉換
  renameByPattern(
    pattern: RegExp,
    replacement: string | ((match: RegExpMatchArray) => string)
  ): BatchRenameOperation;
  
  // 命名慣例轉換
  convertNamingConvention(
    from: NamingConvention,
    to: NamingConvention
  ): BatchRenameOperation;
  
  // 前綴/後綴處理
  addPrefix(prefix: string): BatchRenameOperation;
  removeSuffix(suffix: string): BatchRenameOperation;
}
```

## 語言特定處理

### TypeScript/JavaScript
```typescript
class TypeScriptRenameHandler {
  // 處理 default export
  handleDefaultExport(node: Node): RenameStrategy;
  
  // 處理解構賦值
  handleDestructuring(pattern: Pattern): RenameStrategy;
  
  // 處理動態屬性
  handleComputedProperty(prop: ComputedProperty): RenameStrategy;
  
  // 處理 JSX 組件
  handleJSXComponent(component: JSXElement): RenameStrategy;
}
```

### Swift
```typescript
class SwiftRenameHandler {
  // 處理 protocol 方法
  handleProtocolMethod(method: Method): RenameStrategy;
  
  // 處理 extension
  handleExtension(ext: Extension): RenameStrategy;
  
  // 處理 @objc 標記
  handleObjcAnnotation(symbol: Symbol): RenameStrategy;
  
  // 處理 selector 字串
  handleSelector(selector: string): RenameStrategy;
}
```

## 效能優化

### 快取策略
```typescript
class RenameCache {
  // 快取引用查找結果
  private referenceCache: Map<SymbolId, Reference[]>;
  
  // 快取作用域分析
  private scopeCache: Map<FileId, ScopeTree>;
  
  // 智能失效策略
  invalidate(change: FileChange): void {
    // 只失效受影響的快取項
    this.invalidateAffectedReferences(change);
    this.invalidateAffectedScopes(change);
  }
}
```

### 並行處理
```typescript
class ParallelRenamer {
  // 並行查找引用
  async findReferencesParallel(
    symbol: Symbol,
    files: string[]
  ): Promise<Reference[]> {
    const chunks = this.chunkFiles(files);
    const results = await Promise.all(
      chunks.map(chunk => this.findReferencesInChunk(symbol, chunk))
    );
    return results.flat();
  }
}
```

## 錯誤處理

### 錯誤類型
```typescript
enum RenameErrorType {
  InvalidName = 'INVALID_NAME',
  NameConflict = 'NAME_CONFLICT',
  ReadOnlyFile = 'READ_ONLY_FILE',
  ParseError = 'PARSE_ERROR',
  ScopeError = 'SCOPE_ERROR',
  NetworkError = 'NETWORK_ERROR'
}

class RenameError extends Error {
  constructor(
    public type: RenameErrorType,
    public message: string,
    public recoverable: boolean,
    public suggestion?: string
  ) {
    super(message);
  }
}
```

### 錯誤恢復
```typescript
class ErrorRecovery {
  // 嘗試恢復
  async recover(error: RenameError): Promise<RecoveryResult> {
    switch (error.type) {
      case RenameErrorType.InvalidName:
        return this.suggestValidName(error);
      case RenameErrorType.NameConflict:
        return this.resolveConflict(error);
      case RenameErrorType.ParseError:
        return this.fallbackRename(error);
      default:
        return { success: false, reason: error.message };
    }
  }
}
```

## 測試策略

### 測試案例分類
1. **基本重新命名**
   - 局部變數
   - 全域變數
   - 函式/方法
   - 類別/介面

2. **複雜場景**
   - 跨檔案重新命名
   - 循環依賴
   - 動態引用
   - 命名遮蔽

3. **邊界情況**
   - Unicode 字元
   - 保留字
   - 特殊字元
   - 空名稱

### 測試工具
```typescript
// 測試輔助工具
class RenameTestHelper {
  // 建立測試專案
  createTestProject(structure: ProjectStructure): TestProject;
  
  // 驗證重新命名結果
  assertRenameResult(
    actual: RenameResult,
    expected: ExpectedResult
  ): void;
  
  // 快照測試
  snapshotTest(
    before: string,
    after: string,
    operation: RenameOperation
  ): void;
}
```

## 命名建議系統

### 建議來源
```typescript
class NameSuggester {
  // 基於上下文
  suggestFromContext(context: Context): string[];
  
  // 基於類型
  suggestFromType(type: TypeInfo): string[];
  
  // 基於慣例
  suggestFromConvention(convention: NamingConvention): string[];
  
  // 基於歷史
  suggestFromHistory(history: RenameHistory): string[];
  
  // 綜合建議
  suggest(input: SuggestionInput): SuggestedName[] {
    const suggestions = [
      ...this.suggestFromContext(input.context),
      ...this.suggestFromType(input.type),
      ...this.suggestFromConvention(input.convention),
      ...this.suggestFromHistory(input.history)
    ];
    
    return this.rankSuggestions(suggestions);
  }
}
```

## 回滾機制

### 回滾實作
```typescript
class RollbackManager {
  private undoStack: RenameOperation[] = [];
  private redoStack: RenameOperation[] = [];
  
  // 記錄操作
  record(operation: RenameOperation): void {
    this.undoStack.push(operation);
    this.redoStack = []; // 清空 redo
  }
  
  // 撤銷
  async undo(): Promise<void> {
    const operation = this.undoStack.pop();
    if (operation) {
      await this.revert(operation);
      this.redoStack.push(operation);
    }
  }
  
  // 重做
  async redo(): Promise<void> {
    const operation = this.redoStack.pop();
    if (operation) {
      await this.apply(operation);
      this.undoStack.push(operation);
    }
  }
}
```

## 開發檢查清單

### 功能開發
- [ ] 支援所有符號類型
- [ ] 處理所有作用域情況
- [ ] 實作衝突檢測
- [ ] 加入預覽功能
- [ ] 實作回滾機制
- [ ] 支援批次操作

### 品質保證
- [ ] 測試覆蓋率 > 95%
- [ ] 效能測試通過
- [ ] 錯誤處理完整
- [ ] 文件更新完成
- [ ] 程式碼審查通過

## 疑難排解

### 常見問題

1. **重新命名不完整**
   - 檢查索引是否最新
   - 確認作用域分析正確
   - 驗證檔案都可寫入

2. **效能問題**
   - 啟用快取機制
   - 使用批次處理
   - 優化查詢策略

3. **衝突誤報**
   - 檢查作用域邊界
   - 確認符號類型
   - 驗證繼承關係

## 未來改進
1. AI 輔助命名建議
2. 跨語言重新命名
3. 版本控制整合
4. 即時協作支援