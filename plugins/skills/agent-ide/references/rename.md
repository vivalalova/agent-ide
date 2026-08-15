# rename

重命名符號並自動更新所有引用。

## CLI Help

<!-- agent-ide-help:start -->
```text
Usage: agent-ide rename [options]

重新命名程式碼元素

Options:
  -s, --symbol <name>    要重新命名的符號
  -f, --from <name>      原始名稱（--symbol 的別名）
  -n, --new-name <name>  新名稱
  -o, --to <name>        新名稱（--new-name 的別名）
  -p, --path <path>      檔案或目錄路徑 (default: ".")
  -a, --at <location>    指定符號位置 (file:line:column)，用於區分同名符號
  --dry-run              預覽變更而不執行
  --format <format>      輸出格式 (diff|json|summary) (default: "diff")
  -h, --help             display help for command
```
<!-- agent-ide-help:end -->

## 範例

```bash
npx agent-ide rename --from oldName --to newName --path . --dry-run
npx agent-ide rename --from userId --to uid --at src/user.ts:42 --path .
```
