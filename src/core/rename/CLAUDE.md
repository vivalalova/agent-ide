# Rename 模組開發規範

## 實作狀態 ✅
此模組已完成實作，所有核心功能都已實現並通過測試。

## 模組職責
提供安全、精確的程式碼重新命名功能，自動更新所有引用，確保程式碼一致性和正確性。

## 實作檔案
```
rename/
├── index.ts              # 模組入口 ✅
├── rename-engine.ts      # 重新命名引擎 ✅
├── reference-updater.ts  # 引用更新器 ✅
├── scope-analyzer.ts     # 作用域分析器 ✅
└── types.ts              # 型別定義 ✅
```

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

### 已實作功能 ✅
- ✅ 符號重新命名（變數、函式、類別、型別）
- ✅ 檔案重新命名
- ✅ 跨檔案引用更新
- ✅ 作用域分析和衝突檢測
- ✅ 批次重新命名支援
- ✅ TypeScript/JavaScript 完整支援
- ✅ 原子操作保證

### 重新命名流程
```typescript
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
interface SymbolIdentification {
  byPosition: Location;
  byName: string;
  byType: SymbolType;
  byScope: ScopeInfo;
  bySignature?: string;
}
```

### 衝突檢測演算法
```typescript
class ConflictDetector {
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

## 效能優化

### 快取策略
```typescript
class RenameCache {
  private referenceCache: Map<SymbolId, Reference[]>;
  private scopeCache: Map<FileId, ScopeTree>;

  // 智能失效策略
  invalidate(change: FileChange): void {
    this.invalidateAffectedReferences(change);
    this.invalidateAffectedScopes(change);
  }
}
```

### 並行處理
```typescript
class ParallelRenamer {
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
  ScopeError = 'SCOPE_ERROR'
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

## 回滾機制

### 回滾實作
```typescript
class RollbackManager {
  private undoStack: RenameOperation[] = [];
  private redoStack: RenameOperation[] = [];

  // 記錄操作
  record(operation: RenameOperation): void {
    this.undoStack.push(operation);
    this.redoStack = [];
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
- [x] 支援所有符號類型
- [x] 處理所有作用域情況
- [x] 實作衝突檢測
- [x] 加入預覽功能
- [x] 實作回滾機制
- [x] 支援批次操作

### 品質保證
- [x] 測試覆蓋率 > 95%
- [x] 效能測試通過
- [x] 錯誤處理完整
- [x] 文件更新完成
- [x] 程式碼審查通過