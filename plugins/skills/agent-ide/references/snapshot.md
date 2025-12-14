# 模組快照 (snapshot)

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

產生模組/專案快照供 AI 快速理解程式碼結構，大幅減少 token 使用量（~91% 節省）。

## 用法

```bash
# 模組快照（指定模組目錄）
agent-ide snapshot --path src/core/indexing --format json

# 專案快照（自動偵測所有模組）
agent-ide snapshot --path . --format json

# 人類可讀摘要
agent-ide snapshot --path src/core/indexing --format summary

# 增量快照（僅顯示變更）
agent-ide snapshot --path . --since last --format json

# 強制刷新快取
agent-ide snapshot --path . --refresh --format json
```

## 參數

| 參數 | 說明 |
|------|------|
| `--path` | 目標路徑 |
| `--format` | 輸出格式：`json`、`summary` |
| `--since` | 增量快照基準（`last` 使用上次快取） |
| `--refresh` | 強制刷新快取並生成完整快照 |

## 自動偵測規則

| 條件 | 結果 |
|------|------|
| 有 `package.json` + `src/` 目錄 | 專案快照（掃描所有模組） |
| 有 `index.ts` | 模組快照 |
| 其他 | 視為模組 |

## 輸出結構

| 欄位 | 說明 |
|------|------|
| `command` | 命令類型（`snapshot`） |
| `success` | 執行是否成功 |
| `summary` | 統計摘要（掃描數量等） |
| `snapshotType` | 快照類型（`module`、`project` 或 `incremental`） |
| `snapshot.module` | 模組名稱（module 類型） |
| `snapshot.project` | 專案名稱（project 類型） |
| `snapshot.modules` | 各模組快照（project 類型） |
| `snapshot.api` | Class 的 public 方法及簽章 |
| `snapshot.factories` | `createXxx` 工廠函數及簽章 |
| `snapshot.types` | Interface 和 Type 定義 |
| `snapshot.private` | Class 私有欄位（供理解內部狀態） |
| `snapshot.version` | 當前版本時間戳（incremental 類型） |
| `snapshot.baseVersion` | 基準版本時間戳（incremental 類型） |
| `snapshot.delta` | 變更內容（incremental 類型） |

## 輸出格式

### json（預設）

```json
{
  "command": "snapshot",
  "success": true,
  "summary": { "totalScanned": 1 },
  "snapshotType": "module",
  "snapshot": {
    "module": "indexing",
    "api": {
      "IndexEngine": {
        "findSymbol": "(name: string, options?: SearchOptions) → Promise<SymbolSearchResult[]>",
        "indexProject": "() → Promise<void>"
      }
    },
    "factories": {
      "createIndexConfig": "(workspacePath: string, options?: Partial<IndexConfig>) → IndexConfig"
    },
    "types": {
      "FileChangeType": "'add' | 'change' | 'unlink'"
    },
    "private": {
      "IndexEngine": { "fields": ["config", "fileIndex"] }
    }
  }
}
```

### summary

```
📦 專案: sample-project
📁 模組數: 2

  📂 src
     API: 20 classes
     Factories: 4
     Types: 54

  📂 src/types
     API: 0 classes
     Factories: 0
     Types: 43
```

## 快照內容說明

| 區塊 | 內容 |
|------|------|
| `api` | Class 的 public 方法及其完整簽章 |
| `factories` | `createXxx` 開頭的工廠函數 |
| `types` | Interface 和 Type alias 定義 |
| `private` | Class 的私有欄位列表（供理解內部狀態） |

## 增量快照

使用 `--since last` 可生成增量快照，僅顯示自上次快照以來的變更。

### 增量快照輸出

```json
{
  "command": "snapshot",
  "success": true,
  "snapshotType": "incremental",
  "snapshot": {
    "version": "2024-12-14T10:30:00.000Z",
    "baseVersion": "2024-12-14T09:00:00.000Z",
    "delta": {
      "added": {
        "modules": {},
        "symbols": [
          { "module": "indexing", "name": "NewClass", "type": "class" }
        ]
      },
      "modified": {
        "modules": ["indexing"],
        "symbols": [
          { "module": "indexing", "name": "IndexEngine", "type": "class" }
        ]
      },
      "removed": {
        "modules": [],
        "symbols": []
      }
    }
  }
}
```

### 增量快照 summary

```
📦 增量快照 (Version: 2024-12-14T10:30:00.000Z)
🔖 基準版本: 2024-12-14T09:00:00.000Z

✨ 新增: 0 個模組, 1 個符號
  ➕ class indexing.NewClass

📝 修改: 1 個模組, 1 個符號
  📂 模組 indexing
  ✏️  class indexing.IndexEngine
```

### 快取位置

增量快照的快取存放於專案根目錄的 `.agent-ide/snapshot-cache.json`。
