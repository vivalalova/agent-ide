---
title: 修正 move 命令空 changeset 時 silent fail（無錯誤、無提示）
created: 2026-05-13
priority: high
suggested_order: A1
phase: needs-review
iteration: 1
max_iterations: 5
review_iterations: 0
---

# 修正 move 命令空 changeset 時 silent fail（無錯誤、無提示）

## 背景

手動 CLI 測試發現：當 source/target/--path 三者皆為絕對路徑、source 是 fixture 內合法檔案時，`move --dry-run` 只輸出 `Summary: 0 files, 0 changes`，沒錯誤、沒任何 diff。AI agent 完全無法區分「沒事做」「失敗」「路徑誤判」。

實測：CLI 層 path 處理已正確（`move.command.ts:106` `path.isAbsolute(source) ? source : path.resolve(projectRoot, source)`），失敗點在下游 `moveService.generateChangeset()` 或更內部，且 CLI 沒對「changeset 完全為空」做檢查。

## 重現

```bash
agent-ide move \
  /Users/lova/git/vibe/agent-ide/tests/fixtures/sample-project/src/utils/string-utils.ts \
  /Users/lova/git/vibe/agent-ide/tests/fixtures/sample-project/src/utils/string-helpers.ts \
  --path /Users/lova/git/vibe/agent-ide/tests/fixtures/sample-project \
  --dry-run
```

實際輸出（exit 0）：
```
   /Users/lova/.../string-utils.ts   /Users/lova/.../string-helpers.ts
Summary: 0 files, 0 changes
```

預期應該輸出 rename diff（file rename + import 更新）。

## 預期

- 空 changeset 必須明確區分原因並輸出：
  - `source` 與 `target` 解析後相同 → 「來源與目標相同，無需移動」
  - `source` 不存在 → 「源檔案找不到: X」（已有的錯誤路徑保留）
  - `target` 已存在 → 「目標已存在: X」
  - 其他空 changeset → 「無檔案需移動，請檢查路徑」+ exit code 1
- 有實際變更時 → dry-run 輸出包含 rename + import 更新 diff

## User Stories

- As an AI agent，I want `move` 對任何空 changeset 都明確說出原因，so that 我能正確處理而不誤判成功。

## 驗收條件

- 先補 E2E 測試（fail-first）：
  - source/target/--path 全絕對路徑、檔案存在、目標不存在 → 必須包含 rename 與至少 1 筆 import 更新 diff（指 fixture 內有引用該檔的測試案例）。
  - source 與 target 解析後相同 → exit code ≠ 0、stderr 明確訊息。
  - 空 changeset 任何其他情境 → exit code ≠ 0、stderr 訊息明確。
- Root cause 排查：先 instrument `moveService.generateChangeset()` 確認回傳的 changeset 結構，找出 silent 真正來源後再決定修哪一層。
- `pnpm test` 全綠。

## Root Cause 候選

1. `MoveService.generateChangeset()` 對 `--dry-run` 模式回傳空 changeset 而未拋錯
2. `move.command.ts` 沒檢查 `changeset.textChanges.length === 0 && changeset.fileOperations.length === 0` 的退場條件
3. fixture 內 string-utils.ts 的 import 引用關係導致實際 0 變更（需驗證）
