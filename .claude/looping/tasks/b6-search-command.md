---
title: search 命令實作
created: 2026-03-12
priority: medium
suggested_order: B6
---

# search 命令實作

`QueryCommand.Search`、`SearchResult`、`SearchFormatter` 基礎設施已存在，但無 CLI command 實作、無 core engine。`IndexEngine` 已有 `findSymbol()` 和 `SymbolIndex.search()` 可利用。

應 (1) 建立 `src/core/search/` 或在 CLI 層利用 IndexEngine (2) 實作 `search.command.ts` (3) 連接已有 formatter (4) 補 E2E 測試。

## User Stories

- As an AI agent, I want a `search` command to find symbols across the project, so that I can quickly locate code without external tools.

## 驗收條件

- Given `agent-ide search <symbol> --path <path>`, when executed, then returns matching symbols
- Given --format json, when used, then outputs structured JSON
- Given --format summary, when used, then outputs human-readable summary
- Given E2E test, when executed, then validates search functionality
