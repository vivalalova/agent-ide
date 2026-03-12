---
title: E2E 覆蓋率門檻提升計畫
created: 2026-03-12
priority: medium
suggested_order: T3
blockedBy: t1-js-e2e-four-commands
---

# E2E 覆蓋率門檻提升計畫

`vitest.config.e2e.ts` 覆蓋率門檻為 lines 43%、functions 45%、branches 40%，遠低於 unit 的 90/95/85。應制定漸進提升計畫：(1) 分析當前實際覆蓋率 (2) 找出低覆蓋率模組 (3) 補充測試後調高門檻至至少 60/65/55 作為第一階段目標。

## User Stories

- As a maintainer, I want higher E2E coverage thresholds, so that feature regressions are caught before release.

## 驗收條件

- Given vitest.config.e2e.ts, when thresholds updated, then lines ≥ 60%, functions ≥ 65%, branches ≥ 55%
- Given `pnpm test:e2e`, when executed, then passes new thresholds
