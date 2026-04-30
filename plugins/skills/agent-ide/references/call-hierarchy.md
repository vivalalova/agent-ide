# call-hierarchy

追蹤函式的呼叫層次關係。

## 參數

- `<function>` - 要分析的函式名稱（必填）
- `--path <path>` - 專案路徑（預設 `.`）
- `--direction both|incoming|outgoing` - 分析方向（預設 both）
- `--depth <n>` - 遞迴深度 1-10（預設 1）
- `--format json|summary` - 輸出格式（預設 summary）

## 範例

```bash
npx agent-ide call-hierarchy myFunction --path .
npx agent-ide call-hierarchy myFunction --path . --direction incoming
```
