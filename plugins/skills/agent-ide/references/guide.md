# Agent IDE 完整指南

## 概述

agent-ide 是為 AI 代理設計的 CLI 工具集，提供搜尋、重構、依賴分析功能，讓 AI 能智能地理解和操作程式碼。

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

## 命令索引

| 命令 | 說明 | 類型 | 文件 |
|------|------|------|------|
| [rename](commands/rename.md) | 符號重命名 | 變更類 | `--dry-run` `--format diff` |
| [move](commands/move.md) | 檔案移動 + import 更新 | 變更類 | `--dry-run` `--format diff` |
| [search](commands/search.md) | 文字/正則/模糊/符號搜尋 | 查詢類 | `--format json` |
| [deps](commands/deps.md) | 依賴分析、循環檢測 | 查詢類 | `--format json` |
| [analyze](commands/analyze.md) | 程式碼品質分析 | 查詢類 | `--format json` |
| [shift](commands/shift.md) | 程式碼行移動 | 變更類 | `--dry-run` `--format diff` |
| [refactor](commands/refactor.md) | 提取/內聯函數 | 變更類 | `--dry-run` `--format diff` |
| [snapshot](commands/snapshot.md) | 模組/專案快照 | 查詢類 | `--format json` |

## 輸出格式

所有命令支援 `--format` 參數：

| 格式 | 說明 | 適用命令 |
|------|------|---------|
| `json` | 機器可讀 JSON | 所有命令 |
| `summary` | 人類可讀摘要 | 所有命令 |
| `diff` | 程式碼差異 | 變更類命令 |

## 工作流程範例

### 重構流程

```bash
# 1. 分析品質
agent-ide analyze --path . --format json

# 2. 預覽重命名影響
agent-ide rename --path . --from oldName --to newName --dry-run

# 3. 執行重命名
agent-ide rename --path . --from oldName --to newName

# 4. 檢查循環依賴
agent-ide deps cycles --path .
```

### 模組重組

```bash
# 1. 分析依賴
agent-ide deps --path . --format json

# 2. 預覽檔案移動
agent-ide move src/old.ts src/new-location.ts --path . --dry-run

# 3. 執行移動
agent-ide move src/old.ts src/new-location.ts --path .

# 4. 檢查新循環依賴
agent-ide deps cycles --path .
```

### 快速理解模組

```bash
# 產生模組快照
agent-ide snapshot --path src/core/indexing --format json
```

## 支援語言

- TypeScript
- JavaScript
- Swift

## 效能

- 增量索引（~1000 檔案/秒）
- 多層快取（查詢 <50ms）
- 記憶體優化（~100MB / 10k 檔案）
