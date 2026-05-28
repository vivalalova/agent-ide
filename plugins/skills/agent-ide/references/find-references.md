# find-references

查找符號的所有引用位置。

## 參數

- `<symbol>` - 要查找的符號名稱（必填）
- `--path <path>` - 專案路徑（預設 `.`）
- `--at <file:line:column>` - 指定符號位置（同名消歧）
- `--format json|summary` - 輸出格式（預設 summary）

## 範例

```bash
npx agent-ide find-references myFunction --path .
npx agent-ide find-references myFunction --path . --at src/service.ts:42 --format json
```

## JSON 輸出

- `symbols` - 符號定義候選 identity 清單（不含 import-only candidate）
- `targetSymbol` - 使用 `--at` 成功定位時的目標 identity
