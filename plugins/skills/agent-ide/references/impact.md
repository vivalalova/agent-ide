# impact

分析檔案變更的影響範圍（BFS）。

## 參數

- `--file <file>` - 要分析的檔案（必填）
- `--path <path>` - 專案路徑（預設 `.`）
- `--format json|summary` - 輸出格式（預設 summary）

## 範例

```bash
npx agent-ide impact --file src/core/index.ts --path .
```
