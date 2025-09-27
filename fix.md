# 修復計畫

## 背景
- 目前 `pnpm test` 腳本是 `node --expose-gc --max-old-space-size=4096 node_modules/.bin/vitest`，因未加 `run` 參數導致 Vitest 在互動式環境中進入 watch 模式，即使測試跑完仍不會結束，才會出現「跑了四個小時跑不完」的現象。
- `pnpm test:run` 已於 2025-09-27 15:00（UTC-07:00）執行，總耗時約 217 秒，當前共有 21 個測試檔失敗（91 項測試），集中在 `tests/performance/core/{refactor,rename,search}` 等效能情境，錯誤包含 `ExtractFunction is not a constructor`、`renameEngine.findReferences is not a function` 以及效能門檻過嚴造成的 AssertionError。

## 修復步驟
1. **更新測試腳本**：將 `package.json` 的 `test` 腳本改為 `node --expose-gc --max-old-space-size=4096 node_modules/.bin/vitest run`，或直接對齊 `test:run` 腳本，確保預設命令會在單次跑完後退出。
2. **同步說明文件**：於 `README.md` 或 `testing.guide.md` 補充說明「預設使用 `pnpm test:run`」及 watch 模式的差異，避免再次誤用。
3. **修正效能測試依賴**：
   - 核對 `src/core/refactor/extract-function.ts` 的匯出型態，補上 `export class ExtractFunction` 或調整測試改用正確匯出。
   - 檢查重新命名引擎的公開 API，確保 `findReferences` 與 `ScopeAnalyzer.analyzeScopes` 取得到實例或 mock。
4. **調整效能門檻/資料集**：分析 `tests/performance/core/search/search-performance.test.ts` 的統計邏輯，視需要放寬數值或加入環境偵測，避免在一般開發機過度嚴苛。
5. **回歸測試**：套用修正後跑 `pnpm test:run` 與 `pnpm test:coverage` 確認退出狀態與效能測試穩定，若需 watch 再使用 `pnpm test:watch`。

## 驗收標準
- `pnpm test` 能在不進入 watch 模式的情況下於 5 分鐘內結束並回傳退出碼。
- 效能相關測試全部通過，沒有 constructor 或 API 缺失錯誤。
- 文件已更新，團隊成員了解 `test`、`test:run` 與 `test:watch` 的使用情境。
