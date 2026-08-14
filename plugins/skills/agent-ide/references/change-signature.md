# change-signature

修改函式參數並自動更新所有呼叫點。

## CLI Help

<!-- agent-ide-help:start -->
```text
Usage: agent-ide change-signature [options] [file] [functionName]

修改函式簽名並自動更新所有呼叫點

Options:
  -p, --path <path>            專案根目錄路徑
  --file <file>                要修改的檔案路徑
  --function <name>            要修改的函式名稱
  --add <params>               新增參數 (格式:
                               name:type=default@position,name2:type2=default2，可重複)
  --call-site-value <mapping>  新增參數在呼叫點使用的值 (格式: param=expression，可重複；未指定時使用
                               --add 的 default)
  --remove <params>            移除參數 (參數名稱或索引，逗號分隔)
  --reorder <order>            重新排序 (參數名稱或索引，逗號分隔)
  --rename <mapping>           重命名參數 (格式: oldName:newName,oldName2:newName2)
  --change-type <mapping>      修改參數類型 (格式: name:newType,name2:newType2)
  --dry-run                    預覽變更而不執行
  --format <format>            輸出格式 (diff|json|summary) (default: "diff")
  -h, --help                   display help for command
```
<!-- agent-ide-help:end -->

## 範例

```bash
npx agent-ide change-signature --file src/api.ts --function fetch --reorder "url,options,timeout"
npx agent-ide change-signature --file src/api.ts --function fetch --add "cache:boolean=false@2" --dry-run
npx agent-ide change-signature --file src/api.ts --function fetch --add "options:RequestOptions={ cache: false }" --call-site-value "options=runtimeOptions"
npx agent-ide change-signature --file src/api.ts --function fetch --rename "opts:options"
npx agent-ide change-signature src/api.ts fetch --change-type "timeout:number | undefined"
```
