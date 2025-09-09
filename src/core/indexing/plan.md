# Indexing 模組開發計畫

## 模組目標
建立高效的程式碼索引系統，最小化 token 使用量，提供快速的程式碼查詢和分析能力。

## 核心功能

### 1. 檔案索引
- **功能**：建立檔案系統索引
- **資料結構**：
  - 檔案路徑樹
  - 檔案元資料（大小、修改時間、類型）
  - 檔案指紋（hash）
- **效能要求**：
  - 10,000 檔案索引 < 1 秒
  - 增量更新 < 100ms

### 2. 符號索引
- **功能**：索引程式碼符號（函式、類別、變數等）
- **資料結構**：
  - 符號表（Symbol Table）
  - 範圍樹（Scope Tree）
  - 符號位置索引
- **支援符號類型**：
  - 函式/方法
  - 類別/介面
  - 變數/常數
  - 型別定義
  - 模組/命名空間

### 3. 依賴關係索引
- **功能**：追蹤檔案和符號間的依賴關係
- **資料結構**：
  - 依賴圖（Dependency Graph）
  - 引用索引（Reference Index）
  - 影響範圍快取
- **關係類型**：
  - import/export
  - 繼承關係
  - 實作關係
  - 呼叫關係

### 4. 索引儲存
- **儲存格式**：
  - 二進位格式（效能優先）
  - JSON 格式（開發除錯）
- **壓縮策略**：
  - 符號名稱字典壓縮
  - 路徑前綴樹壓縮
- **快取策略**：
  - LRU 記憶體快取
  - 持久化磁碟快取

### 5. 增量更新
- **監聽機制**：
  - 檔案系統變更監聽
  - Git 變更追蹤
- **更新策略**：
  - 差異計算
  - 局部重建
  - 依賴傳播

## 介面設計

### 核心介面
```typescript
interface IndexingService {
  // 建立索引
  createIndex(rootPath: string, options?: IndexOptions): Promise<Index>;
  
  // 更新索引
  updateIndex(index: Index, changes: FileChange[]): Promise<Index>;
  
  // 查詢索引
  querySymbols(index: Index, query: SymbolQuery): Promise<Symbol[]>;
  queryFiles(index: Index, query: FileQuery): Promise<FileInfo[]>;
  queryDependencies(index: Index, target: string): Promise<Dependency[]>;
  
  // 索引管理
  saveIndex(index: Index, path: string): Promise<void>;
  loadIndex(path: string): Promise<Index>;
  optimizeIndex(index: Index): Promise<Index>;
}

interface Index {
  version: string;
  rootPath: string;
  fileIndex: FileIndex;
  symbolIndex: SymbolIndex;
  dependencyGraph: DependencyGraph;
  metadata: IndexMetadata;
}

interface Symbol {
  name: string;
  type: SymbolType;
  location: Location;
  scope: Scope;
  modifiers: string[];
  signature?: string;
}

interface FileInfo {
  path: string;
  size: number;
  modified: Date;
  hash: string;
  language: string;
  symbols: Symbol[];
}

interface Dependency {
  source: string;
  target: string;
  type: DependencyType;
  symbols?: string[];
}
```

## 實作步驟

### 第一階段：基礎檔案索引
1. 實作檔案掃描器
2. 建立檔案元資料索引
3. 實作檔案變更監聽
4. 編寫單元測試（覆蓋率 > 90%）

### 第二階段：符號索引
1. 整合 Parser 插件系統
2. 實作符號提取邏輯
3. 建立符號索引結構
4. 實作符號查詢 API
5. 編寫單元測試

### 第三階段：依賴分析
1. 實作依賴關係提取
2. 建立依賴圖結構
3. 實作影響範圍分析
4. 編寫整合測試

### 第四階段：效能優化
1. 實作索引壓縮
2. 加入快取層
3. 實作增量更新
4. 效能測試和調優

### 第五階段：持久化
1. 實作索引序列化
2. 實作索引載入
3. 實作索引版本管理
4. 編寫端到端測試

## 測試計畫

### 單元測試
- 檔案掃描邏輯
- 符號提取邏輯
- 索引資料結構操作
- 查詢演算法

### 整合測試
- Parser 插件整合
- 索引更新流程
- 查詢效能測試

### 效能測試
- 大型專案索引速度
- 記憶體使用量
- 查詢響應時間
- 增量更新效能

## 效能指標

### 目標指標
- 初次索引：1000 檔案/秒
- 增量更新：< 100ms（單檔案）
- 符號查詢：< 50ms
- 記憶體使用：< 100MB（10,000 檔案）
- 索引大小：< 原始碼 10%

### 優化策略
- 並行處理
- 智能快取
- 延遲載入
- 索引分片

## 依賴模組
- Parser 插件系統
- Cache 模組
- Storage 模組
- Utils 模組

## 風險評估
1. **效能瓶頸**：大型專案索引可能過慢
   - 緩解：實作並行處理和索引分片
2. **記憶體消耗**：索引可能佔用過多記憶體
   - 緩解：實作 LRU 快取和磁碟交換
3. **相容性問題**：不同語言的符號提取差異
   - 緩解：標準化 Parser 插件介面

## 里程碑
- Week 1-2：基礎檔案索引
- Week 3-4：符號索引實作
- Week 5：依賴分析
- Week 6：效能優化和測試