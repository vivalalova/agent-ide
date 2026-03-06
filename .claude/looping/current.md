---
title: "清理: eslint-rules no-new-filesystem README 補齊"
created: 2026-03-06
priority: low
suggested_order: D1
phase: needs-commit
iteration: 2
max_iterations: 3
---

# 清理: eslint-rules no-new-filesystem README 補齊

三個自訂 ESLint 規則中，no-fs-in-core 和 no-default-instance-in-constructor 各有 README.md，但 no-new-filesystem 缺少。eslint-rules/README.md 規則列表也未包含 no-new-filesystem。

## User Stories

- As a developer contributing to agent-ide, I want all custom ESLint rules documented, so that I understand the architectural constraints.

## 驗收條件

- Given no-new-filesystem rule, when checking its directory, then a README.md exists explaining the rule's purpose and examples
- Given eslint-rules/README.md, when reading the rule list, then all 3 rules are listed
