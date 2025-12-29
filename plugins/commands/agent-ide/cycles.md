---
allowed-tools: Bash(npx agent-ide:*)
argument-hint: --path <path> [--format json|summary]
description: 檢測專案循環依賴（Tarjan 演算法）
---

執行 agent-ide cycles 命令，檢測專案中的循環依賴。

## 參數說明

- `--path <path>` - 專案路徑（必填）
- `--format json|summary` - 輸出格式（預設 json）
- `--all` - 顯示所有結果（不只問題）

## 執行命令

```bash
npx agent-ide cycles $ARGUMENTS
```

## 使用時機

- 重構後檢查是否產生新的循環依賴
- 分析專案架構問題
- 模組重組前後比對
