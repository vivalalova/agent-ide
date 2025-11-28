# 依賴分析 (deps)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

分析專案依賴關係，檢測循環依賴和孤立檔案。

## 子命令

| 子命令 | 說明 |
|--------|------|
| `graph` | 完整依賴圖 |
| `cycles` | 循環依賴分析 |
| `impact` | 影響分析 |
| `orphans` | 孤立檔案分析 |

## 用法

```bash
# 基本分析（預設顯示循環依賴和孤立檔案）
agent-ide deps --path . --format json

# 完整依賴圖
agent-ide deps --path . --format json --all

# 使用子命令
agent-ide deps graph --path . --format json
agent-ide deps cycles --path . --format json
agent-ide deps orphans --path . --format json
```

## 參數

| 參數 | 說明 |
|------|------|
| `--path` | 專案路徑 |
| `--all` | 顯示完整依賴圖 |
| `--format` | 輸出格式：`json`、`summary` |

## 輸出結構

```json
{
  "command": "deps",
  "success": true,
  "cycles": [
    { "cycle": ["a.ts", "b.ts", "c.ts"], "length": 3 }
  ],
  "orphans": ["src/utils/unused.ts"],
  "graph": {
    "nodes": [{ "id": "src/index.ts", "label": "index" }],
    "edges": [{ "from": "src/index.ts", "to": "src/app.ts" }]
  },
  "summary": {
    "totalScanned": 50,
    "totalFiles": 50,
    "totalDependencies": 120,
    "cyclesFound": 1,
    "orphanedFiles": 3
  }
}
```

## 欄位說明

| 欄位 | 說明 |
|------|------|
| `cycles` | 循環依賴列表 |
| `cycles[].cycle` | 循環路徑 |
| `cycles[].length` | 循環長度 |
| `orphans` | 孤立檔案列表（無被引用） |
| `graph.nodes` | 依賴圖節點 |
| `graph.edges` | 依賴圖邊 |
| `summary.cyclesFound` | 發現的循環數 |
| `summary.orphanedFiles` | 孤立檔案數 |
