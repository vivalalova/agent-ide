---
title: "重構: extractFunction 死介面清理"
created: 2026-03-06
priority: low
suggested_order: C2
---

# 重構: extractFunction 死介面清理

TypeScript parser 和 JavaScript parser 的 extractFunction 方法皆 throw 'Not implemented'。此方法定義在 ParserPlugin interface 中，但無任何 core 模組呼叫它。

## User Stories

- As a developer, I want dead interface methods cleaned up, so that the codebase doesn't have misleading unimplemented stubs.

## 驗收條件

- Given extractFunction in ParserPlugin interface, when confirming no callers exist, then the method is removed from interface and both parser implementations
- Given the removal, when running `pnpm build && pnpm test`, then everything passes
