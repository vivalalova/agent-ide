# Indexing 模組開發規範

## 模組職責
負責建立和維護程式碼索引，提供高效的符號查詢和依賴追蹤，是其他模組的基礎設施。

## 開發原則

### 1. 效能優先
- **Token 最小化**：每次查詢返回最精簡的結果
- **增量更新**：只處理變更部分，避免全量重建
- **智能快取**：多層快取策略，減少重複計算
- **並行處理**：充分利用多核心，提升索引速度

### 2. 資料結構設計
- 使用 Map 而非 Object 作為索引容器
- 使用 WeakMap 存放暫時性資料
- 使用 Set 處理唯一值集合
- 考慮記憶體效率，避免資料重複

### 3. 錯誤處理
- 索引失敗不應中斷整體流程
- 提供降級策略（部分索引）
- 詳細的錯誤日誌和恢復機制
- 支援索引修復和重建

## 實作規範

### 檔案結構
```
indexing/
├── index.ts           # 模組入口和公開 API
├── service.ts         # IndexingService 實作
├── file-indexer.ts    # 檔案索引器
├── symbol-indexer.ts  # 符號索引器
├── dependency-indexer.ts # 依賴索引器
├── storage/
│   ├── index-storage.ts    # 索引儲存介面
│   ├── memory-storage.ts   # 記憶體儲存
│   └── disk-storage.ts     # 磁碟持久化
├── cache/
│   ├── cache-manager.ts    # 快取管理
│   └── lru-cache.ts        # LRU 快取實作
├── utils/
│   ├── hash.ts             # 檔案指紋計算
│   └── path.ts             # 路徑處理工具
└── types.ts           # 型別定義
```

### 介面設計原則
- 所有公開方法都返回 Promise
- 使用 Options 物件而非多參數
- 提供同步和異步兩種 API（必要時）
- 支援取消操作（AbortController）

### 測試要求
- 單元測試覆蓋率 > 90%
- 必須包含效能測試
- 測試大型專案場景（10,000+ 檔案）
- 測試增量更新正確性

## 關鍵實作細節

### 索引鍵設計
```typescript
// 使用組合鍵提升查詢效率
type IndexKey = `${FileHash}:${SymbolType}:${SymbolName}`;

// 範例
const key: IndexKey = `${fileHash}:function:getUserData`;
```

### 符號提取策略
```typescript
// 分層提取，按需載入
interface SymbolExtraction {
  level1: BasicSymbolInfo;    // 名稱、類型、位置
  level2: ExtendedSymbolInfo;  // + 修飾符、簽名
  level3: CompleteSymbolInfo;  // + 文件、關聯
}
```

### 快取策略
```typescript
// 三層快取架構
class CacheHierarchy {
  l1: Map<string, any>;      // 熱資料（< 100 項）
  l2: LRUCache<string, any>; // 常用資料（< 1000 項）
  l3: DiskCache<string, any>; // 完整快取
}
```

## 效能基準

### 目標指標
- 初始索引：1000 檔案/秒
- 符號查詢：< 10ms（快取命中）
- 增量更新：< 50ms/檔案
- 記憶體使用：< 10MB/1000 檔案

### 效能監控
```typescript
// 所有關鍵操作都要記錄效能
performance.mark('index-start');
// ... 操作
performance.mark('index-end');
performance.measure('indexing', 'index-start', 'index-end');
```

## 與其他模組協作

### 依賴關係
- **Parser 插件**：獲取 AST 和符號資訊
- **Cache 模組**：共享快取基礎設施
- **Storage 模組**：持久化索引資料

### 提供服務
- **Rename 模組**：快速查找符號引用
- **Move 模組**：檔案依賴關係
- **Search 模組**：索引查詢加速
- **Analysis 模組**：符號統計資訊

## 增量更新演算法

### 變更檢測
```typescript
interface ChangeDetection {
  // 使用檔案 hash 快速檢測
  detectChanges(files: string[]): ChangedFiles;
  
  // 細粒度變更分析
  analyzeImpact(change: FileChange): ImpactScope;
  
  // 最小化更新範圍
  optimizeUpdate(scope: ImpactScope): UpdatePlan;
}
```

### 更新策略
1. 檔案級更新：檔案內容變更
2. 符號級更新：只更新變更的符號
3. 依賴傳播：更新受影響的依賴

## 並行處理

### Worker Pool
```typescript
class IndexWorkerPool {
  private workers: Worker[];
  private taskQueue: IndexTask[];
  
  // 動態調整 worker 數量
  adjustWorkers(cpuUsage: number): void;
  
  // 任務分配策略
  distributeTask(task: IndexTask): Worker;
}
```

### 任務分割
- 按檔案大小分組
- 按檔案類型分組
- 按目錄結構分片
- 避免依賴衝突

## 儲存格式

### 二進位格式（效能優先）
```typescript
// 使用 MessagePack 或 Protocol Buffers
interface BinaryFormat {
  magic: number;      // 0x49445800 ('IDX\0')
  version: number;    // 格式版本
  header: Header;     // 元資料
  data: Uint8Array;   // 壓縮的索引資料
}
```

### JSON 格式（開發除錯）
```typescript
interface JSONFormat {
  version: string;
  created: Date;
  files: FileIndex[];
  symbols: SymbolIndex[];
  dependencies: DependencyIndex[];
}
```

## 錯誤恢復

### 索引損壞處理
1. 檢測損壞（checksum 驗證）
2. 嘗試部分恢復
3. 標記損壞區域
4. 背景重建

### 容錯機制
```typescript
class FaultTolerantIndexer {
  // 重試機制
  async indexWithRetry(file: string, maxRetries = 3): Promise<Index>;
  
  // 降級處理
  async fallbackIndex(file: string): Promise<PartialIndex>;
  
  // 錯誤隔離
  isolateError(error: Error, context: IndexContext): void;
}
```

## 記憶體管理

### 記憶體限制
```typescript
class MemoryManager {
  private maxMemory = 500 * 1024 * 1024; // 500MB
  
  // 監控記憶體使用
  monitorUsage(): MemoryStats;
  
  // 觸發清理
  triggerGC(): void;
  
  // 降級到磁碟
  spillToDisk(data: any): void;
}
```

### 資料壓縮
- 符號名稱字典化
- 路徑前綴樹壓縮
- 重複資料消除
- 使用二進位格式

## 開發檢查清單

### 新功能開發
- [ ] 先寫測試（TDD）
- [ ] 考慮效能影響
- [ ] 實作快取策略
- [ ] 加入效能監控
- [ ] 處理邊界情況
- [ ] 更新文件

### Code Review 要點
- [ ] 記憶體洩漏風險
- [ ] 並發安全性
- [ ] 錯誤處理完整性
- [ ] 效能基準達標
- [ ] 測試覆蓋充分

## 疑難排解

### 常見問題
1. **索引速度慢**
   - 檢查並行度設定
   - 確認快取運作正常
   - 分析瓶頸位置

2. **記憶體使用過高**
   - 調整快取大小
   - 啟用磁碟交換
   - 優化資料結構

3. **索引不準確**
   - 驗證 Parser 輸出
   - 檢查增量更新邏輯
   - 確認檔案變更檢測

## 未來優化方向
1. 支援分散式索引
2. 機器學習輔助索引
3. 自適應快取策略
4. 即時協作索引同步