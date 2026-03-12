---
title: call-hierarchy JS 語言支援
created: 2026-03-12
priority: high
suggested_order: A2
phase: needs-commit
iteration: 2
max_iterations: 3
review_iterations: 1
---

# call-hierarchy JS 語言支援

`CallHierarchyAnalyzer` 直接 `import * as ts from 'typescript'` 並使用 `getTypeScriptSourceFile`，硬依賴 TypeScript AST。對 `.js` 檔案無法運作且無明確錯誤訊息。

需 (1) 將 TS 硬依賴抽象化，透過 ParserRegistry 取得 AST (2) 加入 JS 支援或至少回報清楚的「不支援 JS」錯誤 (3) 補 JS E2E 測試。

## User Stories

- As an agent using call-hierarchy on a JS project, I want clear error messages or working results, so that I don't get silent failures.

## 驗收條件

- Given a JS project, when running `call-hierarchy`, then either returns correct results or clear unsupported error
- Given a TS project, when running `call-hierarchy`, then behavior unchanged (no regression)
- Given JS E2E test, when executed, then validates JS behavior
