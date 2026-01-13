# move

移動檔案/成員並自動更新 import。

## 參數

- `<source>` - 來源路徑（必填）
  - 檔案：`src/old.ts`
  - 目錄：`src/utils/`
  - Glob：`"src/utils/*.ts"`
  - 成員：`src/utils.ts:25`（行號表示成員移動）
- `<target>` - 目標路徑（必填）
- `--path <path>` - 專案路徑（必填）
- `--dry-run` - 預覽變更
- `--format json|summary|diff` - 輸出格式（預設 diff）

## 範例

```bash
npx agent-ide move src/old.ts src/new.ts --path . --dry-run
npx agent-ide move src/utils src/helpers --path .
npx agent-ide move "src/utils/*.ts" src/lib/ --path .
npx agent-ide move src/utils.ts:25 src/helpers.ts --path .
```
