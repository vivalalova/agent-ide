# impact

分析檔案變更的影響範圍（BFS）。

## 參數

- `--file <file>` - 要分析的檔案（必填）；相對路徑以 `--path` 為基準解析
- `--path <path>` - 專案根目錄路徑（預設 `.`）
- `--format json|summary` - 輸出格式（預設 summary）

## 範例

```bash
npx agent-ide impact --file src/core/index.ts --path .
```

## Path 語意

- `--path` 是 project root，不是 target file。
- 相對 `--file` 會以 `--path` 為基準解析。
- JSON 錯誤會提供 `pathContext`，包含 resolved project root、requested file、resolved file。
