---
title: "測試: JavaScript plugin E2E 測試補齊"
created: 2026-03-06
priority: critical
suggested_order: B1
---

# 測試: JavaScript plugin E2E 測試補齊

JavaScript parser 已掛載到生產路徑（CLI 啟動即註冊、initializer.ts 初始化），處理 .js/.jsx 檔案，但完全沒有 E2E 測試，且被明確排除在 E2E 覆蓋率計算之外（vitest.config.e2e.ts）。branches 覆蓋率僅 1.17%。

需建立 `tests/e2e/commands/javascript/` 目錄，針對 JS 檔案的基本 CLI 命令撰寫 E2E 測試，使用 memfs fixture 包含純 .js 檔案。測試通過後逐步將 plugins/javascript 加回 E2E 覆蓋率 include。

## User Stories

- As a developer maintaining agent-ide, I want E2E test coverage for the JavaScript plugin, so that JS file operations are validated before release.

## 驗收條件

- Given a `tests/e2e/commands/javascript/` directory, when running `pnpm test:e2e`, then JS-specific E2E tests pass
- Given JS fixture files (.js/.jsx), when running cycles/impact/find-references/deadcode/rename/move, then results are correct
- Given the E2E coverage config, when plugins/javascript is included, then coverage does not drop below threshold
