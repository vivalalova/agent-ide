# deadcode

檢測未使用的程式碼；預設只預覽，清理必須明確指定 `--apply`。

## 參數

- `--path <path>` - 專案路徑（預設 `.`）
- `--apply` - 實際刪除 dead code 並清理 import
- `--dry-run` - 只偵測並預覽，不刪除；與 `--apply` 同時使用時仍不寫入
- `--include-exports` - 也檢測未使用的 export
- `--include-public-members` - 也檢測 public class members
- `--exclude <patterns...>` - 排除的檔案或符號模式
- `--format json|summary|diff` - 輸出格式（預設 summary）

## 範例

```bash
# 只偵測/預覽（預設不寫入）
npx agent-ide deadcode --path .
npx agent-ide deadcode --path . --dry-run
npx agent-ide deadcode --path . --include-exports --dry-run

# 刪除 dead code 並清理 import
npx agent-ide deadcode --path . --apply
npx agent-ide deadcode --path . --include-exports --apply
npx agent-ide deadcode --path . --apply --exclude "src/generated/**" "testHelper"
```
