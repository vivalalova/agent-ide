---
title: Silent Catch 全面清理（Fail-Fast 強制）
created: 2026-03-12
priority: critical
suggested_order: A1
---

# Silent Catch 全面清理（Fail-Fast 強制）

全 `src/` 約 60+ 處空 catch，違反 CLAUDE.md Fail-Fast 原則。集中在 `index-engine.ts`（7 處）、`symbol-finder.ts`（12 處）、`move-engine.ts`（5 處）、`reference-updater.ts`（3 處）、`dead-code-remover.ts`（3 處）、`change-applicator.ts`（4 處）等。

逐一審視：能 rethrow 的 rethrow、需 logging 的改結構化錯誤、確實需 graceful degradation 的加顯式註記。

## User Stories

- As a developer, I want all error handling to follow fail-fast principles, so that bugs surface immediately instead of being silently swallowed.

## 驗收條件

- Given all catch blocks in src/, when grepped with `grep -r "catch" src/`, then every catch block either rethrows, calls console.warn/error, or has `// graceful-degradation:` comment — zero bare `catch { }` or `catch { return null/[]/undefined }`
- Given a parse error in symbol-finder, when processing an unparseable file, then console.warn is called with file path and error message before regex fallback
- Given `pnpm test`, when executed, then all tests still pass after changes
