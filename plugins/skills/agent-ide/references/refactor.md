# 重構 (refactor)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

提取函數、內聯函數等重構操作。

## 支援的動作

| 動作 | 說明 |
|------|------|
| `extract-function` | 提取程式碼為函數（TS/JS） |
| `extract-closure` | 提取程式碼為閉包（Swift） |
| `inline-function` | 內聯函數呼叫 |

## 用法

```bash
# 提取函數
agent-ide transform extract-function --file src/file.ts --start-line 10 --end-line 20 --function-name newFn --dry-run

# 提取閉包（Swift）
agent-ide transform extract-closure --file src/file.swift --start-line 10 --end-line 20 --function-name newClosure --dry-run

# 跨檔案提取（提取到新檔案並自動加入 import）
agent-ide transform extract-function --file src/file.ts -s 10 -e 20 -n helper --target-file src/utils.ts --dry-run

# 內聯函數
agent-ide transform inline-function --file src/file.ts --function-name helperFn --dry-run
```

## 參數

### extract-function / extract-closure

| 參數 | 說明 |
|------|------|
| `--file` | 來源檔案路徑 |
| `-s, --start-line` | 起始行號 |
| `-e, --end-line` | 結束行號 |
| `-n, --function-name` | 新函數名稱 |
| `-t, --target-file` | 目標檔案（跨檔案提取） |
| `--dry-run` | 預覽模式 |
| `--format` | 輸出格式 |

### inline-function

| 參數 | 說明 |
|------|------|
| `--file` | 檔案路徑 |
| `--function-name` | 要內聯的函數名稱 |
| `--dry-run` | 預覽模式 |
| `--format` | 輸出格式 |

## 輸出格式

### diff（預設）

```diff
--- a/src/services/order-service.ts
+++ b/src/services/order-service.ts
@@ -1,4 +1,4 @@
+function extractedFn(order: Order) {
+  // extracted code
+}
+
 export class OrderService {
   processOrder(order: Order) {
-    // original code here
+    extractedFn(order);
   }
 }

Summary: 1 file, 4 changes, (+2 -2)
```

### summary

```
Extracted function 'extractedFn'

Files: 1
Changes: 4 (+2 -2)

Files:
  src/services/order-service.ts: code refactored (+2 -2)
```

### json

```json
{
  "command": "refactor",
  "success": true,
  "files": [
    {
      "filePath": "src/file.ts",
      "hunks": [
        {
          "header": "@@ -10,15 +10,20 @@",
          "lines": [
            { "type": "add", "lineNumber": 10, "content": "function newFn() {" },
            { "type": "add", "lineNumber": 11, "content": "  // extracted code" },
            { "type": "add", "lineNumber": 12, "content": "}" }
          ]
        }
      ]
    }
  ],
  "summary": { "totalFiles": 1, "totalChanges": 5 }
}
```

## 特性

- 自動分析變數依賴，生成正確的參數列表
- 跨檔案提取自動加入 import/export
- 內聯時自動處理參數替換
