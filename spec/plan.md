# Agent IDE - RAG 智能程式碼檢索系統實作計畫

## 專案目標

建立智能程式碼檢索系統，幫助 AI 用最少 token 找到最相關的程式碼，核心價值：

- **最小化 token 消耗**：精準檢索，只返回真正需要的程式碼
- **最大化檢索準確度**：語義理解 + 符號索引 + 依賴關係
- **漸進式資訊揭露**：先索引 → 再摘要 → 最後完整程式碼
- **智能上下文感知**：自動包含相關依賴和型別定義

---

## 架構設計

### 系統分層

```
┌─────────────────────────────────────────────────────┐
│              MCP Interface Layer                    │
│         code_semantic_search 工具                    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│         Application Services Layer                  │
│         CodeRetrievalService (新增)                  │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│              Core Services Layer                    │
│  ┌──────────────┬──────────────┬─────────────────┐ │
│  │ Indexing     │ Search       │ Dependency      │ │
│  │ (重用)       │ (擴充)       │ (重用)          │ │
│  └──────────────┴──────────────┴─────────────────┘ │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│         Infrastructure Layer (重用)                  │
│    Cache | Storage | Parser | Utils                │
└─────────────────────────────────────────────────────┘
```

### 資料流程

```
AI Query → CodeRetrievalService → 多階段檢索流程：

1. Query Analysis 階段
   └─ 解析查詢意圖、提取關鍵字、判斷查詢類型

2. Multi-Stage Retrieval 階段
   ├─ Stage 1: 符號索引快速定位 (SymbolIndex)
   ├─ Stage 2: 語義搜尋擴展相關程式碼 (SemanticSearchEngine)
   └─ Stage 3: 依賴分析補充上下文 (DependencyAnalyzer)

3. Ranking & Filtering 階段
   └─ 多維度評分、依 token 預算篩選

4. Progressive Disclosure 階段
   ├─ Level 1: 符號簽章 (最少 token)
   ├─ Level 2: 簽章 + 文件註解
   └─ Level 3: 完整實作程式碼

5. Result Assembly 階段
   └─ 組裝結果、計算 token、生成摘要
```

---

## 可重用模組分析

### ✅ 完全重用

1. **Indexing 模組** (`src/core/indexing/`)
   - IndexEngine: 專案索引引擎
   - SymbolIndex: 符號快速查詢
   - FileIndex: 檔案元資料管理
   - 用途: RAG 的基礎索引層

2. **Dependency 模組** (`src/core/dependency/`)
   - DependencyAnalyzer: 分析依賴關係
   - DependencyGraph: 圖結構查詢
   - 用途: 自動補充相關依賴程式碼

3. **Infrastructure 層**
   - Cache: 快取熱門查詢結果
   - Parser: 提取程式碼結構
   - Storage: 向量/索引持久化

### 🔧 擴充增強

**Search 模組** (`src/core/search/`)
- 現有: TextSearchEngine (文字搜尋)
- **新增**: SemanticSearchEngine (語義搜尋)
- **新增**: HybridSearchEngine (混合策略)

### ➕ 全新實作

**Application Services** (`src/application/services/`)
- **新增**: CodeRetrievalService (統籌所有檢索邏輯)

**MCP Interface** (`src/interfaces/mcp/`)
- **新增**: code_semantic_search 工具

---

## 詳細模組設計

### 1. SemanticSearchEngine (新增)

**檔案位置**: `src/core/search/engines/semantic-engine.ts`

**核心功能**:
- 向量化查詢和程式碼
- 語義相似度計算
- 混合 BM25 + 向量搜尋

**實作策略**:
```typescript
export class SemanticSearchEngine {
  // 第一階段: 使用簡單的 TF-IDF + 餘弦相似度
  // 第二階段: 整合輕量級嵌入模型 (如 all-MiniLM-L6-v2)
  // 第三階段: 支援自定義嵌入服務

  async search(query: SemanticQuery): Promise<SearchResult> {
    // 1. 查詢向量化
    const queryVector = await this.vectorize(query.text);

    // 2. 向量搜尋 (top-k)
    const candidates = await this.vectorSearch(queryVector, query.maxResults * 3);

    // 3. 重排序 (混合多種信號)
    const ranked = await this.rerank(candidates, query);

    // 4. Token 預算控制
    return this.filterByTokenBudget(ranked, query.maxTokens);
  }
}
```

**相似度評分模型**:
```typescript
interface RelevanceScore {
  vectorSimilarity: number;    // 0.0-1.0 語義相似度
  symbolMatch: number;         // 0.0-1.0 符號名稱匹配
  dependencyRelevance: number; // 0.0-1.0 依賴關係權重
  recency: number;             // 0.0-1.0 最近使用頻率

  // 加權總分
  final: number; // = 0.4*vector + 0.3*symbol + 0.2*dep + 0.1*recency
}
```

---

### 2. CodeRetrievalService (新增)

**檔案位置**: `src/application/services/code-retrieval.service.ts`

**核心職責**:
- 統籌多階段檢索流程
- 實作漸進式資訊揭露
- Token 預算管理
- 快取協調

**核心方法設計**:

```typescript
export class CodeRetrievalService {
  constructor(
    private indexEngine: IndexEngine,
    private searchService: SearchService,
    private dependencyAnalyzer: DependencyAnalyzer,
    private cacheCoordinator: CacheCoordinator,
    private eventBus: EventBus
  ) {}

  /**
   * 智能檢索相關程式碼
   */
  async retrieve(options: RetrievalOptions): Promise<RetrievalResult> {
    // 1. 查詢分析
    const analysis = this.analyzeQuery(options.query);

    // 2. 多階段檢索
    const candidates = await this.multiStageRetrieval(analysis, options);

    // 3. 依賴補充
    const enriched = await this.enrichWithDependencies(candidates, options);

    // 4. 排序與過濾
    const filtered = await this.rankAndFilter(enriched, options);

    // 5. 漸進式組裝
    return await this.assembleResult(filtered, options);
  }

  /**
   * 多階段檢索
   */
  private async multiStageRetrieval(
    analysis: QueryAnalysis,
    options: RetrievalOptions
  ): Promise<CodeCandidate[]> {
    const candidates = new Map<string, CodeCandidate>();

    // Stage 1: 符號索引 (最快、最精準)
    if (analysis.hasSymbolQuery) {
      const symbols = await this.indexEngine.searchSymbols(
        analysis.symbolPattern,
        { maxResults: 20 }
      );
      this.addCandidates(candidates, symbols, 'symbol', 1.0);
    }

    // Stage 2: 語義搜尋 (擴展相關程式碼)
    if (analysis.hasSemanticQuery) {
      const semantic = await this.searchService.searchSemantic(
        analysis.semanticQuery,
        { maxResults: 30 }
      );
      this.addCandidates(candidates, semantic.matches, 'semantic', 0.8);
    }

    // Stage 3: 文字搜尋 (後備策略)
    if (candidates.size < 5) {
      const text = await this.searchService.searchText({
        type: 'text',
        query: analysis.keywords.join(' '),
        options: { maxResults: 10, fuzzy: true }
      });
      this.addCandidates(candidates, text.matches, 'text', 0.5);
    }

    return Array.from(candidates.values());
  }

  /**
   * 依賴關係補充
   */
  private async enrichWithDependencies(
    candidates: CodeCandidate[],
    options: RetrievalOptions
  ): Promise<CodeCandidate[]> {
    if (!options.includeDependencies) return candidates;

    const enriched: CodeCandidate[] = [];

    for (const candidate of candidates) {
      enriched.push(candidate);

      // 只補充高相關性候選的依賴
      if (candidate.score > 0.7) {
        const deps = await this.dependencyAnalyzer.getDependencies(candidate.filePath);

        // 只加入直接依賴，限制深度
        for (const dep of deps.slice(0, 3)) {
          enriched.push({
            ...await this.loadCandidate(dep),
            source: 'dependency',
            score: candidate.score * 0.5,
            parentFile: candidate.filePath
          });
        }
      }
    }

    return enriched;
  }

  /**
   * 漸進式結果組裝
   */
  private async assembleResult(
    candidates: CodeCandidate[],
    options: RetrievalOptions
  ): Promise<RetrievalResult> {
    const levels = this.determineDisclosureLevel(options.maxTokens);
    const snippets: CodeSnippet[] = [];
    let totalTokens = 0;

    for (const candidate of candidates) {
      // 根據 token 預算動態調整揭露層級
      const level = this.selectLevelForCandidate(
        candidate,
        options.maxTokens - totalTokens,
        levels
      );

      const snippet = await this.extractSnippet(candidate, level);
      snippets.push(snippet);
      totalTokens += snippet.tokenCount;

      if (totalTokens >= options.maxTokens) break;
    }

    return {
      snippets,
      totalTokens,
      metadata: {
        query: options.query,
        candidatesFound: candidates.length,
        candidatesReturned: snippets.length,
        disclosureLevels: this.summarizeLevels(snippets)
      }
    };
  }
}
```

**型別定義**:

```typescript
// 檢索選項
interface RetrievalOptions {
  query: string;                    // 查詢文字
  intent?: QueryIntent;             // 查詢意圖 (可選)
  maxTokens: number;                // Token 預算
  maxResults?: number;              // 最大結果數
  includeDependencies?: boolean;    // 是否包含依賴
  disclosureLevel?: DisclosureLevel; // 強制指定層級
  filters?: RetrievalFilters;       // 過濾條件
}

// 查詢意圖
enum QueryIntent {
  FIND_DEFINITION = 'find_definition',       // 找定義
  FIND_USAGE = 'find_usage',                 // 找使用
  FIND_IMPLEMENTATION = 'find_implementation', // 找實作
  UNDERSTAND_FLOW = 'understand_flow',       // 理解流程
  DEBUG_ERROR = 'debug_error',               // 除錯
  REFACTOR = 'refactor'                      // 重構
}

// 揭露層級
enum DisclosureLevel {
  SIGNATURE = 1,      // 僅簽章 (~20 tokens/function)
  SIGNATURE_DOC = 2,  // 簽章+文件 (~50 tokens/function)
  FULL_CODE = 3       // 完整程式碼 (視實作而定)
}

// 程式碼候選
interface CodeCandidate {
  filePath: string;
  symbol?: Symbol;
  range: Range;
  score: number;
  source: 'symbol' | 'semantic' | 'text' | 'dependency';
  parentFile?: string; // 如果是依賴項目，記錄來源
}

// 程式碼片段
interface CodeSnippet {
  filePath: string;
  code: string;
  level: DisclosureLevel;
  tokenCount: number;
  symbol?: Symbol;
  metadata: {
    language: string;
    relevanceScore: number;
    isDependency: boolean;
  };
}

// 檢索結果
interface RetrievalResult {
  snippets: CodeSnippet[];
  totalTokens: number;
  metadata: {
    query: string;
    candidatesFound: number;
    candidatesReturned: number;
    disclosureLevels: Record<DisclosureLevel, number>;
  };
}
```

---

### 3. MCP 工具介面 (新增)

**檔案位置**: `src/interfaces/mcp/tools/semantic-search.ts`

**工具定義**:

```typescript
export const semanticSearchTool: MCPTool = {
  name: 'code_semantic_search',
  description: `智能檢索相關程式碼，最小化 token 消耗。

適用場景：
- 找特定功能的實作位置
- 理解某個模組的結構
- 尋找特定介面的實現
- 追蹤程式碼呼叫鏈

特點：
- 語義理解查詢意圖
- 自動包含相關依賴
- 漸進式資訊揭露
- Token 預算控制`,

  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '描述你想找什麼 (如: "處理使用者登入的函式", "IndexEngine 的索引方法")'
      },
      maxTokens: {
        type: 'number',
        description: 'Token 預算限制 (預設: 2000)',
        default: 2000
      },
      intent: {
        type: 'string',
        enum: ['find_definition', 'find_usage', 'find_implementation', 'understand_flow', 'debug_error', 'refactor'],
        description: '查詢意圖 (可選，系統會自動推測)'
      },
      includeDependencies: {
        type: 'boolean',
        description: '是否包含相關依賴 (預設: true)',
        default: true
      },
      disclosureLevel: {
        type: 'string',
        enum: ['signature', 'signature_doc', 'full_code'],
        description: '揭露層級 (預設: 自動根據 token 預算)'
      }
    },
    required: ['query']
  },

  async handler(args: SemanticSearchArgs): Promise<MCPToolResult> {
    const service = ServiceRegistry.get<CodeRetrievalService>('code-retrieval');

    const result = await service.retrieve({
      query: args.query,
      maxTokens: args.maxTokens || 2000,
      intent: args.intent,
      includeDependencies: args.includeDependencies !== false,
      disclosureLevel: args.disclosureLevel
    });

    return {
      content: [
        {
          type: 'text',
          text: formatRetrievalResult(result)
        }
      ]
    };
  }
};

/**
 * 格式化檢索結果為人類可讀格式
 */
function formatRetrievalResult(result: RetrievalResult): string {
  const lines: string[] = [];

  lines.push(`# 檢索結果 (${result.snippets.length} 個結果, ${result.totalTokens} tokens)\n`);

  for (const snippet of result.snippets) {
    lines.push(`## ${snippet.filePath}${snippet.symbol ? `:${snippet.symbol.name}` : ''}`);
    lines.push(`相關性: ${(snippet.metadata.relevanceScore * 100).toFixed(0)}%`);
    lines.push('```' + snippet.metadata.language);
    lines.push(snippet.code);
    lines.push('```\n');
  }

  return lines.join('\n');
}
```

---

## 實作階段規劃

### Phase 1: 基礎語義搜尋 (Week 1-2)

**目標**: 建立可運作的語義搜尋原型

**任務清單**:

1. **實作 SemanticSearchEngine 基礎版本**
   - 檔案: `src/core/search/engines/semantic-engine.ts`
   - 使用 TF-IDF + 餘弦相似度
   - 整合現有 SymbolIndex
   - 測試: `tests/core/search/semantic-engine.test.ts`

2. **擴充 Search 模組型別定義**
   - 檔案: `src/core/search/types.ts`
   - 新增 `SemanticQuery`, `SemanticSearchResult`
   - 新增 `QueryIntent` enum

3. **實作查詢分析器**
   - 檔案: `src/core/search/query-analyzer.ts`
   - 提取關鍵字
   - 推測查詢意圖
   - 測試: `tests/core/search/query-analyzer.test.ts`

4. **整合到 SearchService**
   - 修改: `src/core/search/service.ts`
   - 新增 `searchSemantic()` 方法
   - 更新現有測試

**驗收標準**:
- 能執行基本語義搜尋
- 準確率 > 60% (與文字搜尋比較)
- 搜尋時間 < 200ms (1000 檔案)

---

### Phase 2: CodeRetrievalService 核心邏輯 (Week 3-4)

**目標**: 實作完整檢索服務

**任務清單**:

1. **建立 CodeRetrievalService 骨架**
   - 檔案: `src/application/services/code-retrieval.service.ts`
   - 實作多階段檢索流程
   - 實作依賴補充邏輯

2. **實作排序與過濾**
   - 多維度評分系統
   - Token 預算管理
   - 重複檢測與去重

3. **實作漸進式揭露**
   - 程式碼提取器 (依層級)
   - Token 計算器
   - 動態層級選擇

4. **整合 Application Services**
   - 連接 EventBus
   - 連接 CacheCoordinator
   - 連接 StateManager

5. **撰寫完整測試**
   - 單元測試: `tests/application/services/code-retrieval.service.test.ts`
   - 整合測試: `tests/e2e/retrieval/semantic-retrieval.e2e.test.ts`

**驗收標準**:
- 能處理複雜查詢 (多意圖)
- Token 消耗準確控制 (誤差 < 5%)
- 端到端測試通過率 100%

---

### Phase 3: MCP 介面與優化 (Week 5)

**目標**: 完善 MCP 工具，效能優化

**任務清單**:

1. **實作 MCP 工具**
   - 檔案: `src/interfaces/mcp/tools/semantic-search.ts`
   - 參數驗證
   - 錯誤處理
   - 結果格式化

2. **效能優化**
   - 實作查詢快取
   - 批次處理優化
   - 並行處理優化

3. **品質提升**
   - 相關性評分調優
   - 依賴補充策略優化
   - Token 估算準確性提升

4. **文件與範例**
   - 更新 CLAUDE.md
   - 撰寫使用範例
   - 撰寫最佳實踐指南

**驗收標準**:
- MCP 工具可正常呼叫
- 快取命中率 > 40%
- 端到端回應時間 < 500ms

---

### Phase 4: 向量化搜尋增強 (Week 6+, 可選)

**目標**: 整合真正的向量嵌入模型

**任務清單**:

1. **研究輕量級嵌入方案**
   - 評估 all-MiniLM-L6-v2
   - 評估 CodeBERT
   - 評估 GraphCodeBERT

2. **實作向量儲存層**
   - 選擇向量資料庫 (如 Faiss, Qdrant)
   - 實作向量索引
   - 實作增量更新

3. **整合到 SemanticSearchEngine**
   - 替換 TF-IDF
   - 調整評分權重
   - A/B 測試比較

**驗收標準**:
- 準確率 > 85%
- 搜尋時間 < 300ms
- 向量索引大小 < 50MB (1000 檔案)

---

## 測試策略

### 單元測試 (Unit Tests)

**覆蓋範圍**:
- SemanticSearchEngine: 向量化、搜尋、排序邏輯
- QueryAnalyzer: 意圖識別、關鍵字提取
- CodeRetrievalService: 各階段獨立測試
- Token 計算器: 準確性測試

**測試資料**:
```typescript
// 測試查詢範例
const testQueries = [
  { query: 'find user login function', expectedIntent: QueryIntent.FIND_DEFINITION },
  { query: 'where is IndexEngine used', expectedIntent: QueryIntent.FIND_USAGE },
  { query: 'how does search work', expectedIntent: QueryIntent.UNDERSTAND_FLOW }
];
```

---

### 整合測試 (Integration Tests)

**測試場景**:

1. **端到端檢索流程**
   ```typescript
   test('應該能找到正確的登入功能實作', async () => {
     const result = await service.retrieve({
       query: 'user authentication logic',
       maxTokens: 1000
     });

     expect(result.snippets).toContainFileMatching(/auth.*\.ts/);
     expect(result.totalTokens).toBeLessThanOrEqual(1000);
   });
   ```

2. **依賴補充測試**
   ```typescript
   test('應該自動包含相關型別定義', async () => {
     const result = await service.retrieve({
       query: 'SearchService',
       includeDependencies: true
     });

     const files = result.snippets.map(s => s.filePath);
     expect(files).toContain('src/core/search/types.ts');
   });
   ```

3. **Token 預算控制測試**
   ```typescript
   test('應該嚴格遵守 token 預算', async () => {
     const budgets = [500, 1000, 2000, 5000];

     for (const budget of budgets) {
       const result = await service.retrieve({
         query: 'complex query',
         maxTokens: budget
       });

       expect(result.totalTokens).toBeLessThanOrEqual(budget);
       expect(result.totalTokens).toBeGreaterThan(budget * 0.8); // 至少用 80%
     }
   });
   ```

---

### 效能測試 (Performance Tests)

**關鍵指標**:

| 指標 | 目標值 | 測試方法 |
|------|--------|----------|
| 搜尋延遲 | < 200ms (P95) | 1000 次查詢負載測試 |
| Token 估算誤差 | < 5% | 比對實際 tokenizer 結果 |
| 快取命中率 | > 40% | 模擬真實查詢分佈 |
| 記憶體使用 | < 200MB | 索引 5000 檔案後測量 |
| 準確率 | > 80% | 人工標註測試集驗證 |

**效能測試範例**:
```typescript
test('搜尋效能測試', async () => {
  const queries = generateRandomQueries(1000);
  const startTime = Date.now();

  for (const query of queries) {
    await service.retrieve({ query, maxTokens: 1000 });
  }

  const avgTime = (Date.now() - startTime) / queries.length;
  expect(avgTime).toBeLessThan(200);
});
```

---

### 準確率測試 (Accuracy Tests)

**測試方法**:
1. 建立金標準測試集 (50 個查詢 + 預期結果)
2. 執行檢索並計算指標:
   - Precision@K (前 K 個結果的準確率)
   - Recall@K (召回率)
   - MRR (Mean Reciprocal Rank)
   - NDCG (Normalized Discounted Cumulative Gain)

**測試資料範例**:
```typescript
const goldStandard = [
  {
    query: 'find symbol indexing logic',
    expectedFiles: [
      'src/core/indexing/symbol-index.ts',
      'src/core/indexing/index-engine.ts'
    ],
    expectedSymbols: ['SymbolIndex', 'IndexEngine.indexFile']
  }
];
```

---

## 效能指標與監控

### 核心指標

```typescript
interface RetrievalMetrics {
  // 效能指標
  searchLatency: Histogram;           // 搜尋延遲分佈
  tokenAccuracy: Gauge;               // Token 估算準確度
  cacheHitRate: Gauge;                // 快取命中率

  // 品質指標
  relevanceScore: Histogram;          // 相關性分數分佈
  resultsPerQuery: Histogram;         // 每次查詢返回結果數

  // 業務指標
  queryIntentDistribution: Counter;   // 查詢意圖分佈
  disclosureLevelUsage: Counter;      // 揭露層級使用率
}
```

### 監控埋點

```typescript
// 在 CodeRetrievalService 中埋點
async retrieve(options: RetrievalOptions): Promise<RetrievalResult> {
  const startTime = Date.now();

  try {
    const result = await this.doRetrieve(options);

    // 記錄指標
    metrics.searchLatency.observe(Date.now() - startTime);
    metrics.relevanceScore.observe(this.calculateAvgScore(result));
    metrics.resultsPerQuery.observe(result.snippets.length);

    return result;
  } catch (error) {
    metrics.errors.inc({ type: error.constructor.name });
    throw error;
  }
}
```

---

## 資料結構設計

### 向量索引結構 (未來)

```typescript
interface VectorIndex {
  // 檔案路徑 → 向量
  fileVectors: Map<string, Float32Array>;

  // 符號 → 向量
  symbolVectors: Map<string, Float32Array>;

  // 倒排索引 (加速檢索)
  invertedIndex: Map<string, Set<string>>;

  // 元資料
  metadata: {
    dimension: number;
    totalVectors: number;
    lastUpdated: Date;
  };
}
```

### 快取結構

```typescript
interface RetrievalCache {
  // 查詢結果快取
  queryCache: LRUCache<string, RetrievalResult>;

  // 向量快取
  vectorCache: LRUCache<string, Float32Array>;

  // 程式碼片段快取
  snippetCache: LRUCache<string, CodeSnippet>;
}
```

---

## 風險與挑戰

### 技術風險

1. **Token 估算準確性**
   - 風險: 不同 tokenizer 結果不一致
   - 緩解: 支援多種 tokenizer，提供誤差容忍度

2. **向量搜尋效能**
   - 風險: 大型專案索引慢、記憶體消耗高
   - 緩解: 分層索引、延遲載入、增量更新

3. **相關性評分準確性**
   - 風險: 早期版本準確率可能不理想
   - 緩解: 可調整權重、支援手動調優、收集反饋

### 產品風險

1. **使用者學習成本**
   - 風險: 查詢語法不直覺
   - 緩解: 自動意圖識別、提供查詢範例

2. **與現有工具競爭**
   - 風險: 使用者習慣現有搜尋方式
   - 緩解: 展示 token 節省效果、提供遷移指南

---

## 成功標準

### MVP 驗收標準 (Phase 1-3 完成後)

- [ ] 能執行語義搜尋，返回相關程式碼
- [ ] Token 消耗比純文字搜尋減少 > 30%
- [ ] 相關性準確率 > 70%
- [ ] 搜尋延遲 < 200ms (P95)
- [ ] MCP 工具可正常呼叫
- [ ] 通過所有單元測試和整合測試
- [ ] 文件完整，有使用範例

### 最終目標 (Phase 4 完成後)

- [ ] Token 消耗減少 > 50%
- [ ] 相關性準確率 > 85%
- [ ] 快取命中率 > 40%
- [ ] 支援多種查詢意圖
- [ ] 自動依賴補充準確率 > 90%
- [ ] 效能指標達標 (參考上方效能指標表)

---

## 附錄

### A. 關鍵技術決策

1. **為何不用現成的向量資料庫?**
   - 初期: 降低複雜度，快速驗證價值
   - 後期: 可選擇整合 (Faiss, Qdrant, Weaviate)

2. **為何採用漸進式揭露?**
   - 核心目標是最小化 token
   - 不同場景需要不同粒度的程式碼
   - 給 AI 自主選擇的靈活性

3. **為何重用現有模組而非重寫?**
   - Indexing/Dependency 已穩定成熟
   - 減少維護成本
   - 保持架構一致性

### B. 參考資料

- [BM25 演算法](https://en.wikipedia.org/wiki/Okapi_BM25)
- [TF-IDF](https://en.wikipedia.org/wiki/Tf%E2%80%93idf)
- [Code Search 論文](https://arxiv.org/abs/2002.06353)
- [RAG for Code](https://arxiv.org/abs/2308.07107)

### C. 未來擴展方向

1. **支援多語言混合搜尋** (TypeScript + Swift + Python)
2. **程式碼克隆檢測整合** (找相似程式碼)
3. **時間序列分析** (找最近變更的相關程式碼)
4. **協作過濾** (基於專案使用模式推薦)

---

## 實作檢查清單

將這份計畫作為實作的 **金標準**，每完成一個功能需對照檢查：

### Phase 1 檢查清單
- [ ] SemanticSearchEngine 實作完成
- [ ] QueryAnalyzer 實作完成
- [ ] 整合到 SearchService
- [ ] 單元測試通過
- [ ] 效能測試達標

### Phase 2 檢查清單
- [ ] CodeRetrievalService 實作完成
- [ ] 多階段檢索流程正常運作
- [ ] 依賴補充邏輯正確
- [ ] 漸進式揭露功能正常
- [ ] Token 預算控制準確
- [ ] 整合測試通過

### Phase 3 檢查清單
- [ ] MCP 工具實作完成
- [ ] 參數驗證完整
- [ ] 錯誤處理健全
- [ ] 快取功能運作正常
- [ ] 效能優化完成
- [ ] 文件撰寫完成

### Phase 4 檢查清單 (可選)
- [ ] 向量嵌入模型選定
- [ ] 向量儲存層實作完成
- [ ] 整合測試通過
- [ ] 準確率提升驗證

---

**最後更新**: 2025-10-07
**負責人**: Claude Code
**預計完成時間**: Phase 1-3 約 5 週，Phase 4 待評估
