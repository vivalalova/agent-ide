# Dead Code 檢測與刪除 (deadcode)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

語義級 Dead Code 檢測與刪除，找出專案中未使用的符號（函式、變數、類別等）並自動清理。

## 為什麼使用 deadcode？

| 優勢 | 說明 |
|------|------|
| **語義精確** | 分析符號引用關係，不是簡單文字搜尋 |
| **自動刪除** | 預設刪除 dead code 並清理 import |
| **結構化輸出** | JSON 格式，AI 可直接解析處理 |

## 用法

```bash
# 刪除 dead code（預設行為）
agent-ide deadcode --path .

# 預覽刪除（不實際執行）
agent-ide deadcode --path . --dry-run

# JSON 格式輸出
agent-ide deadcode --path . --dry-run --format json

# 排除特定符號
agent-ide deadcode --path . --exclude main App

# 包含 export 的符號（預設排除）
agent-ide deadcode --path . --include-exports
```

## 參數

| 參數 | 說明 |
|------|------|
| `--path` | 專案路徑（預設 `.`） |
| `--format` | 輸出格式：`json`、`summary`、`diff`（預設） |
| `--dry-run` | 預覽變更而不執行 |
| `--exclude` | 排除的符號名稱（可多個） |
| `--include-exports` | 包含 export 的符號（預設排除） |

## 輸出格式

### json

```json
{
  "command": "deadcode-removal",
  "success": true,
  "files": [
    {
      "filePath": "src/utils.ts",
      "hunks": [
        {
          "startLine": 42,
          "endLine": 50,
          "oldContent": "function unusedFunction() {...}",
          "newContent": ""
        }
      ]
    }
  ],
  "summary": {
    "totalFiles": 1,
    "totalChanges": 1,
    "dryRun": true
  }
}
```

### diff

```diff
--- src/utils.ts
+++ src/utils.ts
@@ -42,9 +42,0 @@
-function unusedFunction() {
-  // dead code
-  return null;
-}
```

## 符號類型

| 類型 | 說明 |
|------|------|
| `function` | 函式 / 方法 |
| `variable` | 變數 / 常數 |
| `class` | 類別 |
| `interface` | 介面 |
| `type` | 型別別名 |
| `enum` | 列舉 |

## 注意事項

- **預設排除 export**：export 的符號可能被外部使用，預設不標記為 dead code
- **動態引用**：無法檢測 `eval()`、`require()` 動態字串等運行時引用
- **使用 --dry-run 預覽**：建議先用 `--dry-run` 確認變更內容
- **Import 清理**：刪除符號後自動清理變成未使用的 import
