# 函式簽章修改 (change-signature)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

修改函式參數（重排序、新增、刪除、改類型），自動更新所有呼叫點。

## 用法

```bash
# 預覽參數重排序
agent-ide transform change-signature --file src/utils.ts --function calculate --reorder "b,a,c" --dry-run

# 新增參數
agent-ide transform change-signature --file src/utils.ts --function calculate --add "timeout:number=5000" --dry-run

# 刪除參數
agent-ide transform change-signature --file src/utils.ts --function calculate --remove "debug" --dry-run

# 修改參數類型
agent-ide transform change-signature --file src/utils.ts --function calculate --change-type "count:bigint" --dry-run

# 執行變更
agent-ide transform change-signature --file src/utils.ts --function calculate --reorder "b,a,c"
```

## 參數

| 參數 | 說明 |
|------|------|
| `--file` | 包含函式的檔案路徑 |
| `--function` | 函式名稱 |
| `--reorder` | 參數重排序（逗號分隔的參數名稱） |
| `--add` | 新增參數（格式：`name:type=default`） |
| `--remove` | 刪除參數名稱 |
| `--change-type` | 修改參數類型（格式：`name:newType`） |
| `--path` | 專案路徑（預設當前目錄） |
| `--dry-run` | 預覽模式，不實際執行 |
| `--format` | 輸出格式：`json`、`summary`、`diff` |

## 輸出格式

### diff（預設）

```diff
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -5,7 +5,7 @@
-function calculate(a: number, b: number, c: number) {
+function calculate(b: number, a: number, c: number) {

--- a/src/service.ts
+++ b/src/service.ts
@@ -12,7 +12,7 @@
-const result = calculate(1, 2, 3);
+const result = calculate(2, 1, 3);

Summary: 2 files, 4 changes, (+2 -2)
```

### summary

```
Changed signature of 'calculate'

Signature: (a, b, c) -> (b, a, c)

Files: 2
Call sites updated: 5

Files:
  src/utils.ts: signature changed (+1 -1)
  src/service.ts: 5 call sites updated (+5 -5)
```

### json

```json
{
  "command": "change-signature",
  "success": true,
  "functionName": "calculate",
  "originalSignature": {
    "parameters": [
      { "name": "a", "type": "number" },
      { "name": "b", "type": "number" },
      { "name": "c", "type": "number" }
    ]
  },
  "newSignature": {
    "parameters": [
      { "name": "b", "type": "number" },
      { "name": "a", "type": "number" },
      { "name": "c", "type": "number" }
    ]
  },
  "files": [
    {
      "filePath": "src/utils.ts",
      "hunks": [...]
    }
  ],
  "summary": {
    "totalFiles": 2,
    "callSitesUpdated": 5
  }
}
```

## 欄位說明

| 欄位 | 說明 |
|------|------|
| `functionName` | 修改的函式名稱 |
| `originalSignature` | 原始簽章 |
| `newSignature` | 新簽章 |
| `files` | 受影響的檔案列表 |
| `summary.totalFiles` | 總受影響檔案數 |
| `summary.callSitesUpdated` | 更新的呼叫點數量 |
