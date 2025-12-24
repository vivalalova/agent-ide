# 檔案/成員移動 (move)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

移動檔案或成員並自動更新所有 import。

## 用法

### 檔案移動

```bash
# 預覽影響
agent-ide move src/api/user.ts src/services/user.service.ts --path . --dry-run

# 執行移動
agent-ide move src/api/user.ts src/services/user.service.ts --path .
```

### 成員移動

source 帶位置時自動切換為成員移動模式：

```bash
# 移動第 25 行的成員到另一檔案
agent-ide move src/utils.ts:25 src/helpers.ts --path . --dry-run

# 指定插入位置（在 target 第 10 行插入）
agent-ide move src/utils.ts:25 src/helpers.ts:10 --path . --dry-run

# 移動到類別內
agent-ide move src/user.ts:42 src/validator.ts --path . --target-class Validator --dry-run
```

## 參數

| 參數 | 說明 |
|------|------|
| `<source>` | 來源（檔案路徑或 `path:line[:column]`） |
| `<target>` | 目標（檔案路徑或 `path:line`） |
| `--path` | 專案路徑 |
| `--dry-run` | 預覽模式，不實際執行 |
| `--format` | 輸出格式：`json`、`summary`、`diff` |
| `--target-class` | 成員移動專用：指定目標類別名稱 |
| `--keep-reexport` | 成員移動專用：保留原位置的 re-export |

## 位置格式

| 格式 | 說明 |
|------|------|
| `path.ts` | 純檔案路徑（檔案移動模式） |
| `path.ts:25` | 檔案 + 行號（成員移動模式） |
| `path.ts:25:10` | 檔案 + 行號 + 欄位（精確定位） |

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

```text
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

- 自動更新所有引用的 import 路徑
- 支援相對路徑和絕對路徑
- 成員移動支援：function、class、interface、type、const、enum
- Windows 路徑相容（正確處理 `C:\path\file.ts:25`）
