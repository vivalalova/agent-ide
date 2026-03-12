---
title: Lint 命令移除 --fix（CI 安全）
created: 2026-03-12
priority: medium
suggested_order: B4
---

# Lint 命令移除 --fix（CI 安全）

`package.json` 中 `"lint": "eslint ... --fix"` 在 CI 會遮蔽 lint 錯誤。

應 (1) 移除 `pnpm lint` 的 `--fix` (2) 新增 `pnpm lint:fix` 作為開發用 (3) CI 使用 `pnpm lint`。

## User Stories

- As a CI pipeline maintainer, I want lint errors to fail the build, so that code quality issues are not silently auto-fixed.

## 驗收條件

- Given package.json lint script, when checked, then no --fix flag
- Given package.json, when checked, then has separate lint:fix script with --fix
- Given `pnpm lint`, when code has lint errors, then exits with non-zero code
