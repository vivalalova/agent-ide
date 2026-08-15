# find-references

查找符號的所有引用位置。

## CLI Help

<!-- agent-ide-help:start -->
```text
Usage: agent-ide find-references [options] <symbol>

查找符號的定義和所有引用

Options:
  -p, --path <path>    專案路徑 (default: ".")
  -a, --at <location>  指定符號位置 (file:line:column)，用於區分同名符號
  --format <format>    輸出格式 (json|summary) (default: "summary")
  -h, --help           display help for command
```
<!-- agent-ide-help:end -->

## 範例

```bash
npx agent-ide find-references myFunction --path .
npx agent-ide find-references myFunction --path . --at src/service.ts:42 --format json
```

## JSON 輸出

- `symbols` - 符號定義候選 identity 清單（不含 import-only candidate）
- `targetSymbol` - 使用 `--at` 成功定位時的目標 identity
