# snapshot

產生專案/模組 API 快照，節省 ~91% token。

## 參數

- `--path <path>` - 目標路徑（預設 `.`）
- `--since last` - 增量模式
- `--refresh` - 強制重新生成
- `--format json|summary` - 輸出格式（預設 json）

## 範例

```bash
npx agent-ide snapshot --path .
npx agent-ide snapshot --path src/core/indexing
npx agent-ide snapshot --path . --since last
```
