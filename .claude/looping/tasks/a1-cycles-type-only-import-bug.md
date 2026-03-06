---
title: "Bug: cycles 誤報 type-only import 循環"
created: 2026-03-06
priority: high
suggested_order: A1
---

# Bug: cycles 誤報 type-only import 循環

cycles 命令將 `import type` 形成的循環也納入檢測結果，但 type-only import 在 runtime 不存在，不應被視為循環依賴。已有 `it.skip` 測試標記此問題。

Root cause：依賴圖建構時未過濾 `isTypeOnly: true` 的 import。TS parser 的 declaration-analyzer 已正確解析 `isTypeOnly` 欄位，但 core/foundations/dependency-graph 或 core/cycles 層未使用此資訊。

## User Stories

- As a TypeScript developer, I want cycles detection to ignore type-only imports, so that I don't get false positive cycle warnings for `import type` references.

## 驗收條件

- Given a project with `import type { A } from './b'` forming a cycle, when running `agent-ide cycles`, then the type-only cycle is NOT reported
- Given the existing `it.skip` test, when the fix is applied, then the test passes and `it.skip` is removed
- Given a project with mixed runtime and type-only imports, when running cycles, then only runtime import cycles are reported
