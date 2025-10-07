# Agent IDE - MCP 設定指南

本指南將協助你在 Claude Code 中設定 Agent IDE MCP Server。

## 🚀 快速開始

### 步驟 1: 安裝 Agent IDE

選擇以下任一方式安裝：

#### 方式 A: 從 npm 安裝（發布後）

```bash
npm install -g agent-ide
```

#### 方式 B: 從原始碼安裝

```bash
# 1. Clone 專案
git clone https://github.com/your-org/agent-ide.git
cd agent-ide

# 2. 安裝依賴並建置
pnpm install
pnpm build

# 3. 全域連結
npm link

# 4. 驗證安裝
agent-ide-mcp --version
```

### 步驟 2: 設定 Claude

選擇你使用的 Claude 版本：

#### 選項 A: Claude Desktop (桌面應用)

**macOS**:
1. 開啟 Claude Desktop
2. 進入 Settings > Developer > Edit Config
3. 或手動編輯：`~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**:
1. 開啟 Claude Desktop
2. 進入 Settings > Developer > Edit Config
3. 或手動編輯：`%APPDATA%/Claude/claude_desktop_config.json`

加入以下設定：
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

#### 選項 B: Claude Code (CLI/Extension)

**macOS / Linux**:
1. 建立設定目錄（如果不存在）：
   ```bash
   mkdir -p ~/.config/claude
   ```

2. 編輯 `~/.config/claude/mcp_settings.json`：
   ```bash
   nano ~/.config/claude/mcp_settings.json
   ```

**Windows**:
1. 編輯 `%APPDATA%\Claude\mcp_settings.json`

加入以下設定：
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

### 步驟 3: 重新啟動 Claude

關閉並重新開啟 Claude Desktop 或 Claude Code，Agent IDE 的工具就會自動載入。

### 步驟 4: 驗證安裝

詢問 Claude：

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

## 🔧 進階設定

### 自訂工作目錄

如果需要指定工作目錄，可以在設定中加入環境變數：

```json
{
  "mcpServers": {
    "agent-ide": {
      "command": "agent-ide-mcp",
      "args": [],
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

## 🐛 疑難排解

### 問題 1: 找不到 agent-ide-mcp 命令

**解決方法**：
```bash
# 檢查是否已全域安裝
which agent-ide-mcp

# 如果沒有，重新執行
npm link

# 或使用完整路徑
"command": "/usr/local/bin/agent-ide-mcp"
```

### 問題 2: 工具無法使用

**解決方法**：
1. 檢查 MCP Server 是否正常運作：
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | agent-ide-mcp
   ```

2. 查看 Claude Code 日誌

3. 確認設定檔格式正確（JSON 語法）

### 問題 3: 權限錯誤

**解決方法**：
```bash
# 確保執行檔有執行權限
chmod +x $(which agent-ide-mcp)
```

## 📚 更多資源

- [Agent IDE README](./README.md)
- [MCP 協議文件](https://modelcontextprotocol.io/)
- [問題回報](https://github.com/your-org/agent-ide/issues)

## 🎯 下一步

1. 嘗試在你的專案中建立索引
2. 探索不同的搜尋和分析功能
3. 使用重構工具改善程式碼品質
4. 查看 [README](./README.md) 瞭解更多 CLI 用法
