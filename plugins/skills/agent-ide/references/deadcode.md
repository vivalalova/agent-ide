# Dead Code 檢測 (deadcode)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

語義級 Dead Code 檢測，找出專案中未使用的符號（函式、變數、類別等）。

## 為什麼使用 deadcode？

| 優勢 | 說明 |
|------|------|
| **語義精確** | 分析符號引用關係，不是簡單文字搜尋 |
| **信心分數** | 每個結果附帶信心分數，避免誤判 |
| **結構化輸出** | JSON 格式，AI 可直接解析處理 |

## 用法

```bash
# 檢測 dead code
agent-ide deadcode --path . --format json

# 人類可讀格式
agent-ide deadcode --path . --format summary

# 包含 export 的符號（預設排除）
agent-ide deadcode --path . --include-exports
```

## 參數

| 參數 | 說明 |
|------|------|
| `--path` | 專案路徑（預設 `.`） |
| `--format` | 輸出格式：`json`、`summary` |
| `--include-exports` | 包含 export 的符號（預設排除） |

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
