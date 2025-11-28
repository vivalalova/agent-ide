# 模組快照 (snapshot)

產生模組/專案快照供 AI 快速理解程式碼結構，大幅減少 token 使用量（~91% 節省）。

## 用法

```bash
# 模組快照（指定模組目錄）
agent-ide snapshot --path src/core/indexing --format json

# 專案快照（自動偵測所有模組）
agent-ide snapshot --path . --format json

# 人類可讀摘要
agent-ide snapshot --path src/core/indexing --format summary
```

## 參數

| 參數 | 說明 |
|------|------|
| `--path` | 目標路徑 |
| `--format` | 輸出格式：`json`、`summary` |

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
| `snapshotType` | 快照類型（`module` 或 `project`） |
| `snapshot.module` | 模組名稱（module 類型） |
| `snapshot.project` | 專案名稱（project 類型） |
| `snapshot.modules` | 各模組快照（project 類型） |
| `snapshot.api` | Class 的 public 方法及簽章 |
| `snapshot.factories` | `createXxx` 工廠函數及簽章 |
| `snapshot.types` | Interface 和 Type 定義 |
| `snapshot.private` | Class 私有欄位（供理解內部狀態） |

## 範例輸出

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

## 快照內容說明

| 區塊 | 內容 |
|------|------|
| `api` | Class 的 public 方法及其完整簽章 |
| `factories` | `createXxx` 開頭的工廠函數 |
| `types` | Interface 和 Type alias 定義 |
| `private` | Class 的私有欄位列表（供理解內部狀態） |
