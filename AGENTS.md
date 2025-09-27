# Repository Guidelines

## 專案結構與模組組織
- `src/` 儲存正式 TypeScript 程式碼：`core/`（索引、搜尋、重新命名）、`application/` 服務、`infrastructure/`（解析器、儲存）、`interfaces/`（CLI、MCP）、`plugins/` 與 `shared/` 型別/常數。
- `tests/` 鏡像運行模組（`core/`、`interfaces/`、`plugins/` 等），並提供 `unit/`、`integration/`、`e2e/` 與 `test-utils/`。
- 可執行檔位於 `bin/`，建置輸出至 `dist/`，文件與範例集中在 `docs/`、`examples/`。

## 建置、測試與開發指令
- `pnpm install` — 在 Node 20+ 環境安裝依賴。
- `pnpm build` — 執行 `tsc` 將產物輸出到 `dist/`。
- `pnpm typecheck` — 僅進行型別檢查；提交 PR 前必跑。
- `pnpm test` — 以 `--expose-gc`、`--max-old-space-size=4096` 執行 Vitest。
- `pnpm test:watch` — 監看模式快速迭代單元測試。
- `pnpm test:memory` — 針對記憶體議題收集 GC 與 trace。
- `pnpm test:single -- --run <path>` — 使用單分支程序隔離易碎測試。
- 完成建置後以 `node dist/interfaces/cli/index.js --help` 驗證 CLI。

## 程式風格與命名慣例
- 統一使用 TypeScript 並保持 `strict`；採 2 空白縮排與 ES2022 模組。
- 檔名採 kebab-case（例：`rename-engine.ts`）；類別/介面用 PascalCase，函式與變數用 camelCase，常數用 SCREAMING_SNAKE_CASE。
- 避免 `any`，優先撰寫型別別名或介面；錯誤處理使用自訂錯誤類別。
- 模組內維持相對匯入結構（例：`core/search/service.ts`），延續既有註解與雙語敘述。

## 測試指引
- 全站採 Vitest；新測試依領域放置於對應目錄（如 `tests/core/...`）。
- 測試檔命名為 `*.test.ts`，遵循 AAA；`describe` 文字維持繁體中文。
- 預設 timeout 30 秒、`maxConcurrency=3`、`singleFork=true`；若需更長操作請明確設定。
- 維持整體覆蓋率 ≥80%、`src/core/` ≥95%、新功能達 100%；以 `pnpm test:coverage` 驗證。
- 編寫解析器測試時於 `tests/test-utils/test-parsers.ts` 註冊輔助並透過 registry 釋放資源。

## Commit 與 Pull Request 指南
- 採 `<type>: <summary>` 小寫格式（例：`fix: 調整 parser registry 清理`）；摘要保持命令式與聚焦。
- 本地壓縮雜訊性 WIP commit 並 rebase 維持線性歷史。
- PR 說明需包含目的、關鍵變更、測試證據（`pnpm test…` 輸出）、相關議題以及行為變更截圖或 CLI 輸出。
- 依模組領域（core、interfaces 等）指派審查者，並於 `docs/` 更新新解析器或插件說明。

## Agent 工作流程提示
- 先在 `examples/` 原型化新 Agent 動作，完成後於 `src/interfaces/cli/` 串接 CLI。
- 透過 `pnpm build && node bin/agent-ide.js index --path test-project` 在範例專案進行索引冒煙測試後再發布。
