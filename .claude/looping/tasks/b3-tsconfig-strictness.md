---
title: tsconfig 嚴格度提升（noUnusedLocals / noUnusedParameters）
created: 2026-03-12
priority: medium
suggested_order: B3
blockedBy: b1-reference-finder-engine-cleanup, a1-silent-catch-cleanup
---

# tsconfig 嚴格度提升

`tsconfig.json` 中 `noUnusedLocals: false` 和 `noUnusedParameters: false`，與 universal.md #4 衝突。ESLint `@typescript-eslint/no-unused-vars` 僅 `warn`。

應 (1) 掃描修復所有 unused code (2) tsconfig 設為 true (3) ESLint rule 從 warn 改 error。

## User Stories

- As a developer, I want the compiler to catch unused code, so that dead code doesn't accumulate.

## 驗收條件

- Given tsconfig.json, when checked, then noUnusedLocals and noUnusedParameters are true
- Given `pnpm typecheck`, when executed, then passes with no unused errors
- Given `pnpm lint`, when executed, then no-unused-vars is error level
