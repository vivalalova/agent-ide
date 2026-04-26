# change-signature

修改函式參數並自動更新所有呼叫點。

## 參數

- `[file] [functionName]` - 也可用 positional 指定目標函式
- `--file <file>` - 函式所在檔案
- `--function <name>` - 函式名稱
- `--reorder "b,a,c"` - 重新排序參數（名稱或索引，逗號分隔）
- `--add "paramName:type=default@position"` - 新增參數
- `--remove "paramName"` - 移除參數（名稱或索引，逗號分隔）
- `--rename "oldName:newName"` - 重命名參數
- `--change-type "name:newType"` - 修改參數類型
- `--path <path>` - 專案根目錄路徑
- `--dry-run` - 預覽變更
- `--format json|summary|diff` - 輸出格式（預設 diff）

## 範例

```bash
npx agent-ide change-signature --file src/api.ts --function fetch --reorder "url,options,timeout"
npx agent-ide change-signature --file src/api.ts --function fetch --add "cache:boolean=false@2" --dry-run
npx agent-ide change-signature --file src/api.ts --function fetch --rename "opts:options"
npx agent-ide change-signature src/api.ts fetch --change-type "timeout:number | undefined"
```
