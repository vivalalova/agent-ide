# 符號重命名 (rename)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

安全地跨專案重命名符號。

## 用法

```bash
# 預覽變更
agent-ide rename --path . --from getUserData --to fetchUserProfile --dry-run

# 執行重命名
agent-ide rename --path . --from getUserData --to fetchUserProfile

# 同名符號：用 --at 指定位置
agent-ide rename --path . --from userId --to uid --at src/handlers/user.ts:42
```

## 參數

| 參數 | 說明 |
|------|------|
| `--path` | 專案路徑 |
| `--from` | 原始符號名稱 |
| `--to` | 新符號名稱 |
| `--at` | 指定符號位置（`file:line:column`），用於區分同名符號 |
| `--dry-run` | 預覽模式，不實際執行 |
| `--format` | 輸出格式：`json`、`summary`、`diff` |

## 同名符號處理

當專案中有多個同名符號時，會報錯並列出所有位置：

```bash
$ agent-ide rename --path . --from userId --to uid
❌ 找到 15 個同名符號 "userId"，請用 --at 指定位置：

   1. src/api/handlers/user-handler.ts:15:22  (variable)
   2. src/api/handlers/user-handler.ts:19:10  (parameter)
   3. src/models/user.ts:8:3  (property)
   ...

用法: agent-ide rename --from userId --to uid --at <file:line:column>
```

使用 `--at` 精確指定要重命名的符號：

```bash
# 指定檔案和行號
agent-ide rename --from userId --to uid --at src/models/user.ts:8

# 指定檔案、行號和列號（更精確）
agent-ide rename --from userId --to uid --at src/models/user.ts:8:3
```

## 輸出格式

### diff（預設）

```diff
--- a/src/models/user-model.ts
+++ b/src/models/user-model.ts
@@ -6,7 +6,7 @@
 import { BaseModel } from './base-model';

-UserModel
+UserEntity
   constructor(user: User) {

--- a/src/services/user-service.ts
+++ b/src/services/user-service.ts
@@ -5,10 +5,10 @@
-UserModel
+UserEntity

Summary: 2 files, 8 changes, (+4 -4)
```

### summary

```
Renamed 'UserModel' to 'UserEntity'

Files: 2
Changes: 8 (+4 -4)

Files:
  src/models/user-model.ts: symbol renamed (+1 -1)
  src/services/user-service.ts: symbol renamed (+3 -3)
```

### json

```json
{
  "command": "rename",
  "success": true,
  "files": [
    {
      "filePath": "src/services/user.ts",
      "hunks": [
        {
          "header": "@@ -10,7 +10,7 @@",
          "oldStart": 10,
          "oldCount": 7,
          "newStart": 10,
          "newCount": 7,
          "lines": [
            { "type": "context", "lineNumber": 10, "content": "export class UserService {" },
            { "type": "delete", "lineNumber": 11, "content": "  getUserData() {" },
            { "type": "add", "lineNumber": 11, "content": "  fetchUserProfile() {" }
          ]
        }
      ]
    }
  ],
  "summary": { "totalFiles": 3, "totalChanges": 5 }
}
```

## 欄位說明

| 欄位 | 說明 |
|------|------|
| `files` | 受影響的檔案列表 |
| `files[].filePath` | 檔案路徑 |
| `files[].hunks` | 變更區塊列表 |
| `hunks[].header` | diff header |
| `hunks[].lines` | 變更行（context/delete/add） |
| `summary.totalFiles` | 總受影響檔案數 |
| `summary.totalChanges` | 總變更數 |
