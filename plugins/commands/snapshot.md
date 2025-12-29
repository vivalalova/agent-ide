---
allowed-tools: Bash(npx agent-ide:*)
argument-hint: [--path <path>] [--since last] [--refresh]
description: 產生專案/模組 API 快照，節省 ~91% token
---

執行 agent-ide snapshot 命令，產生專案或模組的精簡 API 摘要。

## 參數說明

- `--path <path>` - 目標路徑（必填，可以是專案根目錄或特定模組）
- `--since last` - 增量模式，只顯示上次快照後的變更
- `--refresh` - 強制重新生成快照
- `--format json|summary` - 輸出格式（預設 json）

## 執行命令

```bash
npx agent-ide snapshot $ARGUMENTS
```

## 使用範例

- 專案快照：`/snapshot --path . --format json`
- 模組快照：`/snapshot --path src/core/indexing --format json`
- 增量快照：`/snapshot --path . --since last --format json`
