# Agent IDE - MCP Registry 提交文件

## 📦 基本資訊

- **套件名稱**: agent-ide
- **版本**: 0.1.0
- **Repository**: https://github.com/vivalalova/agent-ide
- **npm 套件**: https://www.npmjs.com/package/agent-ide (待發布)
- **授權**: MIT

## 📝 描述

Agent IDE 是一個為 AI 代理設計的程式碼智能工具集，提供高效的程式碼操作和分析功能。

**主要功能**：
- 程式碼索引與符號搜尋
- 智能重新命名（跨檔案引用更新）
- 檔案移動與 import 路徑自動更新
- 程式碼品質與複雜度分析
- 依賴關係分析與循環依賴檢測
- 可插拔 Parser 系統（TypeScript, JavaScript, Swift）

## 🔧 安裝方式

```bash
npm install -g agent-ide
```

## 🛠️ MCP Server 設定

```json
{
  "mcpServers": {
    "agent-ide": {
      "command": "agent-ide-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

## 🎯 可用工具（7個）

### 1. code_index
建立和查詢程式碼索引，提供符號搜尋和檔案索引功能

**參數**：
- `action`: `create` | `update` | `search` | `stats`
- `path`: 專案路徑
- `query`: 搜尋查詢（用於 search）
- `extensions`: 包含的檔案副檔名
- `excludePatterns`: 排除模式

### 2. code_search
搜尋程式碼中的符號、文字或模式

**參數**：
- `query`: 搜尋查詢（必填）
- `path`: 搜尋路徑
- `mode`: `symbol` | `text` | `regex`
- `limit`: 結果數量限制

### 3. code_rename
執行安全的程式碼重新命名，自動更新所有引用

**參數**：
- `file`: 檔案路徑（必填）
- `line`: 行號（必填）
- `column`: 列號（必填）
- `newName`: 新名稱（必填）
- `preview`: 是否只預覽變更

### 4. code_move
移動檔案或目錄，自動更新 import 路徑

**參數**：
- `source`: 來源路徑（必填）
- `destination`: 目標路徑（必填）
- `updateImports`: 是否自動更新 import
- `preview`: 是否只預覽變更

### 5. code_analyze
分析程式碼品質、複雜度和相關指標

**參數**：
- `path`: 分析路徑（必填）
- `type`: 分析類型

### 6. code_deps
分析程式碼依賴關係，檢測循環依賴和影響範圍

**參數**：
- `path`: 分析路徑（必填）

### 7. parser_plugins
管理 Parser 插件，查看和操作插件狀態

**參數**：
- `action`: `list` | `info` | `enable` | `disable`
- `plugin`: 插件名稱
- `filter`: 過濾條件

## 📚 使用範例

```
# 索引專案
請使用 agent-ide 索引 /path/to/my/project

# 搜尋符號
在專案中搜尋 UserService 類別

# 分析依賴
分析專案的依賴關係並檢查循環依賴

# 重新命名
將 src/user.ts 第 10 行第 14 列的符號重新命名為 CustomerService（預覽模式）
```

## 🎯 目標使用者

- AI 開發助手（Claude Code、Cursor 等）
- 程式碼重構工具
- 靜態分析工具
- CI/CD 管道

## ✅ 測試狀態

- ✅ 所有單元測試通過（1724個測試）
- ✅ E2E 測試通過
- ✅ MCP Server 功能驗證通過
- ✅ TypeScript 嚴格模式編譯通過

## 📖 文件

- [README](https://github.com/vivalalova/agent-ide/blob/main/README.md)
- [整合說明](https://github.com/vivalalova/agent-ide/blob/main/CLAUDE_CODE_INTEGRATION.md)

## 🔗 相關連結

- GitHub: https://github.com/vivalalova/agent-ide
- Issues: https://github.com/vivalalova/agent-ide/issues
- Discussions: https://github.com/vivalalova/agent-ide/discussions

---

**提交者**: @vivalalova
**提交日期**: 2025-10-07
