---
title: ReferenceFinderEngine Dead Code 清理
created: 2026-03-12
priority: medium
suggested_order: B1
phase: needs-commit
iteration: 2
max_iterations: 3
review_iterations: 1
---

# ReferenceFinderEngine Dead Code 清理

`src/core/find-references/reference-finder-engine.ts` 的 `ReferenceFinderEngine` 是 `SymbolFinder` 的薄包裝，零使用者 — CLI 直接用 `IndexEngine` + `SymbolFinder`。僅 barrel export。

依 universal.md #4 移除 `ReferenceFinderEngine`、`createReferenceFinderEngine` 及 barrel export。

## User Stories

- As a developer, I want dead code removed, so that the codebase stays lean and doesn't confuse maintainers.

## 驗收條件

- Given src/, when grepping ReferenceFinderEngine, then no references found
- Given find-references/index.ts, when checked, then no dead exports
- Given `pnpm build && pnpm test`, when executed, then all pass
