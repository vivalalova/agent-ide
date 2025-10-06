# RAG 智能程式碼檢索系統 - 實作任務清單

> 此文件將 plan.md 的規劃轉為可執行的詳細任務

---

## Phase 1: 基礎語義搜尋 (Week 1-2)

### Task 1.1: 擴充 Search 模組型別定義
- [ ] 修改 `src/core/search/types.ts`
- [ ] 新增 `SemanticQuery` 介面
- [ ] 新增 `SemanticSearchOptions` 介面
- [ ] 新增 `SemanticSearchResult` 介面
- [ ] 新增 `QueryIntent` enum
- [ ] 新增 `RelevanceScore` 介面
- [ ] 執行 `pnpm typecheck` 確認無型別錯誤

### Task 1.2: 實作查詢分析器
- [ ] 建立 `src/core/search/query-analyzer.ts`
- [ ] 實作 `QueryAnalyzer` class
  - [ ] `analyzeQuery()` 方法
  - [ ] `extractKeywords()` 方法
  - [ ] `inferIntent()` 方法
  - [ ] `parseSymbolPattern()` 方法
- [ ] 建立 `tests/core/search/query-analyzer.test.ts`
  - [ ] 測試關鍵字提取
  - [ ] 測試意圖識別（6 種意圖）
  - [ ] 測試符號模式解析
- [ ] 執行 `pnpm test -- query-analyzer.test.ts`

### Task 1.3: 實作 SemanticSearchEngine 基礎版本
- [ ] 建立 `src/core/search/engines/semantic-engine.ts`
- [ ] 實作 TF-IDF 向量化
  - [ ] `vectorize()` 方法
  - [ ] `calculateTFIDF()` 方法
  - [ ] `buildVocabulary()` 方法
- [ ] 實作餘弦相似度計算
  - [ ] `cosineSimilarity()` 方法
- [ ] 實作向量搜尋
  - [ ] `vectorSearch()` 方法
- [ ] 實作重排序邏輯
  - [ ] `rerank()` 方法
  - [ ] `calculateRelevanceScore()` 方法
- [ ] 實作 token 預算控制
  - [ ] `filterByTokenBudget()` 方法
- [ ] 建立 `tests/core/search/semantic-engine.test.ts`
  - [ ] 測試向量化
  - [ ] 測試相似度計算
  - [ ] 測試搜尋結果排序
  - [ ] 測試 token 預算控制
- [ ] 執行 `pnpm test -- semantic-engine.test.ts`

### Task 1.4: 整合到 SearchService
- [ ] 修改 `src/core/search/service.ts`
- [ ] 新增 `semanticEngine` 屬性
- [ ] 實作 `searchSemantic()` 方法
  - [ ] 整合 QueryAnalyzer
  - [ ] 呼叫 SemanticSearchEngine
  - [ ] 更新搜尋統計
  - [ ] 錯誤處理
- [ ] 修改 `search()` 通用方法支援 semantic 類型
- [ ] 更新現有測試
  - [ ] 修改 `tests/core/search/search-service.test.ts`
  - [ ] 新增語義搜尋測試案例
- [ ] 執行 `pnpm test -- search-service.test.ts`

### Task 1.5: Phase 1 驗證
- [ ] 執行完整測試套件: `pnpm test`
- [ ] 執行型別檢查: `pnpm typecheck`
- [ ] 執行 lint: `pnpm lint`
- [ ] 執行建置: `pnpm build`
- [ ] 效能測試: 1000 檔案搜尋 < 200ms
- [ ] 準確率測試: 準確率 > 60%

---

## Phase 2: CodeRetrievalService 核心邏輯 (Week 3-4)

### Task 2.1: 擴充 Application 型別定義
- [ ] 修改 `src/application/types.ts`
- [ ] 新增 `RetrievalOptions` 介面
- [ ] 新增 `CodeCandidate` 介面
- [ ] 新增 `CodeSnippet` 介面
- [ ] 新增 `RetrievalResult` 介面
- [ ] 新增 `DisclosureLevel` enum
- [ ] 新增 `RetrievalFilters` 介面
- [ ] 執行 `pnpm typecheck`

### Task 2.2: 實作 Token 計算器
- [ ] 建立 `src/application/services/token-counter.ts`
- [ ] 實作 `TokenCounter` class
  - [ ] `estimateTokens()` 方法
  - [ ] `countSignatureTokens()` 方法
  - [ ] `countFullCodeTokens()` 方法
- [ ] 支援多種 tokenizer (GPT-4, Claude)
- [ ] 建立 `tests/application/services/token-counter.test.ts`
  - [ ] 測試各層級 token 估算
  - [ ] 測試準確率 (誤差 < 5%)
- [ ] 執行測試

### Task 2.3: 實作程式碼提取器
- [ ] 建立 `src/application/services/code-extractor.ts`
- [ ] 實作 `CodeExtractor` class
  - [ ] `extractSignature()` 方法
  - [ ] `extractSignatureWithDoc()` 方法
  - [ ] `extractFullCode()` 方法
  - [ ] `extractWithLevel()` 方法
- [ ] 整合 Parser 系統
- [ ] 建立 `tests/application/services/code-extractor.test.ts`
  - [ ] 測試各層級提取
  - [ ] 測試多語言支援
- [ ] 執行測試

### Task 2.4: 實作 CodeRetrievalService 骨架
- [ ] 建立 `src/application/services/code-retrieval.service.ts`
- [ ] 實作 `CodeRetrievalService` class 建構子
  - [ ] 注入所有依賴 (indexEngine, searchService, etc.)
- [ ] 實作 `retrieve()` 主方法骨架
  - [ ] 查詢分析
  - [ ] 多階段檢索 (呼叫 private 方法)
  - [ ] 依賴補充 (呼叫 private 方法)
  - [ ] 排序過濾 (呼叫 private 方法)
  - [ ] 結果組裝 (呼叫 private 方法)
- [ ] 實作錯誤處理和事件發送

### Task 2.5: 實作多階段檢索
- [ ] 實作 `multiStageRetrieval()` private 方法
  - [ ] Stage 1: 符號索引搜尋
  - [ ] Stage 2: 語義搜尋
  - [ ] Stage 3: 文字搜尋後備
- [ ] 實作 `addCandidates()` helper 方法
- [ ] 實作候選去重邏輯
- [ ] 建立 `tests/application/services/code-retrieval.service.test.ts`
  - [ ] 測試單階段檢索
  - [ ] 測試多階段檢索
  - [ ] 測試候選合併

### Task 2.6: 實作依賴補充
- [ ] 實作 `enrichWithDependencies()` private 方法
  - [ ] 整合 DependencyAnalyzer
  - [ ] 實作遞迴深度控制
  - [ ] 實作相關性閾值過濾
- [ ] 實作 `loadCandidate()` helper 方法
- [ ] 新增測試案例
  - [ ] 測試依賴補充
  - [ ] 測試深度限制
  - [ ] 測試循環依賴處理

### Task 2.7: 實作排序與過濾
- [ ] 實作 `rankAndFilter()` private 方法
  - [ ] 多維度評分
  - [ ] 結果排序
  - [ ] 重複檢測
- [ ] 實作 `calculateFinalScore()` 方法
- [ ] 實作 `deduplicateCandidates()` 方法
- [ ] 新增測試案例
  - [ ] 測試評分邏輯
  - [ ] 測試排序正確性
  - [ ] 測試去重邏輯

### Task 2.8: 實作漸進式揭露
- [ ] 實作 `assembleResult()` private 方法
  - [ ] Token 預算分配
  - [ ] 動態層級選擇
  - [ ] 結果組裝
- [ ] 實作 `determineDisclosureLevel()` 方法
- [ ] 實作 `selectLevelForCandidate()` 方法
- [ ] 實作 `extractSnippet()` 方法
- [ ] 新增測試案例
  - [ ] 測試 token 預算控制
  - [ ] 測試層級選擇邏輯
  - [ ] 測試結果組裝

### Task 2.9: 整合 Application Services
- [ ] 整合 EventBus
  - [ ] 發送檢索開始事件
  - [ ] 發送檢索完成事件
  - [ ] 發送錯誤事件
- [ ] 整合 CacheCoordinator
  - [ ] 實作查詢結果快取
  - [ ] 實作快取失效策略
- [ ] 整合 StateManager
  - [ ] 記錄檢索狀態
  - [ ] 追蹤活躍查詢
- [ ] 新增整合測試案例

### Task 2.10: 撰寫完整測試
- [ ] 完善單元測試
  - [ ] 每個 private 方法獨立測試
  - [ ] 邊界條件測試
  - [ ] 錯誤處理測試
- [ ] 建立整合測試
  - [ ] `tests/e2e/retrieval/semantic-retrieval.e2e.test.ts`
  - [ ] 端到端檢索流程
  - [ ] 真實專案測試
  - [ ] 效能測試
- [ ] 執行完整測試套件

### Task 2.11: Phase 2 驗證
- [ ] 執行完整測試: `pnpm test`
- [ ] 執行型別檢查: `pnpm typecheck`
- [ ] 執行 lint: `pnpm lint`
- [ ] 執行建置: `pnpm build`
- [ ] Token 消耗驗證 (誤差 < 5%)
- [ ] 端到端測試通過率 100%

---

## Phase 3: MCP 介面與優化 (Week 5)

### Task 3.1: 實作 MCP 工具
- [ ] 建立 `src/interfaces/mcp/tools/semantic-search.ts`
- [ ] 定義工具 schema
  - [ ] 工具名稱、描述
  - [ ] 輸入參數 schema
  - [ ] 輸出格式定義
- [ ] 實作 handler 函式
  - [ ] 參數驗證
  - [ ] 呼叫 CodeRetrievalService
  - [ ] 格式化結果
  - [ ] 錯誤處理
- [ ] 實作 `formatRetrievalResult()` 格式化函式
- [ ] 註冊到 MCP 工具列表

### Task 3.2: MCP 工具測試
- [ ] 建立 `tests/interfaces/mcp/tools/semantic-search.test.ts`
- [ ] 測試參數驗證
  - [ ] 必填參數檢查
  - [ ] 參數型別檢查
  - [ ] 預設值測試
- [ ] 測試 handler 執行
  - [ ] 正常流程
  - [ ] 錯誤流程
  - [ ] 邊界條件
- [ ] 測試結果格式化
- [ ] 執行測試

### Task 3.3: 實作查詢快取
- [ ] 修改 `src/application/services/code-retrieval.service.ts`
- [ ] 新增快取層
  - [ ] 整合 CacheCoordinator
  - [ ] 實作快取鍵生成
  - [ ] 實作快取寫入邏輯
  - [ ] 實作快取讀取邏輯
- [ ] 實作快取失效
  - [ ] 檔案變更觸發失效
  - [ ] TTL 控制
  - [ ] LRU 淘汰
- [ ] 新增快取相關測試
  - [ ] 測試快取命中
  - [ ] 測試快取失效
  - [ ] 測試快取效能提升

### Task 3.4: 效能優化
- [ ] 批次處理優化
  - [ ] 批次向量化
  - [ ] 批次依賴查詢
- [ ] 並行處理優化
  - [ ] 多階段檢索並行化
  - [ ] 依賴補充並行化
- [ ] 記憶體優化
  - [ ] 向量 lazy loading
  - [ ] 結果串流化
- [ ] 執行效能測試
  - [ ] 搜尋延遲 < 500ms
  - [ ] 快取命中率 > 40%
  - [ ] 記憶體使用 < 200MB

### Task 3.5: 相關性評分調優
- [ ] 建立評分測試集
  - [ ] 50 個查詢 + 金標準答案
- [ ] 實作評分調優工具
  - [ ] 自動化評分測試
  - [ ] 權重調整工具
- [ ] 調優權重參數
  - [ ] vectorSimilarity 權重
  - [ ] symbolMatch 權重
  - [ ] dependencyRelevance 權重
  - [ ] recency 權重
- [ ] 驗證調優效果
  - [ ] Precision@5 > 80%
  - [ ] MRR > 0.85

### Task 3.6: Token 估算準確性提升
- [ ] 支援多種 tokenizer
  - [ ] GPT-4 tokenizer
  - [ ] Claude tokenizer
  - [ ] 自定義 tokenizer
- [ ] 建立準確率測試集
  - [ ] 100 個程式碼片段
  - [ ] 對照真實 tokenizer 結果
- [ ] 調整估算邏輯
  - [ ] 修正偏差
  - [ ] 優化估算速度
- [ ] 驗證準確率 (誤差 < 3%)

### Task 3.7: 撰寫文件
- [ ] 更新 `CLAUDE.md`
  - [ ] 新增 RAG 系統說明
  - [ ] 更新架構圖
  - [ ] 更新模組列表
- [ ] 撰寫使用指南
  - [ ] 建立 `docs/semantic-search-guide.md`
  - [ ] 查詢範例
  - [ ] 參數說明
  - [ ] 最佳實踐
- [ ] 撰寫 API 文件
  - [ ] CodeRetrievalService API
  - [ ] MCP 工具 API
  - [ ] 型別定義說明
- [ ] 撰寫開發者文件
  - [ ] 架構設計說明
  - [ ] 擴展指南
  - [ ] 貢獻指南

### Task 3.8: Phase 3 驗證
- [ ] 執行完整測試: `pnpm test`
- [ ] 執行型別檢查: `pnpm typecheck`
- [ ] 執行 lint: `pnpm lint`
- [ ] 執行建置: `pnpm build`
- [ ] MCP 工具可正常呼叫
- [ ] 快取命中率 > 40%
- [ ] 端到端回應時間 < 500ms
- [ ] 文件完整性檢查

---

## Phase 4: 向量化搜尋增強 (Week 6+, 可選)

### Task 4.1: 研究輕量級嵌入方案
- [ ] 評估 all-MiniLM-L6-v2
  - [ ] 模型大小
  - [ ] 推理速度
  - [ ] 準確率
- [ ] 評估 CodeBERT
  - [ ] 程式碼專用優勢
  - [ ] 效能表現
- [ ] 評估 GraphCodeBERT
  - [ ] 結構感知優勢
  - [ ] 資源需求
- [ ] 選擇最適合方案
- [ ] 撰寫評估報告

### Task 4.2: 實作向量儲存層
- [ ] 選擇向量資料庫
  - [ ] 評估 Faiss
  - [ ] 評估 Qdrant
  - [ ] 評估自建方案
- [ ] 建立 `src/infrastructure/vector-store/`
- [ ] 實作向量儲存介面
  - [ ] `VectorStore` interface
  - [ ] `addVector()` 方法
  - [ ] `searchVector()` 方法
  - [ ] `updateVector()` 方法
  - [ ] `deleteVector()` 方法
- [ ] 實作具體實作類別
- [ ] 實作增量更新邏輯
- [ ] 撰寫測試

### Task 4.3: 整合嵌入模型
- [ ] 建立 `src/infrastructure/embeddings/`
- [ ] 實作 `EmbeddingService` class
  - [ ] `embedCode()` 方法
  - [ ] `embedQuery()` 方法
  - [ ] 批次嵌入支援
- [ ] 整合選定的嵌入模型
- [ ] 實作模型載入和管理
- [ ] 撰寫測試

### Task 4.4: 整合到 SemanticSearchEngine
- [ ] 修改 `src/core/search/engines/semantic-engine.ts`
- [ ] 替換 TF-IDF 為向量嵌入
  - [ ] 修改 `vectorize()` 方法
  - [ ] 整合 EmbeddingService
- [ ] 調整評分權重
- [ ] 實作向量快取
- [ ] A/B 測試比較
  - [ ] TF-IDF 版本
  - [ ] 向量嵌入版本
- [ ] 撰寫測試

### Task 4.5: 向量索引建立
- [ ] 實作離線索引建立工具
  - [ ] CLI 命令
  - [ ] 進度顯示
  - [ ] 斷點續傳
- [ ] 實作增量索引更新
  - [ ] 監聽檔案變更
  - [ ] 增量嵌入
  - [ ] 索引合併
- [ ] 實作索引持久化
- [ ] 撰寫測試

### Task 4.6: Phase 4 驗證
- [ ] 執行完整測試: `pnpm test`
- [ ] 執行型別檢查: `pnpm typecheck`
- [ ] 執行 lint: `pnpm lint`
- [ ] 執行建置: `pnpm build`
- [ ] 準確率測試: > 85%
- [ ] 搜尋時間測試: < 300ms
- [ ] 向量索引大小: < 50MB (1000 檔案)
- [ ] A/B 測試報告

---

## 檢查點 (Checkpoints)

### CP1: Phase 1 完成
- [ ] 所有 Phase 1 任務完成
- [ ] 驗收標準達成
- [ ] 文件更新
- [ ] 提交 git commit

### CP2: Phase 2 完成
- [ ] 所有 Phase 2 任務完成
- [ ] 驗收標準達成
- [ ] 文件更新
- [ ] 提交 git commit

### CP3: Phase 3 完成 (MVP)
- [ ] 所有 Phase 3 任務完成
- [ ] MVP 驗收標準達成
- [ ] 文件完整
- [ ] 使用範例就緒
- [ ] 提交 git commit
- [ ] 建立 release tag

### CP4: Phase 4 完成 (可選)
- [ ] 所有 Phase 4 任務完成
- [ ] 最終目標達成
- [ ] 效能優化完成
- [ ] 提交 git commit
- [ ] 更新 release

---

## 執行原則

1. **嚴格遵循順序**: 按 Task 編號順序執行，不跳過
2. **TDD 優先**: 先寫測試再寫實作
3. **小步提交**: 每個 Task 完成後提交
4. **持續驗證**: 每個 Phase 完成後執行驗收
5. **文件同步**: 程式碼和文件同步更新
6. **效能監控**: 持續追蹤效能指標
7. **品質保證**: Build/Lint/Test 全部通過才進下一步

---

**最後更新**: 2025-10-07
**總任務數**: 76 個任務
**預計時間**: Phase 1-3 約 5 週，Phase 4 待評估
