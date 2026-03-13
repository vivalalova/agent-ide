---
title: Core 模組 Unit Test 補全（7 模組）
created: 2026-03-12
priority: high
suggested_order: T2
blockedBy: a2-call-hierarchy-js-support
phase: needs-commit
iteration: 2
max_iterations: 3
review_iterations: 3
---

# Core 模組 Unit Test 補全（7 模組）

`tests/unit/core/` 只有 `cycles`、`deadcode`、`change-signature`、`foundations` 的 unit test。缺少 `call-hierarchy`、`find-references`、`impact`、`move`、`move-member`、`rename`、`snapshot` 的 core 層 unit test。

目前 core 層完全依賴 E2E 測試，邊界條件難以覆蓋。應逐步補 core engine 的 unit test。

## User Stories

- As a developer, I want unit tests for all core modules, so that I can refactor with confidence and catch edge-case bugs early.

## 驗收條件

- Given `tests/unit/core/`, when checked, then contains test files for all 7 modules: `call-hierarchy`, `find-references`, `impact`, `move`, `move-member`, `rename`, `snapshot`
- Given empty project input (no files), when each core engine runs, then returns empty result without throwing
- Given single-file project, when each core engine runs, then returns correct result
- Given invalid/non-existent path, when core engine called, then throws structured error (not crashes)
- Given `pnpm test:unit`, when executed, then all 7 new test suites pass with ≥1 test each
