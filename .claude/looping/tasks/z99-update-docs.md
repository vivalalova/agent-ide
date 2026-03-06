---
title: "文件: 統一更新 README / SKILL.md / CLAUDE.md"
created: 2026-03-06
priority: low
suggested_order: Z99
blockedBy: [a1-cycles-type-only-import-bug, a2-plugin-json-version-sync, b1-javascript-plugin-e2e-tests, b2-move-member-e2e-tests, b3-deadcode-include-exports-safety, c1-application-layer-deadcode, c2-extract-function-dead-interface, d1-eslint-rules-readme, d2-contributing-md-update, d3-claude-md-path-fix]
---

# 文件: 統一更新 README / SKILL.md / CLAUDE.md

在所有任務完成後，統一審閱並更新專案文件。

## User Stories

- As a user or contributor, I want all documentation to be accurate and consistent, so that I can trust the docs as a reference.

## 驗收條件

- Given README.md, when reading module list, then it reflects the latest modules
- Given plugins/skills/agent-ide/SKILL.md, when comparing to CLI capabilities, then content is consistent
- Given CLAUDE.md, when checking all example paths and commands, then all are valid
- Given SKILL.md content changes, when checking frontmatter description, then it is updated accordingly
