# move

移動檔案/成員並自動更新 import。

## CLI Help

<!-- agent-ide-help:start -->
```text
Usage: agent-ide move [options] [source] [target]

移動檔案、目錄或成員（source:line 格式觸發成員移動）。⚠️ 目錄移動遵循 mv 行為：目標已存在時會嵌套

Options:
  -s, --source <path>    來源路徑
  -t, --target <path>    目標路徑
  -p, --path <path>      專案根目錄路徑 (default: "<cwd>")
  --update-imports       自動更新 import 路徑（預設為 true） (default: true)
  --no-update-imports    不更新 import 路徑
  --dry-run              預覽變更而不執行
  --format <format>      輸出格式 (diff|json|summary) (default: "diff")
  --target-class <name>  目標類別名稱（成員移動用）
  --keep-reexport        保留原位置的 re-export（成員移動用）
  -h, --help             display help for command
```
<!-- agent-ide-help:end -->

## 範例

```bash
npx agent-ide move src/old.ts src/new.ts --path . --dry-run
npx agent-ide move src/utils src/helpers --path .
npx agent-ide move "src/utils/*.ts" src/lib/ --path .
npx agent-ide move src/utils.ts:25 src/helpers.ts --path .
npx agent-ide move src/utils.ts:25 src/helpers.ts --path . --keep-reexport
```

## Path 語意

- `--path` 是 project root，不是 source file。
- 相對 source/target 皆相對 `--path` 解析。
- 目標已存在且是目錄時，遵循 Unix `mv` 行為，final target 會變成 `<target>/<source basename>`。
- `--dry-run` 的 summary/diff 會顯示 final target。檔案/成員移動 JSON 會提供 `projectRoot`、`source`、`target`、`finalTarget`、`pathContext`；glob JSON 會提供 `projectRoot`、`sourcePattern`、`target`、`movedFiles`。
