# call-hierarchy

追蹤函式的呼叫層次關係。

## 參數

- `<function>` - 要分析的函式名稱（必填）
- `--path <path>` - 專案路徑（必填）
- `--direction both|incoming|outgoing` - 分析方向（預設 both）
- `--format json|summary` - 輸出格式（預設 json）

## 範例

```bash
npx agent-ide call-hierarchy myFunction --path .
npx agent-ide call-hierarchy myFunction --path . --direction incoming
```
