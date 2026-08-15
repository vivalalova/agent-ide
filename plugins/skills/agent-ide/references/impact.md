# impact

分析檔案變更的影響範圍（BFS）。

## CLI Help

<!-- agent-ide-help:start -->
```text
Usage: agent-ide impact [options]

分析檔案影響範圍

Options:
  -f, --file <file>  要分析的檔案
  -p, --path <path>  專案路徑 (default: ".")
  --format <format>  輸出格式 (json|summary) (default: "summary")
  -h, --help         display help for command
```
<!-- agent-ide-help:end -->

## 範例

```bash
npx agent-ide impact --file src/core/index.ts --path .
```

## Path 語意

- `--path` 是 project root，不是 target file。
- 相對 `--file` 會以 `--path` 為基準解析。
- JSON 錯誤會提供 `pathContext`，包含 resolved project root、requested file、resolved file。
