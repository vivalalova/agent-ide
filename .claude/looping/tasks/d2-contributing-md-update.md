---
title: "清理: CONTRIBUTING.md 過時內容更新"
created: 2026-03-06
priority: low
suggested_order: D2
---

# 清理: CONTRIBUTING.md 過時內容更新

CONTRIBUTING.md 寫「7個核心模組」，實際為 11 個。架構圖列出不存在的模組名稱。測試指令 `pnpm test:watch` 和 `pnpm test:single` 不存在於 package.json scripts。覆蓋率描述「整體 >=80%、core/ >=95%」與實際門檻不符。

## User Stories

- As an external contributor, I want accurate documentation, so that I can understand the project structure and follow the correct workflow.

## 驗收條件

- Given CONTRIBUTING.md, when reading module count, then it matches actual count (11)
- Given architecture diagram, when comparing to src/core/, then all modules are listed
- Given test commands section, when running listed commands, then all commands exist in package.json
- Given coverage section, when comparing to vitest configs, then thresholds match
