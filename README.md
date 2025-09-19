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

## 📦 安裝

```bash
# 使用 npm
npm install -g agent-ide

# 使用 pnpm
pnpm add -g agent-ide
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
git clone https://github.com/your-org/agent-ide.git
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

- 📄 查看 [文件](https://docs.agent-ide.dev)
- 🐛 回報 [問題](https://github.com/your-org/agent-ide/issues)
- 💬 加入 [討論](https://github.com/your-org/agent-ide/discussions)

## 📄 授權

本專案採用 [MIT 授權條款](LICENSE)。

## 🙏 致謝

- TypeScript 團隊提供優秀的編譯器 API
- 所有貢獻者的寶貴貢獻
- 開源社群的持續支持

---

**讓 AI 代理更聰明地理解和操作程式碼** 🤖✨