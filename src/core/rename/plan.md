# Rename 模組開發計畫

## 模組目標
提供智能、安全、高效的程式碼重新命名功能，自動更新所有相關引用，確保程式碼一致性。

## 核心功能

### 1. 符號重新命名
- **支援類型**：
  - 變數（局部、全域）
  - 函式/方法
  - 類別/介面
  - 型別定義
  - 屬性/欄位
  - 參數
  - 模組/命名空間
- **範圍控制**：
  - 單檔案範圍
  - 專案範圍
  - 工作區範圍

### 2. 檔案重新命名
- **功能**：
  - 檔案名稱變更
  - 自動更新 import/export 路徑
  - 更新相對路徑引用
  - 保持 Git 歷史
- **特殊處理**：
  - index 檔案處理
  - 測試檔案關聯更新
  - 設定檔引用更新

### 3. 衝突檢測
- **檢查項目**：
  - 命名衝突（同範圍內重複）
  - 保留字衝突
  - 命名慣例違反
  - 跨語言衝突
- **處理策略**：
  - 預檢查和警告
  - 建議替代名稱
  - 回滾機制

### 4. 批次重新命名
- **功能**：
  - 模式匹配批次重新命名
  - 命名規則轉換（camelCase、snake_case 等）
  - 前綴/後綴批次修改
- **安全機制**：
  - 預覽變更
  - 分階段執行
  - 原子性操作

### 5. 智能建議
- **建議類型**：
  - 基於上下文的命名建議
  - 命名慣例修正
  - 相似名稱提示
- **學習機制**：
  - 專案命名模式學習
  - 常用縮寫字典

## 介面設計

### 核心介面
```typescript
interface RenameService {
  // 符號重新命名
  renameSymbol(
    location: Location,
    newName: string,
    options?: RenameOptions
  ): Promise<RenameResult>;
  
  // 檔案重新命名
  renameFile(
    oldPath: string,
    newPath: string,
    options?: FileRenameOptions
  ): Promise<RenameResult>;
  
  // 批次重新命名
  batchRename(
    pattern: RenamePattern,
    transformer: NameTransformer
  ): Promise<BatchRenameResult>;
  
  // 重新命名驗證
  validateRename(
    location: Location,
    newName: string
  ): Promise<ValidationResult>;
  
  // 取得重新命名建議
  getSuggestions(
    location: Location,
    context?: RenameContext
  ): Promise<string[]>;
  
  // 預覽變更
  previewRename(
    location: Location,
    newName: string
  ): Promise<RenamePreview>;
}

interface RenameResult {
  success: boolean;
  changes: FileEdit[];
  affectedFiles: string[];
  conflicts?: Conflict[];
  rollback?: () => Promise<void>;
}

interface FileEdit {
  filePath: string;
  edits: TextEdit[];
  oldContent?: string;
  newContent?: string;
}

interface TextEdit {
  range: Range;
  oldText: string;
  newText: string;
}

interface Conflict {
  type: ConflictType;
  location: Location;
  message: string;
  severity: 'error' | 'warning';
}

interface RenamePattern {
  scope: 'file' | 'directory' | 'project';
  pattern: string | RegExp;
  includeFiles?: string[];
  excludeFiles?: string[];
}

interface NameTransformer {
  (oldName: string, context?: TransformContext): string;
}
```

## 實作步驟

### 第一階段：基礎重新命名
1. 實作單一符號重新命名
2. 整合 Parser 插件取得符號資訊
3. 實作引用查找邏輯
4. 編寫單元測試

### 第二階段：檔案重新命名
1. 實作檔案重新命名邏輯
2. 實作 import 路徑更新
3. 處理相對路徑
4. 編寫整合測試

### 第三階段：衝突檢測
1. 實作命名衝突檢測
2. 實作保留字檢查
3. 建立回滾機制
4. 編寫邊界測試

### 第四階段：批次處理
1. 實作模式匹配
2. 實作命名轉換器
3. 實作批次執行引擎
4. 編寫效能測試

### 第五階段：智能功能
1. 實作命名建議系統
2. 實作預覽功能
3. 加入學習機制
4. 編寫使用者體驗測試

## 測試計畫

### 單元測試
- 符號識別邏輯
- 引用查找演算法
- 命名驗證規則
- 路徑計算邏輯

### 整合測試
- 跨檔案重新命名
- 多語言支援測試
- Parser 插件整合
- 索引系統整合

### 端到端測試
- 完整重新命名流程
- 回滾功能測試
- 批次重新命名測試
- 錯誤恢復測試

### 效能測試
- 大型專案重新命名速度
- 批次處理效能
- 記憶體使用量

## 效能指標

### 目標指標
- 單一符號重新命名：< 500ms
- 檔案重新命名：< 1s
- 批次重新命名：100 檔案 < 5s
- 預覽生成：< 200ms
- 衝突檢測：< 100ms

### 優化策略
- 索引快取利用
- 並行處理
- 增量更新
- 智能批次處理

## 依賴模組
- Indexing 模組（符號索引）
- Parser 插件系統（語法分析）
- Dependency 模組（影響分析）
- Storage 模組（檔案操作）

## 特殊考量

### TypeScript/JavaScript
- 處理 default export/import
- 處理 namespace 重新命名
- 處理解構賦值
- 處理動態 import

### Swift
- 處理 protocol 重新命名
- 處理 extension 中的符號
- 處理 @objc 標記的符號
- 處理 selector 字串

## 風險評估
1. **資料損失風險**：錯誤的重新命名可能破壞程式碼
   - 緩解：完整的回滾機制和預覽功能
2. **效能問題**：大型專案可能處理緩慢
   - 緩解：優化演算法和使用快取
3. **相容性問題**：不同語言的特殊語法
   - 緩解：語言特定的處理邏輯

## 里程碑
- Week 1：基礎符號重新命名
- Week 2：檔案重新命名和路徑更新
- Week 3：衝突檢測和驗證
- Week 4：批次處理功能
- Week 5：智能建議和預覽
- Week 6：測試和優化