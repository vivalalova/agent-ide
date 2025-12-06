# 依賴分析

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

分析專案依賴關係，提供循環依賴檢測和影響分析。

## 命令

| 命令 | 說明 |
|------|------|
| `cycles` | 循環依賴檢測 |
| `impact` | 影響分析 |

## cycles - 循環依賴檢測

檢測專案中的循環依賴，使用 Tarjan 強連通分量算法。

### 用法

```bash
# 檢測循環依賴
agent-ide cycles --path . --format json

# 人類可讀格式
agent-ide cycles --path . --format summary
```

### 參數

| 參數 | 說明 |
|------|------|
| `--path` | 專案路徑 |
| `--format` | 輸出格式：`json`、`summary` |

### 輸出範例

```json
{
  "command": "cycles",
  "success": true,
  "cycles": [
    {
      "nodes": ["src/a.ts", "src/b.ts", "src/c.ts"],
      "length": 3
    }
  ],
  "summary": {
    "totalFiles": 50,
    "cyclesFound": 1
  }
}
```

## impact - 影響分析

分析檔案的上下游依賴關係，了解修改的影響範圍。

### 用法

```bash
# 分析檔案影響範圍
agent-ide impact --file src/core.ts --path . --format json

# 人類可讀格式
agent-ide impact --file src/core.ts --path . --format summary
```

### 參數

| 參數 | 說明 |
|------|------|
| `--file` | 要分析的檔案 |
| `--path` | 專案路徑 |
| `--format` | 輸出格式：`json`、`summary` |

### 輸出範例

```json
{
  "command": "impact",
  "success": true,
  "file": "src/core.ts",
  "upstream": ["src/utils.ts", "src/types.ts"],
  "downstream": ["src/app.ts", "src/main.ts"],
  "summary": {
    "upstreamCount": 2,
    "downstreamCount": 2
  }
}
```

## 欄位說明

| 欄位 | 說明 |
|------|------|
| `cycles` | 循環依賴列表 |
| `cycles[].nodes` | 循環路徑中的檔案 |
| `cycles[].length` | 循環長度 |
| `upstream` | 此檔案依賴的檔案 |
| `downstream` | 依賴此檔案的檔案 |
