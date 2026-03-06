---
title: "測試: deadcode --include-exports 安全性測試"
created: 2026-03-06
priority: high
suggested_order: B3
---

# 測試: deadcode --include-exports 安全性測試

deadcode 搭配 --include-exports 在 autofix 模式刪除 exported symbol 後，import 該 symbol 的其他檔案會編譯失敗。現有測試僅驗證偵測能力（dry-run JSON 輸出），從未測試「執行刪除後的影響」。

## User Stories

- As a developer, I want to ensure --include-exports autofix doesn't silently break importing files, so that deadcode removal is safe to use.

## 驗收條件

- Given an exported function imported by another file, when running `deadcode --include-exports` (non-dry-run), then the import reference is also handled
- Given autofix execution with --include-exports, when checking the fixture post-execution, then the project remains consistent (no dangling imports)
