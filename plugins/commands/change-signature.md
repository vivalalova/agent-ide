---
allowed-tools: Bash(npx agent-ide:*)
argument-hint: --file <file> --function <name> [--reorder "b,a"] [--add "c:string"] [--remove "a"]
description: 修改函式參數並自動更新所有呼叫點
---

執行 agent-ide change-signature 命令，修改函式的參數簽章並自動更新所有呼叫點。

## 參數說明

- `--file <file>` - 函式所在檔案（必填）
- `--function <name>` - 函式名稱（必填）
- `--reorder "b,a,c"` - 重新排序參數
- `--add "paramName:type"` - 新增參數
- `--remove "paramName"` - 移除參數
- `--path <path>` - 專案路徑（預設當前目錄）
- `--dry-run` - 預覽變更，不執行
- `--format json|summary|diff` - 輸出格式（預設 diff）

## 執行命令

```bash
npx agent-ide change-signature $ARGUMENTS
```

## 使用範例

- 重排參數：`/change-signature --file src/api.ts --function fetch --reorder "url,options,timeout"`
- 新增參數：`/change-signature --file src/api.ts --function fetch --add "cache:boolean"`
- 移除參數：`/change-signature --file src/api.ts --function fetch --remove "debug"`
- 組合操作：`/change-signature --file src/api.ts --function fetch --reorder "b,a" --add "c:string" --dry-run`
