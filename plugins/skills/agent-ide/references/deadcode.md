# Dead Code 檢測與刪除 (deadcode)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

語義級 Dead Code 檢測，找出專案中未使用的符號（函式、變數、類別等）。支援 `--autofix` 自動刪除。

## 為什麼使用 deadcode？

| 優勢 | 說明 |
|------|------|
| **語義精確** | 分析符號引用關係，不是簡單文字搜尋 |
| **信心分數** | 每個結果附帶信心分數，避免誤判 |
| **自動刪除** | `--autofix` 一鍵刪除 dead code 並清理 import |
| **結構化輸出** | JSON 格式，AI 可直接解析處理 |

## 用法

### 檢測 Dead Code

```bash
# 檢測 dead code（JSON 格式）
agent-ide deadcode --path . --format json

# 人類可讀格式
agent-ide deadcode --path . --format summary

# 包含 export 的符號（預設排除）
agent-ide deadcode --path . --include-exports
```

### 自動刪除 (--autofix)

```bash
# 預覽刪除（diff 格式，預設 dry-run）
agent-ide deadcode --path . --autofix

# 預覽刪除（JSON 格式）
agent-ide deadcode --path . --autofix --format json

# 實際執行刪除
agent-ide deadcode --path . --autofix --no-dry-run

# 設定信心度門檻（只刪除高信心度項目）
agent-ide deadcode --path . --autofix --min-confidence 0.95

# 排除特定符號
agent-ide deadcode --path . --autofix --exclude main App
```

## 參數

### 檢測參數

| 參數 | 說明 |
|------|------|
| `--path` | 專案路徑（預設 `.`） |
| `--format` | 輸出格式：`json`、`summary`、`diff`（autofix 預設） |
| `--include-exports` | 包含 export 的符號（預設排除） |

### Autofix 參數

| 參數 | 說明 |
|------|------|
| `--autofix` | 啟用自動刪除模式 |
| `--no-dry-run` | 實際執行刪除（預設只預覽） |
| `--min-confidence` | 最小信心度門檻（0-1，預設 0.9） |
| `--exclude` | 排除的符號名稱（可多個） |

## 輸出格式

### json

```json
{
  "command": "analyze",
  "analyzeType": "dead-code",
  "success": true,
  "items": [
    {
      "name": "unusedFunction",
      "type": "function",
      "file": "src/utils.ts",
      "line": 42,
      "column": 10,
      "confidence": 0.95,
      "reason": "函式 'unusedFunction' 只有定義，無使用引用"
    },
    {
      "name": "oldVariable",
      "type": "variable",
      "file": "src/config.ts",
      "line": 15,
      "column": 5,
      "confidence": 0.9,
      "reason": "變數 'oldVariable' 只有定義，無使用引用"
    }
  ],
  "summary": {
    "totalScanned": 500,
    "deadCodeCount": 12,
    "filesAffected": 5
  }
}
```

### summary

```
Dead Code 檢測結果

掃描符號: 500
Dead Code: 12 個
影響檔案: 5 個

按類型統計:
  函式: 8
  變數: 3
  介面: 1

Dead Code 列表:
  src/utils.ts
    L42: unusedFunction (function, 95%)
       函式 'unusedFunction' 只有定義，無使用引用
  src/config.ts
    L15: oldVariable (variable, 90%)
       變數 'oldVariable' 只有定義，無使用引用
```

### autofix (json)

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

### autofix (diff)

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
- **信心分數**：分數越高代表越確定是 dead code，建議優先處理高分數項目
- **動態引用**：無法檢測 `eval()`、`require()` 動態字串等運行時引用
- **Autofix 預設 dry-run**：使用 `--no-dry-run` 才會實際刪除
- **Import 清理**：刪除符號後自動清理變成未使用的 import
