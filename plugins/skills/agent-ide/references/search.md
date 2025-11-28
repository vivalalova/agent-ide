# 程式碼搜尋 (search)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

支援多種搜尋類型的強大搜尋功能。

## 搜尋類型

| 類型 | 說明 |
|------|------|
| `text` | 文字搜尋（預設） |
| `regex` | 正規表達式搜尋 |
| `fuzzy` | 模糊搜尋（容錯匹配） |
| `symbol` | 符號名稱搜尋 |
| `structural` | 結構化搜尋（按類型過濾） |

## 用法

```bash
# 文字搜尋
agent-ide search "UserService" --path . --format json

# 正規表達式搜尋
agent-ide search "function.*User" --path . -t regex --format json

# 模糊搜尋
agent-ide search "usrSvc" --path . -t fuzzy --format json

# 符號搜尋（支援萬用字元）
agent-ide search symbol --query "User*" --path . --format json

# 結構化搜尋（按類型過濾）
agent-ide search structural -t class --pattern "Service" --path . --format json
```

## 進階過濾選項

```bash
# 過濾帶有特定屬性的符號
agent-ide search structural -t class --with-attribute "@Observable" --path .

# 過濾實作特定協定的類別
agent-ide search structural -t class --implements "Codable" --path .

# 過濾繼承特定類別的子類別
agent-ide search structural -t class --extends "BaseService" --path .
```

## 參數

| 參數 | 說明 |
|------|------|
| `<query>` | 搜尋關鍵字 |
| `--path` | 專案路徑 |
| `-t, --type` | 搜尋類型 |
| `--query` | 符號搜尋的查詢字串 |
| `--pattern` | 結構化搜尋的模式 |
| `--format` | 輸出格式：`json`、`summary` |

## 輸出結構

```json
{
  "command": "search",
  "success": true,
  "results": [
    {
      "filePath": "src/services/user.ts",
      "line": 15,
      "column": 10,
      "content": "UserService",
      "context": ["import { Injectable } from '@nestjs/common';", ""]
    }
  ],
  "summary": { "totalScanned": 50, "issuesFound": 3 },
  "truncated": false,
  "searchTime": 45
}
```

## 欄位說明

| 欄位 | 說明 |
|------|------|
| `results` | 搜尋結果列表 |
| `results[].filePath` | 檔案路徑 |
| `results[].line` | 行號 |
| `results[].column` | 欄位 |
| `results[].content` | 匹配內容 |
| `results[].context` | 上下文行 |
| `truncated` | 結果是否被截斷 |
| `searchTime` | 搜尋耗時（毫秒） |
