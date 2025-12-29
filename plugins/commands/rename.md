---
allowed-tools: Bash(npx agent-ide:*)
argument-hint: --from <old> --to <new> --path <path> [--at <file:line>] [--dry-run]
description: 重命名符號並自動更新所有引用
---

執行 agent-ide rename 命令，重命名符號並自動更新專案中所有引用。

## 參數說明

- `--from <old>` - 原始符號名稱（必填）
- `--to <new>` - 新符號名稱（必填）
- `--path <path>` - 專案路徑（必填）
- `--at <file:line:column>` - 指定符號位置（當有多個同名符號時使用）
- `--dry-run` - 預覽變更，不執行
- `--format json|summary|diff` - 輸出格式（預設 diff）

## 執行命令

```bash
npx agent-ide rename $ARGUMENTS
```

## 使用範例

- 基本重命名：`/rename --from oldName --to newName --path . --dry-run`
- 同名消歧：`/rename --from userId --to uid --at src/user.ts:42 --path .`

## 最佳實踐

1. 先用 `--dry-run` 預覽變更
2. 確認無誤後移除 `--dry-run` 執行
3. 執行後用 `/cycles` 檢查是否產生新的循環依賴
