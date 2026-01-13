# rename

重命名符號並自動更新所有引用。

## 參數

- `--from <old>` - 原始符號名稱（必填）
- `--to <new>` - 新符號名稱（必填）
- `--path <path>` - 專案路徑（必填）
- `--at <file:line:column>` - 指定符號位置（同名消歧）
- `--dry-run` - 預覽變更
- `--format json|summary|diff` - 輸出格式（預設 diff）

## 範例

```bash
npx agent-ide rename --from oldName --to newName --path . --dry-run
npx agent-ide rename --from userId --to uid --at src/user.ts:42 --path .
```
