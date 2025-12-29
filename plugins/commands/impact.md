---
allowed-tools: Bash(npx agent-ide:*)
argument-hint: --file <file> --path <path>
description: 分析檔案變更的影響範圍（BFS）
---

執行 agent-ide impact 命令，分析指定檔案變更後會影響哪些其他檔案。

## 參數說明

- `--file <file>` - 要分析的檔案（必填）
- `--path <path>` - 專案路徑（必填）
- `--format json|summary` - 輸出格式（預設 json）

## 執行命令

```bash
npx agent-ide impact $ARGUMENTS
```

## 使用時機

- 修改核心模組前，了解影響範圍
- 評估重構風險
- 規劃測試範圍
