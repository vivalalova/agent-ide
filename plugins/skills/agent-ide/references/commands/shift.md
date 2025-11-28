# 程式碼移動 (shift)

在檔案內或跨檔案移動程式碼行。

## 用法

```bash
# 同檔案內移動
agent-ide shift src/file.ts --from 2 --to 5 --position 10 --dry-run

# 移到新檔案
agent-ide shift src/old.ts --from 1 --to 3 --target src/new.ts --position 1
```

## 參數

| 參數 | 說明 |
|------|------|
| `<file>` | 來源檔案路徑 |
| `--from` | 起始行號 |
| `--to` | 結束行號 |
| `--position` | 目標位置行號 |
| `--target` | 目標檔案（跨檔案移動） |
| `--dry-run` | 預覽模式，不實際執行 |
| `--format` | 輸出格式：`json`、`summary`、`diff` |

## 輸出結構

```json
{
  "command": "shift",
  "success": true,
  "files": [
    {
      "filePath": "src/file.ts",
      "hunks": [
        {
          "header": "@@ -2,10 +2,10 @@",
          "lines": [
            { "type": "delete", "lineNumber": 2, "content": "  function oldPosition() {" },
            { "type": "add", "lineNumber": 10, "content": "  function oldPosition() {" }
          ]
        }
      ]
    }
  ],
  "summary": { "totalFiles": 1, "totalChanges": 2 }
}
```

## 使用場景

- 重新排列函數順序
- 將程式碼片段移到新檔案
- 整理程式碼結構
