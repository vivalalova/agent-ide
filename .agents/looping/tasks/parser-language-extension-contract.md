---
title: Parser 語言擴充契約
created: 2026-05-31
priority: high
suggested_order: A1
refined: false
requires_runtime_proof: true
---

# Parser 語言擴充契約

目前系統有 `ParserPlugin` / `ParserRegistry` 擴充入口，但實際語言支援仍綁定 TypeScript / JavaScript。這個 task 要把「新增語言」的修正方式落成可驗證的契約：新增語言不應再需要到 CLI、index worker、source extension helper、read-only core flow 多處手動補 hardcode。

## User Stories
- As a parser plugin author, I want to implement and register one parser in one documented path, so that indexing/search/cycles/impact can recognize the new language extension without editing unrelated TS/JS-specific code.
- As a maintainer, I want TS/JS behavior to remain unchanged, so that this refactor does not regress existing CLI commands.

## 修正方式
- 以 `ParserRegistry` 作為語言支援的 runtime source of truth；索引、cache、impact、move path matching 等讀取類流程不要直接依賴只列 TS/JS 的 `SOURCE_FILE_EXTENSIONS` 作為唯一支援清單。
- 抽出內建 parser 清單，讓 CLI 初始化、`initializeDefaultParsers()`、worker 初始化共用同一份註冊來源；避免目前 `TypeScriptParser` / `JavaScriptParser` 在多處重複 new/register。
- 將 worker parser 初始化改成使用同一個內建 parser registry bootstrap，並補測試證明非 TS/JS parser extension 可以被 worker 解析。
- 對 `change-signature`、`call-hierarchy`、`move-member` 這類語言 AST 強耦合命令，先明確分層：沒有 parser capability 時 fast-fail 說明該語言不支援該 mutation/analysis；不要假裝任意語言都可套用 TypeScript/Babel 邏輯。
- 為 ParserPlugin 增加或整理 capability contract，將語言特定能力放在 parser capability 上，例如 import declarations、signature formatting、call hierarchy extraction、mutation support。
- 補一個 fake language parser 測試 fixture（例如 `.toy`），驗證註冊後 read-only flow 至少能完成 indexing/search/cycles/impact；同時驗證未宣告 capability 的 mutation 命令會穩定 fast-fail。
- 更新 `AGENTS.md` / plugin skill docs，寫清楚新增語言的入口、必要 capabilities、哪些命令屬於 read-only baseline、哪些命令需要語言專用 capability。

## 驗收條件
- Given 一個測試用 fake parser 支援 `.toy`，when 註冊到 shared bootstrap，then CLI 與 IndexEngine 都能索引 `.toy` 檔案並在 search/impact/cycles 類 read-only flow 使用它。
- Given worker pool 啟用，when `.toy` 檔案被排入 parse task，then worker 使用同一份 parser bootstrap 找到 `.toy` parser，而不是只支援 `.ts/.js`。
- Given `.toy` parser 沒有宣告 change-signature 或 call-hierarchy mutation capability，when 執行相關命令，then CLI fast-fail 並指出該語言/extension 不支援該能力。
- Given 現有 TS/JS fixtures，when 執行 `pnpm build && pnpm lint && pnpm test`，then 既有輸出與測試維持通過。

## 決策紀錄
- Q: 這個 task 是否要新增真實第三語言 parser？
  A: 不新增。
  Why: 先把擴充契約、bootstrap、capability boundary 做穩；真實語言 parser 應另開 task，避免範圍過大。
