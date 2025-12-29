---
allowed-tools: Bash(npx agent-ide:*)
argument-hint: <function> --path <path> [--direction both|incoming|outgoing]
description: 追蹤函式的呼叫層次關係
---

執行 agent-ide call-hierarchy 命令，分析函式的呼叫者和被呼叫者。

## 參數說明

- `<function>` - 要分析的函式名稱（必填，第一個參數）
- `--path <path>` - 專案路徑（必填）
- `--direction both|incoming|outgoing` - 分析方向（預設 both）
  - `incoming` - 誰呼叫這個函式
  - `outgoing` - 這個函式呼叫誰
  - `both` - 雙向分析
- `--format json|summary` - 輸出格式（預設 json）

## 執行命令

```bash
npx agent-ide call-hierarchy $ARGUMENTS
```

## 使用時機

- 理解函式的呼叫流程
- 追蹤 bug 的傳播路徑
- 分析模組間的依賴關係
