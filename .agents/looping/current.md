---
title: 修正 change-signature 空 changeset 時 silent fail（無變更不報告）
created: 2026-05-13
priority: high
suggested_order: A2
phase: needs-review
iteration: 3
max_iterations: 5
review_iterations: 2
max_review_iterations: 5
---

# 修正 change-signature 空 changeset 時 silent fail（無變更不報告）

## 背景

手動測試發現：`change-signature --reorder "data"` 對只有單一參數 `data` 的 `createUser` 函式跑 dry-run，輸出 `Summary: 0 files, 0 changes`，沒任何訊息說明「順序與現狀相同」或「無變更」。AI agent 無法區分「沒事做」「函式不存在」「路徑錯誤」。

實測：
- CLI 層 path 處理已正確（`change-signature.command.ts:165` 有 `path.isAbsolute` 守衛）
- 證據中的 `檔案: ../sample-project/...` 是 L101 `console.log(path.relative(process.cwd(), filePath))` 顯示用，**不是 bug**
- 真實 bug 是 engine 產出空 changeset 時 CLI 沒做提示

## 重現

```bash
agent-ide change-signature \
  --file /Users/lova/git/vibe/agent-ide/tests/fixtures/sample-project/src/services/user-service.ts \
  --function createUser \
  --reorder "data" \
  --dry-run
```

實際輸出：
```
   修改函式簽名: createUser
   檔案: ../sample-project/src/services/user-service.ts
Summary: 0 files, 0 changes
```

注意：`createUser(data: CreateUserData)` 只有一個參數，reorder 自己等於不變，本來就無事可做。問題在沒有任何提示。

## 預期

- 空 changeset 必須明確分類並輸出：
  - 函式存在但 `--reorder/--add/--remove/--rename/--change-type` 結果與現狀相同 → 「無實質變更」+ exit code 0（資訊提示，非錯誤）
  - 函式不存在 → 「找不到函式: X」+ exit code 1
  - 檔案不存在 → 「檔案不存在: X」+ exit code 1
- 有實際變更時 → dry-run 輸出參數變更前後 diff + 所有 call site 更新

## User Stories

- As an AI agent，I want `change-signature` 明確說出空 changeset 的原因，so that 我不會誤判 silent 為成功。

## 驗收條件

- 先補 E2E 測試（fail-first）：
  - `--reorder` 結果與現狀相同 → stdout 含「無實質變更」訊息、exit code 0。
  - 對不存在函式 → exit code ≠ 0、stderr 含「找不到函式」、json 含 error 欄位。
  - 對不存在檔案 → exit code ≠ 0、stderr 含「檔案不存在」。
  - 有效 reorder（如雙參數 swap）→ 輸出包含參數順序變更 diff。
- 與 [[fix-move-silent-fail-absolute-path]] 共用「mutation 空 changeset 回報」標準，行為對齊。
- `pnpm test` 全綠。
