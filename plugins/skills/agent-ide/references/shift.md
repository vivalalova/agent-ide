# 程式碼移動 (shift)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

在檔案內或跨檔案移動程式碼行。

## 用法

```bash
# 同檔案內移動
agent-ide transform shift src/file.ts --from 2 --to 5 --position 10 --dry-run

# 移到新檔案
agent-ide transform shift src/old.ts --from 1 --to 3 --target src/new.ts --position 1
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

## 輸出格式

### diff（預設）

```diff
--- a/src/utils/string-utils.ts
+++ b/src/utils/string-utils.ts
@@ -2,10 +2,12 @@
 * String Utils
 */

-export function capitalize(str: string): string {
-  if (!str) {
-    return str;
-  }
+export function capitalize(str: string): string {
+  if (!str) {
+    return str;
+  }
+  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
+}

Summary: 1 file, 10 changes, (+6 -4)
```

### summary

```
Moved 6 lines within file (5-10 → 15)

Files: 1
Changes: 10 (+6 -4)

Files:
  src/utils/string-utils.ts: lines moved (+6 -4)
```

### json

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
