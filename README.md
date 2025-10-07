# Agent IDE

為 AI 代理設計的程式碼智能工具集，提供索引、搜尋、重構、依賴分析等功能。

## 🚀 快速開始

### Claude Code 整合（推薦）

一行指令安裝：
```bash
# 從 npm 安裝（推薦）
claude mcp add agent-ide -- npx -y agent-ide-mcp

# 或從 GitHub 安裝最新版
claude mcp add agent-ide -- npx -y github:vivalalova/agent-ide
```

安裝完成後：
1. 重新啟動 Claude Code
2. 輸入「請列出所有可用的 agent-ide 工具」驗證安裝
3. 開始使用！

<details>
<summary>手動設定 MCP（Claude Desktop / 其他）</summary>

編輯設定檔：
- **Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) 或 `%APPDATA%/Claude/claude_desktop_config.json` (Windows)
- **Claude Code**: 使用 `claude mcp add` 命令（自動設定）

加入以下設定：
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

**其他管理命令**：
```bash
# 列出所有 MCP servers
claude mcp list

# 移除 MCP server
claude mcp remove agent-ide

# 檢查連接狀態
claude mcp list
```
</details>

### 可用工具

| 工具 | 功能 |
|------|------|
| `code_index` | 建立程式碼索引 |
| `code_search` | 搜尋符號、文字 |
| `code_rename` | 重新命名符號 |
| `code_move` | 移動檔案並更新 import |
| `code_analyze` | 分析程式碼品質 |
| `code_deps` | 依賴關係分析 |
| `parser_plugins` | Parser 插件管理 |

📖 完整設定指南：[MCP_SETUP.md](./MCP_SETUP.md)

---

## 💻 CLI 使用

### 安裝

```bash
# 從 npm（發布後）
npm install -g agent-ide

# 從原始碼
git clone https://github.com/vivalalova/agent-ide.git
cd agent-ide
pnpm install && pnpm build && npm link
```

### 基本用法

```bash
# 索引專案
agent-ide index

# 搜尋程式碼
agent-ide search "UserService" --format json

# 重新命名（預覽）
agent-ide rename --from oldName --to newName --dry-run

# 移動檔案
agent-ide move src/old.ts src/new.ts

# 依賴分析
agent-ide deps --check-cycles
```

---

## 🏗️ 架構

```
Agent IDE
├── 核心模組：索引、搜尋、重構、移動、依賴分析
├── 基礎設施：Parser 框架、快取、儲存
├── 插件系統：TypeScript、JavaScript、Swift
└── 介面層：CLI、MCP
```

**效能特色**：
- 增量索引（~1000 檔案/秒）
- 多層快取（查詢 <50ms）
- 並行處理
- 記憶體優化（~100MB / 10k 檔案）

**支援語言**：TypeScript、JavaScript、Swift（開發中）

---

## 🔌 程式化 API

```typescript
import { AgentIdeMCP } from 'agent-ide';

const mcp = new AgentIdeMCP();

// 建立索引
await mcp.executeTool('code_index', {
  action: 'create',
  path: '/path/to/project'
});

// 搜尋程式碼
const result = await mcp.executeTool('code_search', {
  query: 'UserService',
  path: '/path/to/project'
});
```

---

## 🧪 開發

```bash
pnpm install      # 安裝依賴
pnpm build        # 建置
pnpm test         # 測試
pnpm typecheck    # 型別檢查
```

---

## 📖 文件

- [MCP 設定指南](./MCP_SETUP.md) - 詳細安裝和疑難排解
- [API 文件](./API.md) - 完整 API 參考
- [貢獻指南](./CONTRIBUTING.md) - 開發指南
- [發布檢查清單](./PUBLISH_CHECKLIST.md) - 發布流程

---

## 📄 授權

MIT License - 查看 [LICENSE](LICENSE) 瞭解詳情

## 🤝 貢獻

歡迎貢獻！請查看 [CONTRIBUTING.md](./CONTRIBUTING.md)

- 🐛 [回報問題](https://github.com/vivalalova/agent-ide/issues)
- 💬 [參與討論](https://github.com/vivalalova/agent-ide/discussions)

---

**讓 AI 代理更聰明地理解和操作程式碼** 🤖✨
