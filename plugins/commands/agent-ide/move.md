---
allowed-tools: Bash(npx agent-ide:*)
argument-hint: <source> <target> --path <path> [--dry-run]
description: 移動檔案/成員並自動更新 import
---

執行 agent-ide move 命令，移動檔案或成員並自動更新所有 import 路徑。

## 參數說明

- `<source>` - 來源路徑（必填）
  - 檔案：`src/old.ts`
  - 目錄：`src/utils/`
  - Glob：`"src/utils/*.ts"`
  - 成員：`src/utils.ts:25`（行號表示成員移動）
- `<target>` - 目標路徑（必填）
  - 成員移動可指定插入位置：`src/helpers.ts:10`
- `--path <path>` - 專案路徑（必填）
- `--dry-run` - 預覽變更，不執行
- `--format json|summary|diff` - 輸出格式（預設 diff）

## 執行命令

```bash
npx agent-ide move $ARGUMENTS
```

## 使用範例

- 檔案移動：`/move src/old.ts src/new.ts --path . --dry-run`
- 目錄移動：`/move src/utils src/helpers --path . --dry-run`
- Glob 移動：`/move "src/utils/*.ts" src/lib/ --path . --dry-run`
- 成員移動：`/move src/utils.ts:25 src/helpers.ts --path . --dry-run`

## 注意事項

- 目錄移動遵循 Unix `mv` 行為：目標已存在時會嵌套
- 多檔案移動時目標必須是目錄（以 `/` 結尾或已存在的目錄）
