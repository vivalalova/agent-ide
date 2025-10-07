# Agent IDE - MCP 設定指南

本指南將協助你在 Claude Code 中設定 Agent IDE MCP Server。

## 🚀 快速開始（一步到位，無需安裝）

### 步驟 1: 編輯 MCP 設定檔

**Claude Desktop** (桌面應用)：
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`

**Claude Code** (CLI/Extension)：
- macOS/Linux: `~/.config/claude/mcp_settings.json`
- Windows: `%APPDATA%\Claude\mcp_settings.json`

### 步驟 2: 加入以下設定

```json
{
  "mcpServers": {
    "agent-ide": {
      "command": "npx",
      "args": [
        "-y",
        "https://github.com/vivalalova/agent-ide.git",
        "agent-ide-mcp"
      ],
      "env": {}
    }
  }
}
```

### 步驟 3: 重新啟動 Claude

關閉並重新開啟 Claude，Agent IDE 的工具就會自動載入。

### 步驟 4: 驗證安裝

在 Claude 中輸入：

```
請列出所有可用的 agent-ide 工具
```

你應該會看到以下 7 個工具：
- `code_index` - 程式碼索引
- `code_search` - 程式碼搜尋
- `code_rename` - 重新命名
- `code_move` - 檔案移動
- `code_analyze` - 程式碼分析
- `code_deps` - 依賴分析
- `parser_plugins` - Parser 插件管理

---

## 📝 使用範例

### 範例 1: 索引專案

在 Claude Code 中：

```
請使用 agent-ide 索引 /path/to/my/project
```

### 範例 2: 搜尋符號

```
請在專案中搜尋 UserService 類別
```

### 範例 3: 分析依賴關係

```
請分析專案的依賴關係並檢查是否有循環依賴
```

### 範例 4: 重新命名

```
請將 src/user.ts 中第 10 行第 14 列的符號重新命名為 CustomerService（先預覽）
```

---

## 🔧 進階設定

### 方式 B: 手動安裝（適合開發或離線使用）

如果你想要手動安裝而不使用 npx：

1. **安裝 Agent IDE**：
   ```bash
   # 從 GitHub 安裝
   npm install -g https://github.com/vivalalova/agent-ide.git

   # 或從 npm 安裝（發布後）
   npm install -g agent-ide

   # 或從本地原始碼
   git clone https://github.com/vivalalova/agent-ide.git
   cd agent-ide
   pnpm install
   pnpm build
   npm link
   ```

2. **修改 MCP 設定**（使用直接命令而非 npx）：
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

3. 重新啟動 Claude

### 自訂工作目錄

如果需要指定工作目錄，可以在設定中加入環境變數：

```json
{
  "mcpServers": {
    "agent-ide": {
      "command": "npx",
      "args": [
        "-y",
        "https://github.com/vivalalova/agent-ide.git",
        "agent-ide-mcp"
      ],
      "env": {
        "AGENT_IDE_WORKSPACE": "/path/to/default/workspace"
      }
    }
  }
}
```

### 使用本地開發版本

如果你正在開發 Agent IDE，可以指定本地路徑：

```json
{
  "mcpServers": {
    "agent-ide": {
      "command": "node",
      "args": ["/path/to/agent-ide/bin/mcp-server.js"],
      "env": {}
    }
  }
}
```

---

## 🐛 疑難排解

### 問題 1: npx 首次執行較慢

**原因**: npx 需要從 GitHub 下載並建置專案

**解決方法**:
- 第一次執行會需要幾分鐘，請耐心等待
- 之後 npx 會快取已安裝的版本，啟動速度會變快
- 如果想要更快的啟動速度，可以使用「方式 B: 手動安裝」

### 問題 2: 工具無法使用

**解決方法**：
1. 檢查 MCP Server 是否正常運作：
   ```bash
   npx -y https://github.com/vivalalova/agent-ide.git agent-ide-mcp
   ```
   然後輸入測試訊息：
   ```json
   {"jsonrpc":"2.0","id":1,"method":"tools/list"}
   ```

2. 查看 Claude Code 日誌

3. 確認設定檔格式正確（JSON 語法）

### 問題 3: 權限錯誤

**解決方法**：
```bash
# 確保有執行權限
chmod +x ~/.npm/_npx/*/node_modules/.bin/agent-ide-mcp
```

### 問題 4: 想要更新到最新版本

**解決方法**：
```bash
# 清除 npx 快取
npx clear-npx-cache

# 或手動刪除快取
rm -rf ~/.npm/_npx
```

---

## 📚 更多資源

- [Agent IDE README](./README.md)
- [MCP 協議文件](https://modelcontextprotocol.io/)
- [問題回報](https://github.com/vivalalova/agent-ide/issues)

## 🎯 下一步

1. 嘗試在你的專案中建立索引
2. 探索不同的搜尋和分析功能
3. 使用重構工具改善程式碼品質
4. 查看 [README](./README.md) 瞭解更多 CLI 用法
