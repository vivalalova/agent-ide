# search

搜尋專案中的符號，支援模糊匹配與符號類型過濾。

## 參數

- `<symbol>` - 要搜尋的符號名稱（必填）
- `--path <path>` - 專案路徑（預設 `.`）
- `--type <type>` - 只回傳指定符號類型（class|function|interface|variable|constant|type|enum）
- `--no-fuzzy` - 使用精確匹配
- `--max-results <n>` - 最大結果數（預設 100）
- `--format json|summary` - 輸出格式（預設 summary）

## 範例

```bash
npx agent-ide search UserService --path .
npx agent-ide search process --path . --type function --format json
```
