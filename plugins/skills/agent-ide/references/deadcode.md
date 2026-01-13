# deadcode

檢測並清理未使用的程式碼。

## 參數

- `--path <path>` - 專案路徑（必填）
- `--dry-run` - 預覽要刪除的程式碼
- `--include-exports` - 也檢測未使用的 export
- `--format json|summary|diff` - 輸出格式（預設 diff）

## 範例

```bash
npx agent-ide deadcode --path . --dry-run
npx agent-ide deadcode --path . --include-exports --dry-run
```
