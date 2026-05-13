---
title: 修正 call-hierarchy 找不到函式時 summary formatter 不顯示 error 訊息
created: 2026-05-13
priority: high
suggested_order: B1
---

# 修正 call-hierarchy 找不到函式時 summary formatter 不顯示 error 訊息

## 背景

`call-hierarchy <name>` 在 `<name>` 不存在時，exit code 已正確 = 1，但 stdout 仍顯示「定義位置: 」「0 incoming / 0 outgoing」這類迷惑訊息，**沒有「找不到函數」這條錯誤訊息**。AI agent 看 stdout 仍會誤判成「函式存在但無 caller」。

實測：
- `call-hierarchy.command.ts:129` 已有 `matchedSymbols.length === 0` 的 fail-fast 分支，set `error`、`errors`、`success: false`、`exitCode = 1`
- errorResult 經 `outputHandler.outputQuery(errorResult, format)` 輸出
- 但 `CallHierarchyFormatter.formatSummary()` 沒處理 `success: false` 時改顯示 error 訊息，仍渲染標準 hierarchy 樣板（空白 file、0 incoming、0 outgoing）

## 重現

```bash
agent-ide call-hierarchy nonexistent_function_xyz \
  --path /Users/lova/git/vibe/agent-ide/tests/fixtures/sample-project
```

實際輸出（exit code 1）：
```
📞 分析呼叫層次: nonexistent_function_xyz...
📞 函數呼叫層次: nonexistent_function_xyz
📍 定義位置: 
🔍 分析方向: both, 深度: 1

📥 呼叫者 (Incoming): 0 個
📤 被呼叫者 (Outgoing): 0 個
📊 統計: 0 incoming, 0 outgoing, 0 個檔案
```

預期應該明顯印出「❌ 找不到函數 "nonexistent_function_xyz"」並且不渲染空白 hierarchy。

## 預期

- summary 格式：函式不存在 → 只印錯誤訊息「❌ 找不到函數: <name>」，不再渲染空 hierarchy
- json 格式：保持現有 `success: false` + `error` + `errors`（已正確）
- exit code = 1（已正確）

## User Stories

- As an AI agent，I want summary stdout 明確顯示「找不到函數」錯誤，so that 我不會把空 hierarchy 誤判成「無呼叫者」。

## 驗收條件

- 先補 E2E 測試（fail-first）：
  - 對不存在函式跑 summary 格式 → stdout 必須包含「找不到函數」字樣，**不得**包含「定義位置」「Incoming」「Outgoing」這些 hierarchy 欄位。
  - 對不存在函式跑 json 格式 → 結果 `success === false`、`error` 含「找不到函數」。
  - 對存在但 0 caller 的函式 → exit code 0、summary 正常渲染 hierarchy。
- 修改範圍：`infrastructure/formatters/query/call-hierarchy-formatter.ts`（或同等路徑），在 `formatSummary()` 開頭檢查 `result.success === false` 提早 return error 訊息。
- `pnpm test` 全綠。

## 相關

可同時檢視其他 QueryFormatter 是否有同樣的「success false 仍渲染空樣板」問題（find-references、search 等）。
