# 測試審查報告

## 審查範圍
- 全面檢視 `tests/` 目錄的單元、整合、端到端及效能測試
- 聚焦於測試是否覆蓋實際程式碼路徑、輸入輸出合理性、穩定性與可維護性

## 主要問題

### 1. 重構模組測試未覆蓋實際程式碼
- **影響範圍**：`tests/core/refactor/design-patterns.test.ts:65`、`tests/core/refactor/extract-function.test.ts:68`、`tests/core/refactor/inline-function.test.ts:67`
- **問題說明**：三個測試檔案在測試內自定義 `FactoryPatternRefactoring`、`ExtractFunctionRefactoring`、`InlineStrategy` 等類別，未從 `src/core/refactor/` 匯入真正實作。測試只驗證測試檔案中的假物件，即便正式重構器壞掉也不會反映。
- **影響**：重構相關功能缺乏實質自動化測試覆蓋，屬重大風險。
- **建議**：改為匯入真正模組（例如 `import { DesignPatternAnalyzer } from '../../../src/core/refactor/design-patterns.js';`），必要的 scaffolding 以 fixture 形式提供，避免在測試中重寫邏輯。

### 2. 增量索引效能測試未觸發索引流程
- **影響範圍**：`tests/performance/core/indexing/indexing-performance.test.ts:121-144`
- **問題說明**：「增量更新效能測試」僅建立檔案並計時 `Date.now()` 差值，完全沒有呼叫 `indexEngine` 的任何更新 API。`expect(updateTime).toBeLessThan(1000)` 只檢查檔案寫入速度，無法驗證索引行為。
- **影響**：增量索引即使退化也不會被偵測，提供錯誤信心。
- **建議**：在寫入檔案後必須呼叫例如 `indexEngine.indexFile(...)`、`indexEngine.handleFileChanges(...)` 或 `fileWatcher.handleBatchChanges(...)`，實際量測索引耗時；若只是檔案 I/O 基準，應調整描述以免誤導。

### 3. 效能測試硬性時間閾值造成高 flake 風險
- **影響範圍**：
  - `tests/infrastructure/cache/performance.test.ts:12-74`
  - `tests/performance/core/indexing/indexing-performance.test.ts` 中多處 `<100ms`、`<50ms`、`<1000ms` 限制
  - 其他效能測試亦有類似寫法
- **問題說明**：大量測試對牆時計時設定極緊的上限，機器稍慢或 CI 繁忙即可能失敗，導致測試不穩定。
- **影響**：提高 flake 率、增加 CI 成本，也讓真正效能趨勢難以觀察。
- **建議**：改為紀錄或比對相對變化（例如與前次基準比較），或將閾值放寬至安全區間；若需精準度量，可把這類測試拆成 Benchmark/Profiling 工具，在 CI 外執行。

### 4. 效能總覽測試僅檢查靜態列表，缺乏實質價值
- **影響範圍**：`tests/performance/performance-overview.test.ts` 全檔
- **問題說明**：多個 `it` 區塊僅列舉陣列或物件並驗證長度／鍵名，沒有實際呼叫任何效能流程，也不會失敗除非手動更改常數。
- **影響**：增加測試噪音與執行時間，卻無法提供防回歸保障。
- **建議**：將內容改寫為文件（放入 `docs/` 或 README），或改成真正統整各模組 perf 測試結果的驗證；否則應刪除以減少維護成本。

### 5. 依賴分析測試存在長期 `it.skip`
- **影響範圍**：`tests/core/dependency/dependency-analyzer.test.ts:270-287`
- **問題說明**：與測試檔案關聯相關的兩個案例被 `it.skip` 並留下 `TODO`，代表已知需求長期未覆蓋。
- **影響**：`getAffectedTests` 行為可能回歸而無法偵測。
- **建議**：儘快恢復這兩個測試；若功能尚未完備，最少應加入 issue 連結或明確註解並建立追蹤計畫。

### 6. 測試輸出大量 `console.log`
- **影響範圍**：多數效能測試（例如 `tests/performance/performance-overview.test.ts`、`tests/performance/core/indexing/indexing-performance.test.ts` 等）
- **問題說明**：測試過程大量印出報表，造成 CI log 噪音並難以聚焦真正錯誤。
- **建議**：將這些資料改成條件式輸出（例如只在 `process.env.DEBUG_PERF` 時列印）或轉為測試結束後的摘要；常態測試應保持輸出精簡。

## 待確認事項
- 重構模組測試改為引用真實實作後，是否需要額外 fixture 以避免依賴完整 AST/Parser 管線？
- 增量索引應以哪個公開 API 作為官方更新入口（`indexEngine.indexFiles`、`fileWatcher.handleFileChange` 等）？
- 對於效能測試輸出，團隊是否已有彙整報表工具，可將 log 移至該途徑？

## 建議後續步驟
1. 匯入真正的重構模組並調整測試，使結果反映現實行為；若需保留現有邏輯，可將自製類別轉為共用 stub，避免遮蔽正式實作。
2. 修正增量索引效能測試，使其在檔案修改後實際呼叫索引更新流程並量測耗時。
3. 整理所有效能測試的牆時計時斷言，改以更穩定的指標或 Benchmark 工具紀錄。
4. 決定效能總覽資訊的最佳呈現方式：若僅需文件，從測試移除；若要自動驗證，需補足實際檢查邏輯。
5. 完成 `getAffectedTests` 關聯測試的 TODO，確保依賴分析結果可被自動驗證。
6. 建立統一的測試輸出策略，降低 `console.log` 噪音並保留必要指標。

