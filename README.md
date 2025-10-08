# Agent IDE

為 AI 代理設計的程式碼智能工具集，提供索引、搜尋、重構、依賴分析等功能。

## 🚀 快速開始

### MCP 整合（Claude Code / Claude Desktop）

**Claude Code（推薦）：**
```bash
claude mcp add agent-ide -- npx -y agent-ide-mcp
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

### CLI 安裝（獨立使用）

```bash
# 從 npm（發布後）
npm install -g agent-ide

# 從原始碼
git clone https://github.com/vivalalova/agent-ide.git
cd agent-ide
pnpm install && pnpm build && npm link
```

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

<details>
<summary>📋 AI Agent 使用指南（CLAUDE.md 提示詞）</summary>

將以下內容加入你的 `CLAUDE.md` 或 `.claude/CLAUDE.md`：

````markdown
# agent-ide CLI 工具使用規範

> **注意**：此指南適用於透過 CLI 使用 agent-ide 的情境。
> - 如果你已透過 MCP 整合，則可直接使用 `code_index`、`code_search` 等 MCP 工具，無需使用這些 CLI 命令。
> - 如果未安裝 MCP 或需要獨立使用，請使用以下 CLI 命令。

## 核心功能

agent-ide 提供程式碼索引、搜尋、重構、依賴分析等功能。所有命令支援 `--format json` 輸出。

## 使用場景與命令

### 1. 程式碼搜尋（優先使用）
```bash
# 搜尋符號/文字（JSON 輸出方便解析）
npx agent-ide search "UserService" --format json

# 正規表達式搜尋
npx agent-ide search "function.*User" --type regex --format json

# 限制結果數量
npx agent-ide search "import" --limit 10 --format json
```

### 2. 符號重新命名
```bash
# 預覽變更
npx agent-ide rename --from oldName --to newName --preview

# 執行重新命名
npx agent-ide rename --from oldName --to newName
```

### 3. 檔案移動（自動更新 import）
```bash
# 移動檔案並更新所有 import 路徑
npx agent-ide move src/old.ts src/new.ts

# 預覽影響範圍
npx agent-ide move src/old.ts src/new.ts --preview
```

### 4. 程式碼品質分析
```bash
# 複雜度分析
npx agent-ide analyze complexity --format json

# 死代碼檢測
npx agent-ide analyze dead-code --format json

# 最佳實踐檢查
npx agent-ide analyze best-practices --format json
```

### 5. 依賴關係分析
```bash
# 分析專案依賴圖（含循環依賴檢測）
npx agent-ide deps --format json

# 查詢特定檔案的依賴
npx agent-ide deps --file src/service.ts --format json
```

### 6. 程式碼重構
```bash
# 提取函式
npx agent-ide refactor extract-function \
  --file src/app.ts \
  --start-line 10 \
  --end-line 20 \
  --function-name handleUser
```

## 使用建議

- **npx 執行**：無需全域安裝，直接使用 `npx agent-ide` 執行命令
- **JSON 格式優先**：需要解析結果時使用 `--format json`
- **預覽模式**：重構/移動前先用 `--preview` 確認影響範圍
- **搜尋優先於索引**：search 命令會自動處理索引，無需手動執行 index
- **限制結果數量**：大型專案使用 `--limit` 避免輸出過多
````

</details>

---

<details>
<summary>🏗️ 架構</summary>

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

</details>

---

<details>
<summary>🔌 程式化 API</summary>

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

</details>

---

<details>
<summary>🧪 開發</summary>

```bash
pnpm install      # 安裝依賴
pnpm build        # 建置
pnpm test         # 測試
pnpm typecheck    # 型別檢查
```

</details>

---

<details>
<summary>📖 文件</summary>

- [MCP 設定指南](./MCP_SETUP.md) - 詳細安裝和疑難排解
- [API 文件](./API.md) - 完整 API 參考
- [貢獻指南](./CONTRIBUTING.md) - 開發指南
- [發布檢查清單](./PUBLISH_CHECKLIST.md) - 發布流程

</details>

---

<details>
<summary>📄 授權</summary>

MIT License - 查看 [LICENSE](LICENSE) 瞭解詳情

</details>

<details>
<summary>🤝 貢獻</summary>

歡迎貢獻！請查看 [CONTRIBUTING.md](./CONTRIBUTING.md)

- 🐛 [回報問題](https://github.com/vivalalova/agent-ide/issues)
- 💬 [參與討論](https://github.com/vivalalova/agent-ide/discussions)

</details>

---

**讓 AI 代理更聰明地理解和操作程式碼** 🤖✨
