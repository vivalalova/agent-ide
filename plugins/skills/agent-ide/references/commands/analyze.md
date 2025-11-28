# 品質分析 (analyze)

分析程式碼品質，支援多種分析類型。

## 分析類型

| 類型 | 說明 |
|------|------|
| `complexity` | 循環/認知複雜度（預設） |
| `dead-code` | 未使用的函式/變數 |
| `best-practices` | ES Module 等實踐檢查 |
| `patterns` | async/Promise/interface/enum 使用模式 |
| `quality` | 綜合評分（型別安全、錯誤處理、安全性、命名、測試覆蓋率） |

## 用法

```bash
# 複雜度分析（預設）
agent-ide analyze --path . --format json

# 指定分析類型
agent-ide analyze dead-code --path . --format json
agent-ide analyze quality --path . --format json

# 顯示所有結果（不只問題項目）
agent-ide analyze --path . --format json --all
```

## 參數

| 參數 | 說明 |
|------|------|
| `[type]` | 分析類型（可選） |
| `--path` | 專案路徑 |
| `--all` | 顯示所有結果 |
| `--format` | 輸出格式：`json`、`summary` |

## 輸出結構

```json
{
  "command": "analyze",
  "success": true,
  "analyzeType": "complexity",
  "summary": {
    "totalScanned": 25,
    "issuesFound": 3,
    "averageComplexity": 12.5,
    "maxComplexity": 45
  },
  "issues": [
    {
      "type": "complexity",
      "severity": "high",
      "message": "複雜度 45，認知複雜度 32",
      "filePath": "src/services/parser.ts",
      "score": 45
    }
  ]
}
```

## 欄位說明

| 欄位 | 說明 |
|------|------|
| `analyzeType` | 分析類型 |
| `issues` | 問題列表 |
| `issues[].type` | 問題類型 |
| `issues[].severity` | 嚴重度：`critical`、`high`、`medium`、`low` |
| `issues[].message` | 問題描述 |
| `issues[].filePath` | 檔案路徑 |
| `issues[].score` | 分數（複雜度等） |
| `summary.averageComplexity` | 平均複雜度 |
| `summary.maxComplexity` | 最大複雜度 |
