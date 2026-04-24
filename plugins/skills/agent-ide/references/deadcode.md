# deadcode

檢測並清理未使用的程式碼。

## 參數

- `--path <path>` - 專案路徑（必填）
- `--dry-run` - 只偵測並預覽，不刪除
- `--include-exports` - 也檢測未使用的 export
- `--format json|summary|diff` - 輸出格式（預設 diff）

## 範例

```bash
# 只偵測
npx agent-ide deadcode --path . --dry-run

# 刪除 dead code 並清理 import
npx agent-ide deadcode --path .
npx agent-ide deadcode --path . --include-exports --dry-run
```
