---
title: Error Handling 一致性重構
created: 2026-03-12
priority: medium
suggested_order: B2
blockedBy: a1-silent-catch-cleanup
---

# Error Handling 一致性重構

錯誤處理模式不一致：有的 `console.warn` 後繼續、有的 `return null/[]`、有的包裝成結構化 Error。symbol-finder fallback 到 regex 無 log。

需 (1) 定義錯誤嚴重度分類 (2) `shared/errors/` 擴充結構化錯誤類型 (3) core 模組統一使用。

## User Stories

- As a developer, I want consistent error handling patterns, so that debugging is predictable and error messages are actionable.

## 驗收條件

- Given shared/errors/, when checked, then has structured error types covering all categories
- Given core modules, when error occurs, then uses consistent pattern (structured error or explicit degradation)
- Given symbol-finder fallback, when AST fails, then logs warning before regex fallback
- Given `pnpm test`, when executed, then all pass
