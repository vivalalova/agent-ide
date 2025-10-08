# MCP 使用指南

Model Context Protocol (MCP) 整合指南，適用於 Claude Code 和 Claude Desktop。

## 目錄

- [什麼是 MCP](#什麼是-mcp)
- [安裝與設定](#安裝與設定)
- [可用工具](#可用工具)
- [工具詳細說明](#工具詳細說明)
  - [code_index](#code_index)
  - [code_search](#code_search)
  - [code_rename](#code_rename)
  - [code_move](#code_move)
  - [code_analyze](#code_analyze)
  - [code_deps](#code_deps)
  - [parser_plugins](#parser_plugins)
- [使用範例](#使用範例)
- [故障排除](#故障排除)

## 什麼是 MCP

Model Context Protocol (MCP) 是一個開放標準，讓 AI 助手能夠安全地與外部工具和資料來源互動。透過 MCP，Claude 可以：

- 直接呼叫 Agent IDE 的功能
- 存取程式碼索引和分析結果
- 自動化程式碼重構流程
- 整合到對話流程中，無需手動執行命令

### MCP vs CLI

| 特性 | MCP | CLI |
|------|-----|-----|
| 使用方式 | 對話式（透過 Claude） | 命令列 |
| 自動化 | 高（AI 自動判斷） | 低（手動執行） |
| 整合性 | 深度整合 Claude | 獨立工具 |
| 適用場景 | 對話式開發、輔助決策 | 腳本、CI/CD、獨立使用 |

## 安裝與設定

### Claude Code（推薦）

Claude Code 提供一鍵安裝功能：

```bash
claude mcp add agent-ide -- npx -y agent-ide-mcp
```

**驗證安裝：**

1. 重新啟動 Claude Code
2. 在對話中輸入：「請列出所有可用的 agent-ide 工具」
3. 應該會看到 7 個 MCP 工具列表

**管理命令：**

```bash
# 列出所有 MCP servers
claude mcp list

# 移除 MCP server
claude mcp remove agent-ide

# 檢查連接狀態
claude mcp list
```

### Claude Desktop

手動編輯設定檔：

**macOS：**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows：**
```bash
%APPDATA%/Claude/claude_desktop_config.json
```

**設定內容：**

```json
{
  "mcpServers": {
    "agent-ide": {
      "command": "npx",
      "args": ["-y", "agent-ide-mcp"],
      "env": {}
    }
  }
}
```

**驗證安裝：**

1. 重新啟動 Claude Desktop
2. 在對話中輸入：「請列出所有可用的 agent-ide 工具」
3. 應該會看到 7 個 MCP 工具列表

## 可用工具

Agent IDE 提供 7 個 MCP 工具：

| 工具名稱 | 功能 | 主要用途 |
|---------|------|----------|
| `code_index` | 程式碼索引 | 建立索引、符號搜尋、統計資訊 |
| `code_search` | 程式碼搜尋 | 符號、文字、正則表達式搜尋 |
| `code_rename` | 符號重命名 | 安全重命名，自動更新引用 |
| `code_move` | 檔案移動 | 移動檔案，自動更新 import |
| `code_analyze` | 品質分析 | 複雜度、品質指標分析 |
| `code_deps` | 依賴分析 | 依賴圖、循環依賴、影響分析 |
| `parser_plugins` | 插件管理 | Parser 插件資訊與管理 |

## 工具詳細說明

### code_index

建立和查詢程式碼索引。

#### 參數

| 參數 | 類型 | 必填 | 說明 | 預設值 |
|------|------|------|------|--------|
| `action` | string | 是 | 操作類型 | - |
| `path` | string | 否* | 專案路徑 | - |
| `query` | string | 否* | 搜尋查詢 | - |
| `extensions` | string[] | 否 | 檔案副檔名 | `['.ts', '.js', '.tsx', '.jsx']` |
| `excludePatterns` | string[] | 否 | 排除模式 | `['node_modules/**', '*.test.*']` |

**註：`path` 用於 create/update，`query` 用於 search*

#### action 值

- `create`：建立新索引
- `update`：更新現有索引
- `search`：搜尋符號
- `stats`：獲取統計資訊

#### 使用範例

**Claude 對話範例：**

```
User: 請為當前專案建立索引

Claude: 我來為專案建立索引。
[呼叫 code_index 工具]
{
  "action": "create",
  "path": "/path/to/project"
}

索引建立完成！
- 檔案數: 234
- 符號數: 1,234
```

```
User: 搜尋 UserService 符號

Claude: 我來搜尋 UserService 符號。
[呼叫 code_index 工具]
{
  "action": "search",
  "query": "UserService"
}

找到 3 個符號：
1. src/services/user.ts:15:7 - class UserService
2. src/services/user.test.ts:5:24 - import UserService
3. src/app.ts:8:12 - const service: UserService
```

#### 回傳格式

**create/update：**

```json
{
  "success": true,
  "data": {
    "action": "建立",
    "filesIndexed": 234,
    "symbolsFound": 1234,
    "stats": {
      "totalFiles": 234,
      "totalSymbols": 1234,
      "indexedAt": "2025-10-08T10:00:00.000Z"
    }
  }
}
```

**search：**

```json
{
  "success": true,
  "data": {
    "query": "UserService",
    "results": [
      {
        "name": "UserService",
        "type": "class",
        "file": "src/services/user.ts",
        "line": 15,
        "column": 7,
        "score": 1.0
      }
    ]
  }
}
```

---

### code_search

搜尋程式碼中的符號、文字或模式。

#### 參數

| 參數 | 類型 | 必填 | 說明 | 預設值 |
|------|------|------|------|--------|
| `query` | string | 是 | 搜尋查詢 | - |
| `type` | string | 否 | 搜尋類型 | `symbol` |
| `fileFilter` | string[] | 否 | 檔案類型過濾 | - |
| `limit` | number | 否 | 結果數量限制 | 50 |

#### type 值

- `symbol`：符號搜尋（類別、函式、變數等）
- `text`：文字搜尋
- `regex`：正則表達式搜尋

#### 使用範例

**Claude 對話範例：**

```
User: 在專案中搜尋所有包含 "authentication" 的程式碼

Claude: 我來搜尋包含 "authentication" 的程式碼。
[呼叫 code_search 工具]
{
  "query": "authentication",
  "type": "text",
  "limit": 20
}

找到 12 個結果：
1. src/services/auth.ts:10 - // Handle authentication
2. src/middleware/auth.ts:5 - export function authentication() {
3. ...
```

#### 回傳格式

```json
{
  "success": true,
  "data": {
    "query": "authentication",
    "type": "text",
    "results": [
      {
        "file": "src/services/auth.ts",
        "line": 10,
        "column": 5,
        "content": "// Handle authentication",
        "type": "class",
        "score": 0.95
      }
    ]
  }
}
```

---

### code_rename

安全地重新命名程式碼元素。

#### 參數

| 參數 | 類型 | 必填 | 說明 | 預設值 |
|------|------|------|------|--------|
| `type` | string | 是 | 符號類型 | - |
| `from` | string | 是 | 原始名稱 | - |
| `to` | string | 是 | 新名稱 | - |
| `path` | string | 否 | 檔案或目錄路徑 | `.` |
| `preview` | boolean | 否 | 是否預覽 | false |

#### type 值

- `variable`：變數
- `function`：函式
- `class`：類別
- `interface`：介面
- `file`：檔案

#### 使用範例

**Claude 對話範例：**

```
User: 把 UserService 重新命名為 UserManager

Claude: 我來幫你重新命名。先預覽變更：
[呼叫 code_rename 工具]
{
  "type": "class",
  "from": "UserService",
  "to": "UserManager",
  "preview": true
}

找到 15 個引用需要變更：
1. src/services/user.ts:10 - class 定義
2. src/controllers/user.ts:5 - import 語句
3. src/app.ts:8 - 型別註解
...

確認執行變更嗎？

User: 確認

Claude: 執行重新命名：
[呼叫 code_rename 工具]
{
  "type": "class",
  "from": "UserService",
  "to": "UserManager",
  "preview": false
}

✓ 重新命名完成！
- 影響檔案數: 8
- 變更數: 15
```

#### 回傳格式

```json
{
  "success": true,
  "data": {
    "changes": [
      {
        "file": "src/services/user.ts",
        "line": 10,
        "column": 7,
        "content": "UserService → UserManager",
        "oldName": "UserService",
        "newName": "UserManager"
      }
    ],
    "filesAffected": 8,
    "preview": true
  }
}
```

---

### code_move

移動檔案或目錄，自動更新 import 路徑。

#### 參數

| 參數 | 類型 | 必填 | 說明 | 預設值 |
|------|------|------|------|--------|
| `source` | string | 是 | 來源路徑 | - |
| `target` | string | 是 | 目標路徑 | - |
| `updateImports` | boolean | 否 | 是否更新 import | true |
| `preview` | boolean | 否 | 是否預覽 | false |

#### 使用範例

**Claude 對話範例：**

```
User: 把 src/services/user.ts 移到 src/core/services/user.ts

Claude: 我來移動檔案並更新 import 路徑。先預覽影響：
[呼叫 code_move 工具]
{
  "source": "src/services/user.ts",
  "target": "src/core/services/user.ts",
  "preview": true
}

檔案移動影響：
- 需要更新 12 個檔案的 import 路徑
- 主要影響:
  1. src/controllers/user.ts
  2. src/app.ts
  3. src/services/auth.ts
  ...

確認執行嗎？

User: 確認

Claude: 執行檔案移動：
[呼叫 code_move 工具]
{
  "source": "src/services/user.ts",
  "target": "src/core/services/user.ts",
  "preview": false
}

✓ 檔案移動完成！
- 更新了 12 個檔案的 import 路徑
```

#### 回傳格式

```json
{
  "success": true,
  "data": {
    "from": "src/services/user.ts",
    "to": "src/core/services/user.ts",
    "filesUpdated": 12,
    "importUpdates": [
      {
        "file": "src/controllers/user.ts",
        "line": 3,
        "oldImport": "import { UserService } from '../services/user'",
        "newImport": "import { UserService } from '../core/services/user'"
      }
    ],
    "preview": false,
    "message": "檔案移動成功"
  }
}
```

---

### code_analyze

分析程式碼品質和複雜度。

#### 參數

| 參數 | 類型 | 必填 | 說明 | 預設值 |
|------|------|------|------|--------|
| `path` | string | 否 | 分析路徑 | `.` |
| `type` | string | 否 | 分析類型 | `all` |
| `format` | string | 否 | 輸出格式 | `summary` |

#### type 值

- `complexity`：複雜度分析
- `dependencies`：依賴分析
- `quality`：品質分析
- `all`：完整分析

#### format 值

- `json`：JSON 格式
- `summary`：摘要格式

#### 使用範例

**Claude 對話範例：**

```
User: 分析 src/services/user.ts 的程式碼品質

Claude: 我來分析程式碼品質：
[呼叫 code_analyze 工具]
{
  "path": "src/services/user.ts",
  "type": "all"
}

程式碼品質報告：

複雜度：
- 循環複雜度: 8 (中等)
- 認知複雜度: 12 (中等)

品質指標：
- 可維護性指數: 65.4 (B級)
- 程式碼行數: 234
- 註解覆蓋率: 15.2%

建議：
1. 考慮拆分 processUserData 函式（複雜度 12）
2. 增加程式碼註解
```

#### 回傳格式

```json
{
  "success": true,
  "data": {
    "path": "src/services/user.ts",
    "type": "all",
    "complexity": {
      "cyclomaticComplexity": 8,
      "cognitiveComplexity": 12,
      "evaluation": "medium"
    },
    "quality": {
      "maintainabilityIndex": 65.4,
      "grade": "B",
      "linesOfCode": 234,
      "commentDensity": 15.2
    },
    "summary": "複雜度: medium (循環: 8, 認知: 12)\n品質: B (可維護性指數: 65.4)"
  }
}
```

---

### code_deps

分析程式碼依賴關係。

#### 參數

| 參數 | 類型 | 必填 | 說明 | 預設值 |
|------|------|------|------|--------|
| `path` | string | 否 | 分析路徑 | `.` |
| `type` | string | 否 | 分析類型 | `all` |
| `file` | string | 否 | 特定檔案（影響分析用） | - |
| `format` | string | 否 | 輸出格式 | `summary` |

#### type 值

- `graph`：依賴圖分析
- `cycles`：循環依賴檢測
- `impact`：影響範圍分析
- `all`：完整分析

#### format 值

- `json`：JSON 格式
- `dot`：DOT 格式（可視化）
- `summary`：摘要格式

#### 使用範例

**Claude 對話範例：**

```
User: 檢查專案中是否有循環依賴

Claude: 我來檢測循環依賴：
[呼叫 code_deps 工具]
{
  "type": "cycles"
}

依賴分析結果：

⚠️ 發現 3 個循環依賴：

1. src/services/user.ts
   → src/services/auth.ts
   → src/services/user.ts

2. src/models/user.ts
   → src/models/post.ts
   → src/models/user.ts

3. src/utils/helper.ts
   → src/utils/validator.ts
   → src/utils/helper.ts

建議優先修復第 1 和第 2 個循環依賴。
```

```
User: 如果我修改 src/services/user.ts，會影響哪些檔案？

Claude: 我來分析影響範圍：
[呼叫 code_deps 工具]
{
  "type": "impact",
  "file": "src/services/user.ts"
}

影響分析：

目標檔案: src/services/user.ts

直接影響: 8 個檔案
- src/controllers/user.ts
- src/controllers/auth.ts
- src/app.ts
- ...

間接影響: 23 個檔案

影響分數: 7.5/10 (高)

建議：修改此檔案需要特別小心，影響範圍較大。
```

#### 回傳格式

```json
{
  "success": true,
  "data": {
    "path": ".",
    "type": "all",
    "graph": {
      "totalFiles": 234,
      "totalDependencies": 456,
      "averageDependenciesPerFile": 1.95,
      "maxDependenciesInFile": 15
    },
    "cycles": {
      "circularDependencies": 3,
      "orphanedFiles": 2
    },
    "impact": {
      "targetFile": "src/services/user.ts",
      "directlyAffected": 8,
      "transitivelyAffected": 23,
      "affectedTests": 5,
      "impactScore": 7.5,
      "directlyAffectedFiles": [
        "src/controllers/user.ts",
        "src/controllers/auth.ts"
      ]
    }
  }
}
```

---

### parser_plugins

管理 Parser 插件。

#### 參數

| 參數 | 類型 | 必填 | 說明 | 預設值 |
|------|------|------|------|--------|
| `action` | string | 是 | 操作類型 | - |
| `plugin` | string | 否* | 插件名稱 | - |
| `filter` | string | 否 | 過濾條件 | `all` |

**註：`plugin` 用於 info/enable/disable*

#### action 值

- `list`：列出所有插件
- `info`：顯示插件資訊
- `enable`：啟用插件（開發中）
- `disable`：停用插件（開發中）

#### filter 值（用於 list）

- `all`：所有插件
- `enabled`：已啟用的插件
- `disabled`：已停用的插件

#### 使用範例

**Claude 對話範例：**

```
User: 列出所有可用的 Parser 插件

Claude: 我來列出所有插件：
[呼叫 parser_plugins 工具]
{
  "action": "list"
}

已安裝的 Parser 插件：

1. TypeScript Parser
   - 版本: 1.0.0
   - 支援副檔名: .ts, .tsx
   - 支援語言: TypeScript

2. JavaScript Parser
   - 版本: 1.0.0
   - 支援副檔名: .js, .jsx
   - 支援語言: JavaScript

總計: 2 個插件
```

```
User: 顯示 TypeScript Parser 的詳細資訊

Claude: 我來查詢詳細資訊：
[呼叫 parser_plugins 工具]
{
  "action": "info",
  "plugin": "typescript"
}

TypeScript Parser 詳細資訊：
- 名稱: typescript
- 版本: 1.0.0
- 支援副檔名: .ts, .tsx
- 支援語言: TypeScript
- 註冊時間: 2025-10-08T10:00:00.000Z
```

#### 回傳格式

**list：**

```json
{
  "success": true,
  "data": {
    "plugins": [
      {
        "name": "typescript",
        "version": "1.0.0",
        "supportedExtensions": [".ts", ".tsx"],
        "supportedLanguages": ["TypeScript"],
        "registeredAt": "2025-10-08T10:00:00.000Z"
      }
    ],
    "total": 2
  }
}
```

**info：**

```json
{
  "success": true,
  "data": {
    "name": "typescript",
    "version": "1.0.0",
    "supportedExtensions": [".ts", ".tsx"],
    "supportedLanguages": ["TypeScript"],
    "registeredAt": "2025-10-08T10:00:00.000Z"
  }
}
```

---

## 使用範例

### 完整工作流程

**場景：重構專案結構**

```
User: 我想把 src/services 資料夾移到 src/core/services

Claude: 好的，我來幫你完成。首先讓我分析影響範圍：
[呼叫 code_deps 工具]
{
  "type": "impact",
  "file": "src/services"
}

分析結果顯示會影響 45 個檔案。讓我先預覽移動操作：
[呼叫 code_move 工具]
{
  "source": "src/services",
  "target": "src/core/services",
  "preview": true
}

需要更新 45 個檔案的 import 路徑。確認執行嗎？

User: 確認

Claude: 執行移動：
[呼叫 code_move 工具]
{
  "source": "src/services",
  "target": "src/core/services",
  "preview": false
}

✓ 移動完成！讓我執行品質檢查：
[呼叫 code_analyze 工具]
{
  "path": "src/core/services",
  "type": "all"
}

品質檢查通過！建議執行測試確認功能正常。
```

### 程式碼審查

```
User: 審查 src/services/payment.ts 的程式碼品質

Claude: 我來進行完整審查：

1. 複雜度分析
[呼叫 code_analyze 工具]
{
  "path": "src/services/payment.ts",
  "type": "complexity"
}

2. 依賴分析
[呼叫 code_deps 工具]
{
  "type": "impact",
  "file": "src/services/payment.ts"
}

審查結果：

複雜度：
- 整體複雜度偏高（15），建議拆分
- processPayment 函式特別複雜（循環複雜度 10）

依賴：
- 直接影響 12 個檔案
- 影響分數 8.5/10（高）

建議：
1. 拆分 processPayment 函式
2. 增加單元測試覆蓋率
3. 考慮使用策略模式降低複雜度
```

## 故障排除

### 工具無法使用

**問題：Claude 找不到 agent-ide 工具**

解決方法：
1. 確認已正確安裝：`claude mcp list`
2. 重新啟動 Claude Code/Desktop
3. 檢查設定檔格式是否正確

### 索引建立失敗

**問題：code_index 建立失敗**

解決方法：
1. 檢查專案路徑是否正確
2. 確認有讀取權限
3. 檢查記憶體是否充足

### 搜尋結果不準確

**問題：code_search 結果不符預期**

解決方法：
1. 先執行 `code_index` 建立索引
2. 使用更精確的搜尋類型（symbol/text/regex）
3. 調整 `limit` 參數

### 重命名沒有效果

**問題：code_rename 沒有變更檔案**

解決方法：
1. 確認先移除 `preview: true` 參數
2. 檢查符號名稱和類型是否正確
3. 確認有寫入權限

## 最佳實踐

1. **先預覽再執行**：重構操作前先使用 `preview: true`
2. **定期更新索引**：專案變更後使用 `code_index` 更新
3. **組合使用工具**：先分析依賴，再執行重構
4. **備份重要變更**：大規模重構前先 commit
5. **驗證結果**：重構後執行測試確認功能正常

## 相關文件

- [CLI 使用指南](cli-guide.md)
- [使用範例](examples.md)
- [返回首頁](index.md)
