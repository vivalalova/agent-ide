# change-signature

修改函式參數並自動更新所有呼叫點。

## 參數

- `--file <file>` - 函式所在檔案（必填）
- `--function <name>` - 函式名稱（必填）
- `--reorder "b,a,c"` - 重新排序參數
- `--add "paramName:type"` - 新增參數
- `--remove "paramName"` - 移除參數
- `--path <path>` - 專案路徑（預設當前目錄）
- `--dry-run` - 預覽變更
- `--format json|summary|diff` - 輸出格式（預設 diff）

## 範例

```bash
npx agent-ide change-signature --file src/api.ts --function fetch --reorder "url,options,timeout"
npx agent-ide change-signature --file src/api.ts --function fetch --add "cache:boolean" --dry-run
```
