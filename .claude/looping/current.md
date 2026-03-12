---
title: JS E2E 測試補全（4 命令）
created: 2026-03-12
priority: high
suggested_order: T1
phase: needs-commit
iteration: 2
max_iterations: 3
review_iterations: 3
---

# JS E2E 測試補全（4 命令）

`tests/e2e/commands/javascript/` 缺少 `call-hierarchy`、`change-signature`、`move-member`、`snapshot` 四個命令的 E2E 測試。應參照 TS 端對等測試模式，使用 `tests/fixtures/js-project` 或建立新 JS fixture。

## User Stories

- As a maintainer, I want E2E test coverage for all commands in JS environment, so that JS support regressions are caught immediately.

## 驗收條件

- Given js-project fixture, when running call-hierarchy E2E, then test passes (or validates error if JS unsupported)
- Given js-project fixture, when running change-signature E2E, then test passes
- Given js-project fixture, when running move-member E2E, then test passes
- Given js-project fixture, when running snapshot E2E, then test passes
- Given `pnpm test:e2e`, when executed, then all new JS tests pass
