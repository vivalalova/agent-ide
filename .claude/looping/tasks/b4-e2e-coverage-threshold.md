---
title: "測試: E2E 覆蓋率門檻提升"
created: 2026-03-06
priority: medium
suggested_order: B4
blockedBy: [b1-javascript-plugin-e2e-tests, b2-move-member-e2e-tests, b3-deadcode-include-exports-safety]
---

# 測試: E2E 覆蓋率門檻提升

E2E 覆蓋率門檻為 40%（lines/functions/branches/statements），與 unit test 的 90/95/85/90 差距懸殊。

## User Stories

- As a project maintainer, I want E2E coverage thresholds to reflect actual coverage levels, so that regressions are caught by CI.

## 驗收條件

- Given the current E2E test suite, when running coverage, then actual values are measured
- Given actual coverage values, when updating vitest.config.e2e.ts thresholds, then new thresholds are set to actual values minus ~10% buffer
- Given the updated thresholds, when running `pnpm test:e2e`, then CI passes
