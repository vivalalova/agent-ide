# move

移動檔案/成員並自動更新 import。

## 參數

- `<source>` 或 `--source <path>` - 來源路徑
  - 檔案：`src/old.ts`
  - 目錄：`src/utils/`
  - Glob：`"src/utils/*.ts"`
  - 成員：`src/utils.ts:25`（行號表示成員移動）
- `<target>` 或 `--target <path>` - 目標路徑
- `--path <path>` - 專案根目錄路徑（預設目前工作目錄）；相對 source/target 都以此為基準解析
- `--update-imports` - 自動更新 import 路徑（預設 true）
- `--no-update-imports` - 不更新 import 路徑
- `--target-class <name>` - 目標類別名稱（成員移動用）
- `--keep-reexport` - 保留原位置的 re-export（成員移動用）
- `--dry-run` - 預覽變更；輸出會列出 resolved project root、source、requested target、final target
- `--format json|summary|diff` - 輸出格式（預設 diff）

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
