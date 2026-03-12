---
title: chokidar 廢棄依賴清理
created: 2026-03-12
priority: low
suggested_order: B5
---

# chokidar 廢棄依賴清理

`chokidar` 在 `devDependencies` 但 `src/` 無任何 import，屬廢棄依賴。移除。

## User Stories

- As a maintainer, I want unused dependencies removed, so that install time is reduced and attack surface is minimized.

## 驗收條件

- Given package.json, when checked, then chokidar not in dependencies or devDependencies
- Given `pnpm install && pnpm build && pnpm test`, when executed, then all pass
