# Search 模組開發計畫

## 模組目標
提供高效、精確、多維度的程式碼搜尋功能，支援文字、語義、結構化搜尋，最小化 token 使用。

## 核心功能

### 1. 文字搜尋
- **搜尋模式**：
  - 純文字搜尋
  - 正則表達式
  - 模糊匹配（Fuzzy）
  - 萬用字元
- **搜尋選項**：
  - 大小寫敏感
  - 全字匹配
  - 多行匹配
  - 反向搜尋（排除）

### 2. 語義搜尋
- **符號搜尋**：
  - 函式定義
  - 類別宣告
  - 變數使用
  - 型別引用
- **智能匹配**：
  - 駝峰縮寫（如 gTD 匹配 getTodoData）
  - 同義詞匹配
  - 相似名稱建議
  - 上下文感知

### 3. 結構化搜尋
- **AST 搜尋**：
  - 程式碼模式匹配
  - 結構化查詢語言
  - 程式碼片段搜尋
  - 語法樹遍歷
- **查詢範例**：
  - 找出所有 async 函式
  - 找出特定參數數量的函式
  - 找出實作特定介面的類別
  - 找出特定複雜度的函式

### 4. 範圍控制
- **搜尋範圍**：
  - 當前檔案
  - 專案範圍
  - 目錄範圍
  - 檔案類型過濾
- **排除規則**：
  - .gitignore 整合
  - 自定義排除模式
  - 二進位檔案跳過
  - 大檔案處理

### 5. 搜尋優化
- **索引加速**：
  - 全文索引
  - 符號索引
  - 三元組索引（Trigram）
  - 增量索引更新
- **結果排序**：
  - 相關性評分
  - 使用頻率
  - 最近修改
  - 檔案重要性

## 介面設計

### 核心介面
```typescript
interface SearchService {
  // 文字搜尋
  searchText(
    query: string,
    options?: TextSearchOptions
  ): Promise<SearchResult>;
  
  // 符號搜尋
  searchSymbols(
    query: SymbolQuery,
    options?: SymbolSearchOptions
  ): Promise<SymbolSearchResult>;
  
  // 結構化搜尋
  searchByPattern(
    pattern: CodePattern,
    options?: PatternSearchOptions
  ): Promise<PatternSearchResult>;
  
  // 語義搜尋
  searchSemantic(
    query: string,
    context?: SearchContext
  ): Promise<SemanticSearchResult>;
  
  // 批次搜尋
  batchSearch(
    queries: SearchQuery[]
  ): Promise<BatchSearchResult>;
  
  // 搜尋建議
  getSuggestions(
    partial: string,
    context?: SearchContext
  ): Promise<SearchSuggestion[]>;
}

interface SearchResult {
  matches: Match[];
  totalCount: number;
  searchTime: number;
  truncated: boolean;
}

interface Match {
  file: string;
  line: number;
  column: number;
  content: string;
  context: MatchContext;
  score: number;
}

interface MatchContext {
  before: string[];
  after: string[];
  function?: string;
  class?: string;
}

interface SymbolQuery {
  name?: string;
  type?: SymbolType;
  modifiers?: string[];
  scope?: SearchScope;
}

interface CodePattern {
  type: 'ast' | 'regex' | 'template';
  pattern: string | ASTPattern;
  language?: string;
}

interface ASTPattern {
  nodeType: string;
  properties?: Record<string, any>;
  children?: ASTPattern[];
}

interface SearchOptions {
  scope: SearchScope;
  includeFiles?: string[];
  excludeFiles?: string[];
  maxResults?: number;
  timeout?: number;
  useIndex?: boolean;
}

interface SearchScope {
  type: 'file' | 'directory' | 'project' | 'workspace';
  path?: string;
  recursive?: boolean;
}

interface SemanticSearchResult extends SearchResult {
  suggestions: string[];
  relatedSymbols: Symbol[];
  confidence: number;
}
```

## 實作步驟

### 第一階段：基礎文字搜尋
1. 實作純文字搜尋引擎
2. 加入正則表達式支援
3. 實作檔案過濾機制
4. 編寫單元測試

### 第二階段：索引整合
1. 整合 Indexing 模組
2. 實作索引查詢優化
3. 建立快取機制
4. 編寫效能測試

### 第三階段：符號搜尋
1. 實作符號查詢邏輯
2. 整合 Parser 插件
3. 實作智能匹配
4. 編寫符號測試

### 第四階段：結構化搜尋
1. 設計查詢語言
2. 實作 AST 匹配引擎
3. 建立模式庫
4. 編寫模式測試

### 第五階段：語義搜尋
1. 實作語義分析
2. 建立同義詞庫
3. 加入 AI 輔助（可選）
4. 編寫語義測試

## 測試計畫

### 單元測試
- 搜尋演算法
- 匹配邏輯
- 評分系統
- 過濾機制

### 整合測試
- 索引整合
- Parser 整合
- 多語言支援
- 並發搜尋

### 效能測試
- 大檔案搜尋
- 大量檔案搜尋
- 複雜模式匹配
- 索引效能

### 準確性測試
- 精確匹配測試
- 模糊匹配測試
- 排序準確性
- 邊界情況

## 效能指標

### 目標指標
- 文字搜尋：< 100ms（10,000 檔案）
- 符號搜尋：< 50ms（使用索引）
- 模式搜尋：< 500ms
- 建議生成：< 30ms
- 記憶體使用：< 200MB

### 優化策略
- 多線程並行搜尋
- 增量結果返回
- 智能索引使用
- 結果串流處理
- LRU 快取

## 依賴模組
- Indexing 模組（索引支援）
- Parser 插件（AST 分析）
- Cache 模組（結果快取）

## 特殊功能

### 搜尋歷史
- 最近搜尋記錄
- 常用搜尋模式
- 搜尋結果快取
- 搜尋統計分析

### 智能功能
- 拼寫糾正
- 搜尋建議
- 相關搜尋
- 熱門搜尋

### 高級選項
- 搜尋表達式
- 搜尋宏
- 搜尋模板
- 搜尋別名

## 語言特定處理

### TypeScript/JavaScript
- JSX/TSX 支援
- 模板字串搜尋
- 動態屬性搜尋
- Decorator 搜尋

### Swift
- Protocol 搜尋
- Extension 搜尋
- Generic 搜尋
- Attribute 搜尋

## 搜尋語法設計

### 基本語法
```
term           # 簡單文字
"exact match"  # 精確匹配
/regex/        # 正則表達式
func:name      # 函式搜尋
class:Name     # 類別搜尋
type:interface # 型別搜尋
```

### 組合語法
```
term1 AND term2     # 且
term1 OR term2      # 或
NOT term           # 非
(term1 OR term2)   # 分組
```

### 進階語法
```
@async function    # 修飾符搜尋
:extends Base      # 繼承搜尋
#complexity > 10   # 度量搜尋
~similar           # 相似搜尋
```

## 風險評估
1. **效能瓶頸**：大型程式碼庫搜尋緩慢
   - 緩解：分片索引和並行處理
2. **記憶體消耗**：索引佔用過多記憶體
   - 緩解：索引壓縮和分級儲存
3. **準確性問題**：搜尋結果不準確
   - 緩解：改進評分演算法
4. **複雜度問題**：查詢語言過於複雜
   - 緩解：提供簡單和進階模式

## 里程碑
- Week 1：基礎文字搜尋
- Week 2：索引整合優化
- Week 3：符號搜尋實作
- Week 4：結構化搜尋
- Week 5：語義搜尋和智能功能
- Week 6：效能優化和測試