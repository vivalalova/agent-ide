# 檔案移動 (move)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

移動檔案並自動更新所有 import。

## 用法

```bash
# 預覽影響
agent-ide transform move src/api/user.ts src/services/user.service.ts --path . --dry-run

# 執行移動
agent-ide transform move src/api/user.ts src/services/user.service.ts --path .
```

## 參數

| 參數 | 說明 |
|------|------|
| `<source>` | 來源檔案路徑 |
| `<target>` | 目標檔案路徑 |
| `--path` | 專案路徑 |
| `--dry-run` | 預覽模式，不實際執行 |
| `--format` | 輸出格式：`json`、`summary`、`diff` |

## 輸出格式

### diff（預設）

```diff
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,5 @@
-import { User } from './api/user';
+import { User } from './services/user.service';

Summary: 2 files, 3 changes, (+1 -1)
```

### summary

```
Moved 'user.ts' to 'user.service.ts'

Files: 2
Changes: 3 (+1 -1)

Files:
  src/index.ts: import updated (+1 -1)
```

### json

```json
{
  "command": "move",
  "success": true,
  "files": [
    {
      "filePath": "src/index.ts",
      "hunks": [
        {
          "header": "@@ -1,5 +1,5 @@",
          "lines": [
            { "type": "delete", "lineNumber": 1, "content": "import { User } from './api/user';" },
            { "type": "add", "lineNumber": 1, "content": "import { User } from './services/user.service';" }
          ]
        }
      ]
    }
  ],
  "summary": { "totalFiles": 2, "totalChanges": 3 }
}
```

## 特性

- 自動更新所有引用該檔案的 import 路徑
- 支援相對路徑和絕對路徑
- 保留原始檔案的 import 語句
