# Agent IDE - Claude Code 整合說明

## 🎉 功能完成

Agent IDE 現在完全支援 Claude Code！你可以透過 MCP (Model Context Protocol) 在 Claude Code 中直接使用所有 Agent IDE 功能。

## 📦 已實作的功能

### 1. MCP Server 實作
- ✅ stdio-based JSON-RPC 2.0 協議
- ✅ 完整的錯誤處理機制
- ✅ 支援所有核心工具（7個）
- ✅ 即時工具呼叫與回應

### 2. 可用工具列表

| 工具 | 功能 | 狀態 |
|------|------|------|
| `code_index` | 建立和查詢程式碼索引 | ✅ |
| `code_search` | 搜尋程式碼符號/文字/模式 | ✅ |
| `code_rename` | 安全重新命名符號 | ✅ |
| `code_move` | 移動檔案並更新 import | ✅ |
| `code_analyze` | 分析程式碼品質與複雜度 | ✅ |
| `code_deps` | 分析依賴關係與循環依賴 | ✅ |
| `parser_plugins` | 管理 Parser 插件 | ✅ |

### 3. 文件完整性

- ✅ [README.md](./README.md) - 完整的 CLI 和 MCP 使用指南
- ✅ [MCP_SETUP.md](./MCP_SETUP.md) - 詳細的設定步驟
- ✅ [mcp-config.example.json](./mcp-config.example.json) - 設定檔範例
- ✅ [scripts/test-mcp.sh](./scripts/test-mcp.sh) - MCP Server 測試腳本

## 🚀 快速開始

### 安裝步驟

```bash
# 1. 從原始碼安裝
cd agent-ide
pnpm install && pnpm build
npm link

# 2. 驗證安裝
agent-ide-mcp --version
```

### 設定 Claude Code

1. 編輯 MCP 設定檔：
   - macOS/Linux: `~/.config/claude/mcp_settings.json`
   - Windows: `%APPDATA%\Claude\mcp_settings.json`

2. 加入以下內容：
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

3. 重新啟動 Claude Code

### 驗證安裝

在 Claude Code 中輸入：
```
請列出所有可用的 agent-ide 工具
```

## 📝 使用範例

### 範例 1: 索引專案
```
請使用 agent-ide 索引我的專案 /path/to/project
```

### 範例 2: 搜尋符號
```
在專案中搜尋 UserService 類別
```

### 範例 3: 分析依賴
```
分析專案的依賴關係並檢查循環依賴
```

### 範例 4: 重新命名
```
將 src/user.ts 第 10 行第 14 列的符號重新命名為 CustomerService（預覽模式）
```

## 🧪 測試驗證

執行測試腳本：
```bash
./scripts/test-mcp.sh
```

預期輸出：
```
🧪 測試 Agent IDE MCP Server
==============================

📋 測試 1: 檢查啟動訊息
✅ 啟動訊息正常

📋 測試 2: 獲取工具列表
✅ 7 個工具全部載入

📋 測試 3: 查詢 Parser 插件
✅ Parser 插件查詢成功

📋 測試 4: 錯誤處理測試
✅ 錯誤處理正常

✅ MCP Server 測試完成！
```

## 📊 技術實作細節

### MCP Server 架構
```
bin/mcp-server.js (入口點)
    ↓
src/interfaces/mcp/mcp-server.ts (MCP Server)
    ↓
src/interfaces/mcp/mcp.ts (AgentIdeMCP)
    ↓
src/core/* (核心功能模組)
```

### JSON-RPC 支援的方法
- `initialize` - 初始化連接
- `tools/list` - 獲取工具列表
- `tools/call` - 呼叫工具
- `ping` - 健康檢查

### 通訊協議
- 使用 stdio (標準輸入/輸出)
- JSON-RPC 2.0 格式
- 每行一個 JSON 物件
- 支援同步和非同步呼叫

## 🎯 下一步計畫

- [ ] 發布到 npm registry
- [ ] 新增更多範例和教學
- [ ] 支援更多 MCP 功能（resources, prompts）
- [ ] 效能優化和快取改進

## 📚 相關文件

- [MCP 協議規範](https://modelcontextprotocol.io/)
- [Agent IDE README](./README.md)
- [MCP 設定指南](./MCP_SETUP.md)

## 🙏 貢獻

歡迎提交 Issue 和 Pull Request！

---

**讓 AI 代理更聰明地理解和操作程式碼** 🤖✨
