# cycles

檢測專案循環依賴（Tarjan 演算法）。

## CLI Help

<!-- agent-ide-help:start -->
```text
Usage: agent-ide cycles [options]

分析循環依賴

Options:
  -p, --path <path>  分析路徑 (default: ".")
  --format <format>  輸出格式 (json|summary) (default: "summary")
  -h, --help         display help for command
```
<!-- agent-ide-help:end -->

## 範例

```bash
npx agent-ide cycles --path .
```
