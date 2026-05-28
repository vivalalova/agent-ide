# search

搜尋專案中的符號，支援模糊匹配與符號類型過濾。

## CLI Help

<!-- agent-ide-help:start -->
```text
Usage: agent-ide search [options] <symbol>

在專案中搜尋符號（支援模糊匹配）

Options:
  -p, --path <path>  專案路徑 (default: ".")
  --format <format>  輸出格式 (json|summary) (default: "summary")
  --no-fuzzy         使用精確匹配（預設為模糊匹配）
  --max-results <n>  最大結果數 (default: "100")
  --type <type>      過濾符號類型
                     (class|function|interface|variable|constant|type|enum)
  -h, --help         display help for command
```
<!-- agent-ide-help:end -->

## 範例

```bash
npx agent-ide search UserService --path .
npx agent-ide search process --path . --type function --format json
```
