---
allowed-tools: Bash(npx agent-ide:*)
argument-hint: --path <path> [--dry-run] [--include-exports]
description: 檢測並清理未使用的程式碼
---

執行 agent-ide deadcode 命令，檢測並清理專案中未使用的程式碼。

## 參數說明

- `--path <path>` - 專案路徑（必填）
- `--dry-run` - 預覽要刪除的程式碼，不執行
- `--include-exports` - 也檢測未使用的 export
- `--format json|summary|diff` - 輸出格式（預設 diff）

## 執行命令

```bash
npx agent-ide deadcode $ARGUMENTS
```

## 使用範例

- 預覽 dead code：`/deadcode --path . --dry-run --format json`
- 清理 dead code：`/deadcode --path .`
- 包含未用 export：`/deadcode --path . --include-exports --dry-run`

## 最佳實踐

1. 先用 `--dry-run` 檢視要刪除的內容
2. 確認沒有誤判後再執行實際刪除
3. 注意：動態引用可能被誤判為 dead code
