# deadcode

檢測未使用的程式碼；預設只預覽，清理必須明確指定 `--apply`。

## CLI Help

<!-- agent-ide-help:start -->
```text
Usage: agent-ide deadcode [options]

檢測未使用的程式碼（dead code）；刪除需明確 --apply

Options:
  -p, --path <path>         專案路徑 (default: ".")
  --format <format>         輸出格式 (json|summary|diff) (default: "summary")
  --include-exports         包含 export 的符號（預設排除） (default: false)
  --include-public-members  包含 public class members（預設排除） (default: false)
  --dry-run                 預覽變更而不執行（即使同時指定 --apply）
  --apply                   實際刪除 dead code 並清理 import
  --exclude <patterns...>   排除的檔案/符號模式
  -h, --help                display help for command
```
<!-- agent-ide-help:end -->

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
