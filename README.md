# Agent IDE

Agent IDE 是一個為 AI 代理（如 Claude Code CLI）設計的程式碼智能工具集，提供高效的程式碼操作和分析功能。

## 🚀 特色功能

### 核心功能
- **🔍 智能搜尋**：文字搜尋、正則表達式搜尋、符號搜尋
- **📝 重新命名**：智能重新命名變數、函式、類別等程式碼元素
- **📁 檔案移動**：自動更新 import 路徑的檔案移動
- **🔗 依賴分析**：分析程式碼依賴關係和影響範圍
- **📚 程式碼索引**：建立高效的程式碼索引系統
- **🔌 可插拔 Parser**：支援多種程式語言的可插拔 Parser 系統

### 支援語言
- TypeScript
- JavaScript
- Swift（計畫中）

### AI 工具整合
- **Claude Code**：透過 MCP Server 直接使用
- **其他 AI 工具**：支援 CLI 和程式化 API

## 🔌 Claude Code 整合

Agent IDE 可以直接在 Claude Code 中使用，透過 MCP (Model Context Protocol) 提供所有功能。

### 快速設定

1. **安裝 Agent IDE**（必須先安裝）：
   ```bash
   npm install -g agent-ide
   # 或從原始碼: cd agent-ide && pnpm install && pnpm build && npm link
   ```

   > ⚠️ **重要**：必須先安裝 agent-ide，MCP 設定檔才能找到 `agent-ide-mcp` 命令

2. **設定 MCP**：

   **Claude Desktop** (桌面應用)：
   - 開啟 Claude Desktop > Settings > Developer > Edit Config
   - 或編輯設定檔：
     - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
     - Windows: `%APPDATA%/Claude/claude_desktop_config.json`

   **Claude Code** (CLI/Extension)：
   - 編輯設定檔：
     - macOS/Linux: `~/.config/claude/mcp_settings.json`
     - Windows: `%APPDATA%\Claude\mcp_settings.json`

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

3. **重新啟動 Claude Desktop 或 Claude Code**

4. **驗證安裝**：
   ```
   請列出所有可用的 agent-ide 工具
   ```

### 可用工具

在 Claude Code 中，你可以使用以下 7 個工具：

| 工具 | 功能 |
|------|------|
| `code_index` | 建立和查詢程式碼索引 |
| `code_search` | 搜尋符號、文字或模式 |
| `code_rename` | 安全重新命名符號 |
| `code_move` | 移動檔案並更新 import |
| `code_analyze` | 分析程式碼品質與複雜度 |
| `code_deps` | 分析依賴關係與循環依賴 |
| `parser_plugins` | 管理 Parser 插件 |

### 使用範例

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

📖 **完整設定指南**：查看 [MCP_SETUP.md](./MCP_SETUP.md) 瞭解詳細步驟和疑難排解

---

## 📦 安裝

### 方法一：從 npm 安裝（推薦）

```bash
# 使用 npm
npm install -g agent-ide

# 使用 pnpm
pnpm add -g agent-ide
```

### 方法二：從原始碼安裝（開發版）

```bash
# 1. Clone 專案
git clone https://github.com/vivalalova/agent-ide.git
cd agent-ide

# 2. 安裝依賴
pnpm install

# 3. 建置專案
pnpm build

# 4. 連結到全域（開發模式）
npm link

# 5. 驗證安裝
agent-ide --version
agent-ide --help
```

### 方法三：直接使用（不安裝）

```bash
# 在專案目錄中執行
cd agent-ide
pnpm install
pnpm build

# 使用 npx 執行
npx agent-ide index
npx agent-ide search "pattern"
```

### 解除安裝

```bash
# 解除全域連結
npm unlink -g agent-ide

# 或使用 npm
npm uninstall -g agent-ide
```

## 🛠️ 使用方法

### 建立索引

```bash
# 索引當前專案
agent-ide index

# 索引指定路徑
agent-ide index --path ./src

# 增量更新索引
agent-ide index --update

# 自訂檔案類型
agent-ide index --extensions ".ts,.tsx,.js,.jsx"
```

### 程式碼搜尋

```bash
# 文字搜尋
agent-ide search "function getUserById"

# 正則表達式搜尋
agent-ide search "export.*function" --regex

# 大小寫敏感搜尋
agent-ide search "User" --case-sensitive

# 全字匹配
agent-ide search "user" --whole-word

# 限制結果數量
agent-ide search "import" --max-results 10

# 顯示上下文
agent-ide search "class" --context 3

# JSON 輸出格式
agent-ide search "interface" --format json
```

### 重新命名

```bash
# 重新命名變數
agent-ide rename --from oldName --to newName

# 重新命名類別
agent-ide rename --from OldClass --to NewClass --type class

# 預覽變更（不實際修改）
agent-ide rename --from oldName --to newName --dry-run
```

### 檔案移動

```bash
# 移動檔案
agent-ide move src/old/path.ts src/new/path.ts

# 移動目錄
agent-ide move src/components src/ui/components
```

### 依賴分析

```bash
# 分析專案依賴
agent-ide deps

# 分析特定檔案的依賴
agent-ide deps --file src/utils.ts

# 檢查循環依賴
agent-ide deps --check-cycles

# 影響分析
agent-ide deps --impact src/api.ts
```

### 插件管理

```bash
# 查看已安裝的插件
agent-ide plugins list

# 啟用插件
agent-ide plugins enable typescript

# 停用插件
agent-ide plugins disable javascript
```

## 🔧 配置

Agent IDE 支援多種配置選項，可以透過配置檔案或命令列參數設定。

### 配置檔案

在專案根目錄建立 `agent-ide.config.json`：

```json
{
  "indexing": {
    "extensions": [".ts", ".tsx", ".js", ".jsx"],
    "exclude": ["node_modules/**", "dist/**", "*.test.*"],
    "maxDepth": 10
  },
  "search": {
    "maxResults": 100,
    "contextLines": 2,
    "caseSensitive": false
  },
  "rename": {
    "safeMode": true,
    "backupFiles": false
  },
  "plugins": {
    "typescript": {
      "enabled": true,
      "strictMode": true
    },
    "swift": {
      "enabled": false
    }
  }
}
```

### 環境變數

```bash
# 設定預設專案路徑
export AGENT_IDE_PROJECT_PATH=/path/to/project

# 設定快取目錄
export AGENT_IDE_CACHE_DIR=~/.agent-ide

# 啟用除錯模式
export AGENT_IDE_DEBUG=true
```

## 🏗️ 架構設計

### 模組化架構

```
Agent IDE
├── 核心模組
│   ├── 索引引擎        # 程式碼索引和符號管理
│   ├── 搜尋引擎        # 多種搜尋策略實作
│   ├── 重新命名引擎    # 智能重新命名邏輯
│   ├── 移動服務        # 檔案移動和路徑更新
│   └── 依賴分析器      # 依賴關係分析
├── 基礎設施
│   ├── Parser 框架     # 可插拔 Parser 系統
│   ├── 快取管理        # 多層快取策略
│   └── 儲存抽象        # 統一儲存介面
├── 插件系統
│   ├── TypeScript Parser
│   ├── JavaScript Parser
│   └── Swift Parser (計畫中)
└── 介面層
    ├── CLI 介面        # 命令列工具
    └── MCP 介面 (計畫中) # MCP 協議支援
```

### 效能特色

- **增量索引**：只重新索引變更的檔案
- **智能快取**：多層快取系統，減少重複計算
- **並行處理**：支援多檔案並行處理
- **記憶體優化**：使用 LRU 快取控制記憶體使用

## 🔌 插件開發

### 建立新的 Parser 插件

```typescript
import { ParserPlugin } from 'agent-ide';

export class MyLanguageParser implements ParserPlugin {
  readonly name = 'my-language';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.my'];
  readonly supportedLanguages = ['mylang'];

  async parse(code: string, filePath: string): Promise<AST> {
    // 實作語法解析邏輯
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    // 實作符號提取邏輯
  }

  async extractDependencies(ast: AST): Promise<Dependency[]> {
    // 實作依賴提取邏輯
  }

  async rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    // 實作重新命名邏輯
  }

  async validate(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async dispose(): Promise<void> {
    // 清理資源
  }
}
```

### 註冊插件

```typescript
import { ParserRegistry } from 'agent-ide';
import { MyLanguageParser } from './my-language-parser';

const registry = ParserRegistry.getInstance();
const parser = new MyLanguageParser();
registry.register(parser);
```

## 🧪 測試

```bash
# 執行所有測試
npm test

# 執行特定測試
npm test -- tests/core/search

# 監看模式
npm run test:watch

# 型別檢查
npm run typecheck

# 建置專案
npm run build
```

## 🤖 AI 代理使用指南

### 給 Claude Code、Cursor、Copilot 等 AI 工具的完整使用指南

#### 1️⃣ 安裝（給 AI 的步驟）

如果用戶想讓你使用 Agent IDE，請依序執行：

```bash
# 檢查是否已安裝
which agent-ide

# 如果未安裝，從專案目錄安裝
cd /path/to/agent-ide
pnpm install
pnpm build
npm link

# 驗證安裝
agent-ide --version
```

#### 2️⃣ 基本工作流程

```bash
# Step 1: 在用戶專案中建立索引（只需執行一次）
cd /path/to/user/project
agent-ide index

# Step 2: 搜尋程式碼
agent-ide search "目標關鍵字" --format json

# Step 3: 分析影響範圍
agent-ide deps --impact src/target-file.ts

# Step 4: 預覽變更
agent-ide rename --from oldName --to newName --dry-run

# Step 5: 執行變更
agent-ide rename --from oldName --to newName
```

#### 3️⃣ Token 優化技巧

**始終使用 JSON 格式輸出**：
```bash
agent-ide search "pattern" --format json
agent-ide deps --format json
```

**限制結果數量**：
```bash
agent-ide search "pattern" --max-results 5
```

**使用 dry-run 預覽**：
```bash
agent-ide rename --from old --to new --dry-run
agent-ide move old.ts new.ts --dry-run
```

#### 4️⃣ 完整重構範例

```bash
# 場景：重新命名類別並移動檔案

# 1. 搜尋現有使用
agent-ide search "OldClassName" --format json --max-results 20

# 2. 分析依賴
agent-ide deps --impact src/models/old-class.ts

# 3. 預覽重新命名
agent-ide rename --from OldClassName --to NewClassName --dry-run

# 4. 執行重新命名
agent-ide rename --from OldClassName --to NewClassName

# 5. 移動檔案
agent-ide move src/models/old-class.ts src/models/new-class.ts

# 6. 驗證
agent-ide search "NewClassName" --format json
agent-ide deps --check-cycles
```

#### 5️⃣ 常用命令速查

| 目的 | 命令 |
|------|------|
| 建立索引 | `agent-ide index` |
| 更新索引 | `agent-ide index --update` |
| 搜尋程式碼 | `agent-ide search "pattern" --format json` |
| 重新命名 | `agent-ide rename --from A --to B` |
| 移動檔案 | `agent-ide move old.ts new.ts` |
| 依賴分析 | `agent-ide deps --check-cycles` |
| 影響分析 | `agent-ide deps --impact file.ts` |
| 複雜度分析 | `agent-ide analyze --type complexity` |

#### 6️⃣ 輸出格式範例

**JSON 格式**（推薦）：
```json
{
  "results": [
    {
      "file": "src/user.ts",
      "line": 10,
      "match": "export class User"
    }
  ]
}
```

**Minimal 格式**（最省 token）：
```
src/user.ts:10: export class User
```

#### 7️⃣ 錯誤處理

如果命令失敗，檢查：
1. 索引是否已建立：`agent-ide index`
2. 路徑是否正確：使用絕對路徑
3. 語法是否正確：查看 `agent-ide --help`

---

## 🔌 程式化 API 使用

Agent IDE 也可以在你的程式碼中使用：

```typescript
import { AgentIdeMCP } from 'agent-ide';

const mcp = new AgentIdeMCP();

// 獲取所有可用工具
const tools = mcp.getTools();

// 執行工具
const result = await mcp.executeTool('code_index', {
  action: 'create',
  path: '/path/to/project'
});

if (result.success) {
  console.log('索引成功:', result.data);
}
```

### API 文件

完整的 MCP 工具參數和使用方式，請參考 [MCP_SETUP.md](./MCP_SETUP.md)

---

## 📚 MCP 工具快速參考

| 工具 | 功能 | 主要參數 |
|------|------|----------|
| `code_index` | 程式碼索引 | `action`, `path`, `query` |
| `code_search` | 程式碼搜尋 | `query`, `mode`, `limit` |
| `code_rename` | 重新命名 | `file`, `line`, `column`, `newName` |
| `code_move` | 檔案移動 | `source`, `destination` |
| `code_analyze` | 程式碼分析 | `path`, `type` |
| `code_deps` | 依賴分析 | `path` |
| `parser_plugins` | Parser 管理 | `action`, `plugin` |

### 工作流程範例

```typescript
const mcp = new AgentIdeMCP();

// 1. 建立索引
await mcp.executeTool('code_index', {
  action: 'create',
  path: projectPath
});

// 2. 搜尋符號
const searchResult = await mcp.executeTool('code_search', {
  query: 'UserService',
  path: projectPath
});

// 3. 分析依賴
await mcp.executeTool('code_deps', {
  path: projectPath
});

// 4. 重新命名（預覽）
const renameResult = await mcp.executeTool('code_rename', {
  file: filePath,
  line: 10,
  column: 14,
  newName: 'CustomerService',
  preview: true
});

// 5. 執行重新命名
if (renameResult.success) {
  await mcp.executeTool('code_rename', {
    file: filePath,
    line: 10,
    column: 14,
    newName: 'CustomerService',
    preview: false
  });
}
```

📖 詳細的工具參數和範例，請參考 [CLAUDE_CODE_INTEGRATION.md](./CLAUDE_CODE_INTEGRATION.md)

## 📊 效能基準

在典型的 TypeScript 專案中：

- **索引速度**：~1000 檔案/秒
- **搜尋響應**：<50ms（已索引檔案）
- **重新命名**：<200ms（中等複雜度）
- **記憶體使用**：~100MB（10,000 檔案專案）

## 🤝 貢獻指南

1. Fork 專案
2. 建立功能分支：`git checkout -b feature/amazing-feature`
3. 提交變更：`git commit -m 'Add amazing feature'`
4. 推送到分支：`git push origin feature/amazing-feature`
5. 建立 Pull Request

### 開發環境設定

```bash
# 複製專案
git clone https://github.com/vivalalova/agent-ide.git
cd agent-ide

# 安裝依賴
pnpm install

# 執行開發模式
pnpm run dev

# 執行測試
pnpm test
```

## 🐛 疑難排解

### 常見問題

**Q: 索引速度很慢**
A: 檢查是否有大量檔案被包含，考慮調整 `exclude` 設定

**Q: 搜尋結果不準確**
A: 確保索引是最新的，執行 `agent-ide index --update`

**Q: 重新命名後有錯誤**
A: 使用 `--dry-run` 預覽變更，或啟用 `safeMode`

**Q: 記憶體使用過高**
A: 調整快取設定或限制索引深度

### 取得支援

- 🐛 回報 [問題](https://github.com/vivalalova/agent-ide/issues)
- 💬 加入 [討論](https://github.com/vivalalova/agent-ide/discussions)

## 📄 授權

本專案採用 [MIT 授權條款](LICENSE)。

## 🙏 致謝

- TypeScript 團隊提供優秀的編譯器 API
- 所有貢獻者的寶貴貢獻
- 開源社群的持續支持

---

**讓 AI 代理更聰明地理解和操作程式碼** 🤖✨