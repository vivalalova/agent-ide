---
title: --verbose / debug 模式支援
created: 2026-03-12
priority: low
suggested_order: B8
blockedBy: b2-error-handling-consistency
---

# --verbose / debug 模式支援

無全域 `--verbose` 或 debug 模式。symbol-finder fallback 到 regex 無 log、Worker Pool 狀態無可見性。

應 (1) 加全域 `--verbose` flag 到 Commander 根命令 (2) 建立 `infrastructure/logging/` 模組替換散落的 console.warn/debug (3) verbose 模式印出 indexing 進度、parser fallback、cache hit/miss。

## User Stories

- As a developer debugging tool behavior, I want a verbose mode, so that I can see internal processing details.

## 驗收條件

- Given `--verbose` flag, when used with any command, then prints detailed processing info
- Given normal mode (no --verbose), when running command, then no extra output
- Given `pnpm test`, when executed, then all pass
