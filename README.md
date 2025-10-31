# Agent IDE

> 📝 本文件由 AI Agent 生成

為 AI 代理設計的程式碼智能工具集，提供索引、搜尋、重構、依賴分析等功能。

## 🚀 快速開始

### 🎯 Plugin 安裝（最簡單，推薦）

**一鍵安裝完整 AI Skill**：

在 Claude Code 中執行：
```bash
/plugin marketplace add vivalalova/agent-ide
```

安裝後立即獲得：
- ✅ **完整 AI Skill**：直接對話式使用所有功能
- ✅ **自動化工作流程**：智能分析、安全重構、品質改善
- ✅ **7 個實戰案例**：抽取重複邏輯、API 重命名、清理死代碼等

**使用範例**：
```
你：「分析這個專案的品質」
AI：[自動執行診斷流程，呈現完整報告和建議]

你：「重構 getUserData 為 fetchUserProfile」
AI：[預覽影響 → 確認 → 執行 → 驗證 → 品質對比]

你：「清理這個專案的死代碼」
AI：[掃描 → 分類 → 確認 → 清理 → 報告改善]
```

📖 **完整 Skill 文件**：查看 [SKILL.md](./plugin/skills/agent-ide/SKILL.md) 了解所有功能和工作流程

---

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

| 工具             | 功能                                   |
| ---------------- | -------------------------------------- |
| `code_index`     | 建立程式碼索引                         |
| `code_search`    | 搜尋符號、文字                         |
| `code_rename`    | 重新命名符號                           |
| `code_move`      | 移動檔案並更新 import                  |
| `code_analyze`   | 分析程式碼品質                         |
| `code_deps`      | 依賴關係分析                           |
| `code_shit`      | 垃圾度評分（分數越高越糟，含修復建議） |
| `parser_plugins` | Parser 插件管理                        |

> 💡 **Snapshot 功能詳解**：查看 [SNAPSHOT.md](./docs/SNAPSHOT.md) 了解如何使用快照功能完成 TypeScript 專案型別安全重構（ShitScore 改善 11%）

---

<details>
<summary>📋 AI Agent 使用指南（CLAUDE.md 提示詞）</summary>

> **注意**：此指南適用於透過 CLI 使用 agent-ide 的情境。
> - 如果你已透過 MCP 整合，則可直接使用 `code_index`、`code_search` 等 MCP 工具，無需使用這些 CLI 命令。
> - 如果未安裝 MCP 或需要獨立使用，請複製以下內容到你的 `CLAUDE.md` 或 `.claude/CLAUDE.md`。

````markdown
# agent-ide CLI 工具使用規範

## 核心功能

agent-ide 提供程式碼索引、搜尋、重構、依賴分析等功能。所有命令支援 `--format json` 輸出。

## 相比 Claude Code 原生工具的優勢

agent-ide 在以下場景中比原生工具（Grep、Read、Edit）更高效：

1. **跨檔案符號重命名**：一次命令更新所有引用，原生工具需要手動 Edit 每個檔案
2. **自動更新 import 路徑**：移動檔案時自動處理所有 import 語句，避免手動追蹤
3. **依賴關係分析**：快速找出循環依賴和影響範圍，原生工具需要手動追蹤
4. **程式碼品質分析**：一次掃描獲得複雜度、死代碼等指標，節省多次檔案讀取
5. **統一 JSON 輸出**：結構化資料易於解析和自動化處理
6. **批量操作**：一次處理數十個檔案，避免重複執行命令

**使用建議**：重構、移動檔案、依賴分析時優先使用 agent-ide；簡單的檔案讀寫繼續使用原生工具。

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

### 2. 符號重新命名（變數改名時強制使用）
**🚨 重要：變數/函數/類別改名時必須使用此工具，禁止手動逐一修改**

```bash
# 預覽變更（查看影響範圍）
npx agent-ide rename --from oldName --to newName --preview

# 執行重新命名（一次更新所有引用）
npx agent-ide rename --from oldName --to newName
```

**優勢**：自動更新所有檔案中的引用，避免遺漏或手動修改錯誤

### 3. 檔案移動（自動更新 import，強制使用）
**🚨 重要：移動檔案時必須使用此工具，禁止手動移動後逐一修改 import**

```bash
# 預覽影響範圍（查看哪些檔案的 import 會被更新）
npx agent-ide move src/old.ts src/new.ts --preview

# 移動檔案並自動更新所有 import 路徑
npx agent-ide move src/old.ts src/new.ts
```

**優勢**：自動處理所有檔案的 import 路徑更新，避免遺漏或路徑錯誤

### 4. 程式碼品質分析（優先使用）
**💡 優先於手動檢查：一次掃描獲得完整指標，避免多次讀取檔案**

```bash
# 複雜度分析（預設只顯示高複雜度檔案）
npx agent-ide analyze complexity --format json

# 顯示所有檔案的複雜度
npx agent-ide analyze complexity --format json --all

# 死代碼檢測（預設只顯示有死代碼的檔案）
npx agent-ide analyze dead-code --format json

# 顯示所有掃描的檔案（包含沒問題的）
npx agent-ide analyze dead-code --format json --all

# 最佳實踐檢查
npx agent-ide analyze best-practices --format json
```

**優勢**：結構化輸出、批量分析、涵蓋多個品質維度、預設只顯示有問題的項目節省 token

### 5. 依賴關係分析（優先使用）
**💡 優先於手動追蹤：快速找出循環依賴和影響範圍，避免逐檔追蹤 import**

```bash
# 分析依賴關係（預設只顯示循環依賴和孤立檔案）
npx agent-ide deps --format json

# 顯示完整依賴圖（包含 nodes 和 edges）
npx agent-ide deps --format json --all

# 查詢特定檔案的依賴
npx agent-ide deps --file src/service.ts --format json
```

**優勢**：視覺化依賴關係、自動檢測循環依賴、影響範圍分析、預設只顯示問題節省 token

### 6. 垃圾度評分（綜合品質評估）
**💩 一次掃描獲得完整垃圾度評分：分數越高越糟，自動產生修復建議**

```bash
# 基本評分（0-100分，分數越高越糟糕）
npx agent-ide shit --format json

# 詳細分析（包含 topShit 和 recommendations）
npx agent-ide shit --detailed --format json

# 顯示前 20 個最糟項目
npx agent-ide shit --detailed --top=20 --format json

# CI/CD 門檻檢查（超過 70 分則失敗）
npx agent-ide shit --max-allowed=70
```

**評分維度**：
- **複雜度垃圾**（35%）：高圈複雜度、長函式、深層巢狀、過多參數
- **維護性垃圾**（35%）：死代碼、超大檔案
- **架構垃圾**（30%）：循環依賴、孤立檔案、高耦合

**評級系統**：
- ✅ A (0-29)：優秀
- ⚠️ B (30-49)：良好
- 💩 C (50-69)：需重構
- 💩💩 D (70-84)：強烈建議重構
- 💩💩💩 F (85-100)：建議重寫

**優勢**：綜合評估、具體建議、CI/CD 整合、token 效率高

### 7. 程式碼重構（優先使用）
**💡 優先於手動重構：自動處理複雜重構操作，避免手動複製貼上和修改**

```bash
# 提取函式
npx agent-ide refactor extract-function \
  --file src/app.ts \
  --start-line 10 \
  --end-line 20 \
  --function-name handleUser
```

**優勢**：保持程式碼結構完整性、自動處理變數作用域、減少人為錯誤

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
├── 插件系統：TypeScript、JavaScript
└── 介面層：CLI、MCP
```

**效能特色**：
- 增量索引（~1000 檔案/秒）
- 多層快取（查詢 <50ms）
- 並行處理
- 記憶體優化（~100MB / 10k 檔案）

**支援語言**：TypeScript、JavaScript

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

### 功能說明

- [**實戰指南**](./docs/GUIDE.md) - **綜合使用各功能完成新增/刪除/重構的完整案例**
- [Snapshot](./docs/SNAPSHOT.md) - 快照功能實戰指南，TypeScript 專案型別安全重構案例
- [Indexing](./docs/INDEXING.md) - 高效能程式碼索引引擎，增量索引與多層快取
- [Search](./docs/SEARCH.md) - 文字/符號/語義三種搜尋模式，支援正規表達式
- [Rename](./docs/RENAME.md) - 安全的符號重命名，自動更新所有引用
- [Move](./docs/MOVE.md) - 智能檔案移動，自動更新 import 路徑
- [Dependencies](./docs/DEPENDENCIES.md) - 依賴關係分析，循環依賴檢測與影響範圍
- [Quality](./docs/QUALITY.md) - 程式碼品質分析，ShitScore 評分與診斷

### 開發指南

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
