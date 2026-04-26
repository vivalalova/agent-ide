# find-references

查找符號的所有引用位置。

## 參數

- `<symbol>` - 要查找的符號名稱（必填）
- `--path <path>` - 專案路徑（預設 `.`）
- `--format json|summary` - 輸出格式（預設 summary）

## 範例

```bash
npx agent-ide find-references myFunction --path .
```
