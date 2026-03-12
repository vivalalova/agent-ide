---
title: pretest cleanup 腳本評估
created: 2026-03-12
priority: low
suggested_order: M1
---

# pretest cleanup 腳本評估

`scripts/cleanup-vitest.sh` 用 `pkill -f "vitest.*forks.js"` 殺殭屍 worker，每次 test 前執行。

(1) 評估 Vitest 4.0 是否已修復 worker 洩漏 (2) 如仍需要改為更精確方式 (3) 如不需要移除腳本和 pretest hook。

## User Stories

- As a developer, I want clean test infrastructure, so that unnecessary scripts don't slow down or interfere with test runs.

## 驗收條件

- Given `pnpm test:e2e` run 3 times consecutively without cleanup script, when checked, then no zombie vitest worker processes remain (verify via `ps aux | grep vitest` after each run)
- Given evaluation result is "not needed": `scripts/cleanup-vitest.sh` deleted, `package.json` pretest hook removed, `pnpm test` still passes 3 consecutive runs
- Given evaluation result is "still needed": script replaced with more precise kill target (e.g., specific pid file), reason documented in script comment
