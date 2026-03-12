---
title: Worker Pool 多執行緒路徑測試
created: 2026-03-12
priority: medium
suggested_order: T4
---

# Worker Pool 多執行緒路徑測試

`IndexEngine` constructor 中 `isTestEnv` 時 `parserPool = null`，所有測試走單執行緒。多執行緒路徑（tinypool Worker Pool）完全未驗證。

應 (1) 建立專門 integration test (2) 設環境變數啟用 Worker Pool (3) 驗證結果與單執行緒一致 (4) 測試 dispose/cleanup。

## User Stories

- As a maintainer, I want the worker pool path tested, so that production-only bugs are caught before release.

## 驗收條件

- Given Worker Pool enabled in test, when indexing a project, then results match single-thread mode
- Given Worker Pool test, when pool is disposed, then no resource leaks
- Given `pnpm test`, when executed, then worker pool tests pass
