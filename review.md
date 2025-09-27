# 測試審查報告

## 審查範圍
- 針對 `tests/` 目錄下的單元測試、效能測試與整合測試
- 主要驗證測試是否真正覆蓋對應的生產程式碼、輸入輸出是否合理、以及測試穩定性

## 主要問題

### 1. 重構模組測試未覆蓋實際程式碼
- **影響範圍**：`tests/core/refactor/design-patterns.test.ts:65`、`tests/core/refactor/extract-function.test.ts:68`、`tests/core/refactor/inline-function.test.ts:67`
- **問題說明**：三個測試檔案都在測試內自定義了 `FactoryPatternRefactoring`、`ExtractFunctionRefactoring`、`InlineStrategy` 等類別，並未從 `src/core/refactor/` 匯入真正的實作。測試因此只驗證測試檔案內的假物件，即便實際重構模組回歸也不會失敗。
- **影響**：重構相關功能實際上完全缺乏自動化測試覆蓋，存在重大回歸風險。
- **建議**：改為 `import { ... } from '../../../src/core/refactor/...';`，調整測試使用真正的 API。若需要特定 scaffold，可在測試中建立 fixture，而非重新定義類別。

### 2. 增量索引效能測試未觸發索引流程
- **影響範圍**：`tests/performance/core/indexing/indexing-performance.test.ts:121-144`
- **問題說明**：「增量更新效能測試」段落僅建立檔案並計時 `Date.now()` 差值，實際上沒有呼叫 `indexEngine` 的任何更新 API。測試斷言 `<1000ms` 只反映檔案寫入速度，完全無法驗證索引行為或效能。
- **影響**：增量索引功能若退化或壞掉，該測試仍會通過，造成錯誤的信心。
- **建議**：在新增檔案後呼叫 `indexEngine.indexFile(...)` 或 `indexEngine.handleFileChanges(...)`，真正量測增量索引耗時；或調整測試描述為 I/O 基準以免誤導。

### 3. 效能測試硬性時間閾值造成高 flake 風險
- **影響範圍**：
  - `tests/infrastructure/cache/performance.test.ts:12-74`
  - `tests/performance/core/indexing/indexing-performance.test.ts`（多處 `<100ms`、`<50ms`、`<1000ms` 限制）
- **問題說明**：多數效能測試以 `expect(duration).toBeLessThan(...)` 檢查絕對時間，門檻非常緊（例如 `<50ms`）。在 CI、低配機器或系統忙碌時容易造成間歇性失敗，導致測試結果不穩定。
- **影響**：提高 flake 率，增加 CI 重新執行成本，也可能掩蓋真正的效能趨勢。
- **建議**：改為記錄或比較相對時間（例如與前一版本基準比對），或將硬性閾值調整為明顯鬆綁的安全值；必要時可把效能量測轉為 Benchmark / profiling 工具，而非一般測試套件。

## 待確認事項
- 若重構模組測試改為使用真實實作，是否需要額外建立細部 fixture 以避免依賴整個 AST 管線？
- 增量索引測試應以哪個公開 API 為準（`indexEngine.batchIndexFiles`、`FileWatcher.handleFileChange` 或其他）？

## 建議後續步驟
1. 重新設計重構模組測試，引用並驗證 `src/core/refactor` 中的實際類別。必要時將現有的測試 helper 抽成共用 fixture。 
2. 調整增量索引測試流程，確保在新增檔案後呼叫索引引擎更新並蒐集耗時。 
3. 審視所有效能測試的時間閾值，將其改為穩定的 assertion 策略或報表式輸出，降低 flake。 

