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
```

## 參數

| 參數 | 說明 |
|------|------|
| `--path` | 專案路徑 |
| `--from` | 原始符號名稱 |
| `--to` | 新符號名稱 |
| `--dry-run` | 預覽模式，不實際執行 |
| `--format` | 輸出格式：`json`、`summary`、`diff` |

## 輸出結構

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
