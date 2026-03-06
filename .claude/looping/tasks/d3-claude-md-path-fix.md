---
title: "清理: CLAUDE.md 示例路徑修正"
created: 2026-03-06
priority: low
suggested_order: D3
---

# 清理: CLAUDE.md 示例路徑修正

CLAUDE.md 測試規範段落引用 `tests/e2e/commands/cli-rename-basic.e2e.test.ts`，但實際路徑結構是 `tests/e2e/commands/typescript/` 子目錄。需更新為正確路徑。

## User Stories

- As a developer following CLAUDE.md, I want example paths to be correct, so that I can quickly find referenced test files.

## 驗收條件

- Given CLAUDE.md test example, when reading the file path, then it matches an existing file in the repository
