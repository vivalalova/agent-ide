---
allowed-tools: Bash(npx agent-ide:*)
argument-hint: <symbol> --path <path>
description: 查找符號的所有引用位置
---

執行 agent-ide find-references 命令，查找指定符號在專案中的所有引用。

## 參數說明

- `<symbol>` - 要查找的符號名稱（必填，第一個參數）
- `--path <path>` - 專案路徑（必填）
- `--format json|summary` - 輸出格式（預設 json）

## 執行命令

```bash
npx agent-ide find-references $ARGUMENTS
```

## 使用時機

- 重命名前確認影響範圍
- 理解符號的使用方式
- 追蹤 API 使用情況
