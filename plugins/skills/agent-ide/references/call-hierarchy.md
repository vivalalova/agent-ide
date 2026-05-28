# call-hierarchy

追蹤函式的呼叫層次關係。

## CLI Help

<!-- agent-ide-help:start -->
```text
Usage: agent-ide call-hierarchy [options] <function>

顯示函數的呼叫者（incoming）和被呼叫者（outgoing）

Options:
  -p, --path <path>            專案路徑 (default: ".")
  -d, --direction <direction>  分析方向: incoming, outgoing, both (default: "both")
  --depth <n>                  遞迴深度（1-10） (default: "1")
  -a, --at <location>          指定函數位置 (file:line:column)，用於區分同名函數或方法
  --format <format>            輸出格式 (json|summary) (default: "summary")
  -h, --help                   display help for command
```
<!-- agent-ide-help:end -->

## 範例

```bash
npx agent-ide call-hierarchy myFunction --path .
npx agent-ide call-hierarchy myFunction --path . --direction incoming
npx agent-ide call-hierarchy myFunction --path . --at src/service.ts:42 --format json
```

## JSON 輸出

- `symbols` - 函式候選 identity 清單
- `targetSymbol` - 使用 `--at` 成功定位時的目標 identity
