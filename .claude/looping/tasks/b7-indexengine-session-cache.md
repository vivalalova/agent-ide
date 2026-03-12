---
title: IndexEngine session 層快取
created: 2026-03-12
priority: medium
suggested_order: B7
---

# IndexEngine Persistent Disk Cache

每次 CLI command 執行都 `new IndexEngine()` + `indexProject()` 完整重建索引。無跨程序快取，連續多命令重複 index 同專案。

實作方式：**persistent disk cache**（`~/.cache/agent-ide/<project-hash>/`），以 project path + all file mtimes 為 cache key，序列化 IndexEngine 索引結果到磁碟。不做 in-process cache（CLI 是 single-invocation 模式）。

應 (1) 建立 `infrastructure/cache/index-cache.ts`，cache key = sha256(projectPath + sorted file mtimes) (2) CLI 啟動時 load cache、命令結束後 save (3) 加 `--no-cache` flag 跳過。

## User Stories

- As an AI agent running multiple commands in sequence, I want indexing results cached to disk, so that the second command on the same project is measurably faster.

## 驗收條件

- Given same project, when first command runs, then `~/.cache/agent-ide/<hash>/index.json` is created
- Given same project with no file changes, when second command runs, then `indexProject()` is NOT called (cache hit measurable via --verbose log)
- Given `--no-cache` flag, when used, then cache is not read and fresh indexing runs
- Given any file modification between commands, when cache checked, then cache key differs and re-indexes
- Given `pnpm test`, when executed, then all pass
