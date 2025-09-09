# Agent IDE 專案規範

## 專案概述

Agent IDE 是一個為 AI 代理（如 Claude Code CLI）設計的程式碼智能工具集，提供高效的程式碼操作和分析功能。

### 核心目標
- 最小化 token 使用量
- 最大化操作準確性
- 提供統一的 CLI 和 MCP 介面
- 高度模組化的架構設計

## 核心功能模組

### 1. Indexing 模組
- **目的**：建立程式碼索引，減少 token 消耗
- **功能**：
  - 建立檔案結構索引
  - 建立符號索引（函式、類別、變數）
  - 建立依賴關係圖
  - 增量更新索引
  - 索引查詢優化

### 2. Rename 模組
- **目的**：智能重新命名程式碼元素
- **功能**：
  - 檔案重新命名
  - 變數/函式/類別重新命名
  - 型別定義重新命名
  - 自動更新所有引用
  - 支援跨檔案重新命名

### 3. Move 模組
- **目的**：智能移動檔案和程式碼元素
- **功能**：
  - 檔案移動
  - 目錄結構重組
  - 自動更新 import 路徑
  - 保持相對路徑正確性

### 4. 依賴分析模組
- **目的**：分析程式碼依賴關係
- **功能**：
  - 建立依賴關係圖
  - 找出循環依賴
  - 分析影響範圍
  - 優化 import 結構

### 5. 搜尋模組
- **目的**：高效的程式碼搜尋
- **功能**：
  - 語義搜尋
  - 正則表達式搜尋
  - AST 基礎搜尋
  - 搜尋結果排序優化

### 6. 程式碼分析模組
- **目的**：深度程式碼分析
- **功能**：
  - 複雜度分析
  - 程式碼品質評估
  - 死代碼檢測
  - 重複程式碼檢測

### 7. 重構模組
- **目的**：自動化重構操作
- **功能**：
  - 提取函式/方法
  - 提取變數
  - 內聯變數/函式
  - 安全刪除未使用程式碼

## 架構設計

### 層級架構
```
┌─────────────────────────────────────┐
│         介面層 (CLI / MCP)          │
├─────────────────────────────────────┤
│         應用服務層                   │
├─────────────────────────────────────┤
│         核心業務層                   │
├─────────────────────────────────────┤
│         基礎設施層                   │
└─────────────────────────────────────┘
```

### 目錄結構
```
agent-ide/
├── src/
│   ├── core/           # 核心業務邏輯
│   │   ├── indexing/
│   │   ├── rename/
│   │   ├── move/
│   │   ├── dependency/
│   │   ├── search/
│   │   ├── analysis/
│   │   └── refactor/
│   ├── infrastructure/ # 基礎設施
│   │   ├── parser/     # Parser 核心框架
│   │   │   ├── registry.ts    # Parser 註冊中心
│   │   │   ├── interface.ts   # Parser 介面定義
│   │   │   └── factory.ts     # Parser 工廠
│   │   ├── cache/      # 快取管理
│   │   ├── storage/    # 儲存管理
│   │   └── utils/      # 工具函式
│   ├── plugins/        # 語言 Parser 插件
│   │   ├── typescript/
│   │   ├── javascript/
│   │   ├── swift/
│   │   └── plugin-template/ # 插件開發模板
│   ├── application/    # 應用服務
│   │   ├── services/
│   │   └── dto/
│   ├── interfaces/     # 介面層
│   │   ├── cli/
│   │   └── mcp/
│   └── shared/        # 共享模組
│       ├── types/
│       ├── constants/
│       └── errors/
├── tests/             # 測試檔案
├── docs/              # 文件
├── plugins-external/  # 外部插件目錄
└── scripts/           # 腳本工具
```

## 開發規範

### TDD 開發流程
1. **紅燈階段**：先寫測試，確保測試失敗
2. **綠燈階段**：寫最少的程式碼讓測試通過
3. **重構階段**：優化程式碼結構，保持測試通過
4. **文件階段**：更新相關文件和註解

### 測試策略
- **單元測試**：每個函式/方法都要有對應測試
- **整合測試**：模組間互動的測試
- **端到端測試**：CLI 和 MCP 介面的完整流程測試
- **效能測試**：確保 token 使用量和執行速度符合預期
- **覆蓋率要求**：最低 80%，核心模組要求 95%

### 程式碼品質標準
- 使用 TypeScript strict mode
- 所有公開 API 必須有型別定義
- 錯誤處理使用自定義錯誤類別
- 禁止使用 any 型別（除非有充分理由）
- 函式單一職責原則
- 類別高內聚低耦合

### 模組化原則
- **單一職責**：每個模組只負責一項功能
- **依賴倒置**：高層模組不依賴低層模組
- **介面隔離**：使用介面定義模組間通訊
- **開放封閉**：對擴展開放，對修改封閉
- **最小知識**：模組只知道必要的資訊

## 技術選型

### 核心技術
- **語言**：TypeScript
- **執行環境**：Node.js 20+
- **套件管理**：pnpm
- **測試框架**：Vitest
- **Parser 架構**：可插拔的 Parser 插件系統
- **內建 Parser 插件**：
  - TypeScript: typescript compiler API
  - JavaScript: @babel/parser
  - Swift: tree-sitter-swift

### 開發工具
- **程式碼檢查**：ESLint + TypeScript ESLint
- **格式化**：由 ESLint 處理（不使用 Prettier）
- **Git Hooks**：husky + lint-staged
- **文件生成**：TypeDoc

## CLI 介面設計

### 命令結構
```bash
agent-ide <command> [options]

Commands:
  index     建立或更新程式碼索引
  rename    重新命名程式碼元素
  move      移動檔案或目錄
  search    搜尋程式碼
  analyze   分析程式碼品質
  refactor  執行重構操作
  deps      分析依賴關係
  plugins   管理 Parser 插件
```

### 範例使用
```bash
# 建立索引
agent-ide index --path ./src --update

# 重新命名
agent-ide rename --type variable --from oldName --to newName --path ./src

# 移動檔案
agent-ide move --from ./src/old.ts --to ./src/new/location.ts

# 搜尋程式碼
agent-ide search --pattern "function.*test" --type regex

# 管理插件
agent-ide plugins list
agent-ide plugins install typescript-advanced
agent-ide plugins enable swift
agent-ide plugins disable javascript
```

## MCP 介面設計

### 工具定義
```typescript
interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}
```

### 提供的 MCP 工具
1. `code_index` - 建立和查詢程式碼索引
2. `code_rename` - 執行重新命名操作
3. `code_move` - 執行移動操作
4. `code_search` - 執行程式碼搜尋
5. `code_analyze` - 執行程式碼分析
6. `code_refactor` - 執行重構操作
7. `code_deps` - 分析依賴關係
8. `parser_plugins` - 管理 Parser 插件

## 效能優化策略

### Token 優化
- 使用索引避免重複讀取
- 智能快取機制
- 增量更新而非全量掃描
- 壓縮輸出格式
- 使用摘要代替完整內容

### 執行效能
- 並行處理檔案操作
- 使用 Worker Threads 處理 CPU 密集任務
- 懶載入模組
- 記憶體池管理
- 批次處理操作

## 擴展功能規劃

### 第二階段功能
- **程式碼生成**：基於模板生成程式碼
- **程式碼轉換**：語言間的程式碼轉換
- **智能補全**：基於上下文的程式碼補全
- **程式碼審查**：自動化程式碼審查

### 第三階段功能
- **協作功能**：多 agent 協作支援
- **版本控制整合**：Git 操作整合
- **IDE 插件**：VSCode/IntelliJ 插件
- **雲端同步**：索引和設定同步

## 開發指南

## Parser 插件系統設計

### Parser 插件介面
```typescript
interface ParserPlugin {
  // 基本資訊
  readonly name: string;
  readonly version: string;
  readonly supportedExtensions: readonly string[];
  readonly supportedLanguages: readonly string[];
  
  // 核心功能
  parse(code: string, filePath: string): Promise<AST>;
  extractSymbols(ast: AST): Promise<Symbol[]>;
  findReferences(ast: AST, symbol: Symbol): Promise<Reference[]>;
  extractDependencies(ast: AST): Promise<Dependency[]>;
  
  // 重構支援
  rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]>;
  extractFunction(ast: AST, selection: Range): Promise<CodeEdit[]>;
  
  // 查詢支援
  findDefinition(ast: AST, position: Position): Promise<Definition | null>;
  findUsages(ast: AST, symbol: Symbol): Promise<Usage[]>;
  
  // 驗證和清理
  validate(): Promise<ValidationResult>;
  dispose(): Promise<void>;
}

interface AST {
  readonly type: string;
  readonly root: ASTNode;
  readonly sourceFile: string;
  readonly metadata: ASTMetadata;
}

interface Symbol {
  readonly name: string;
  readonly type: SymbolType;
  readonly position: Position;
  readonly scope: Scope;
  readonly modifiers: readonly string[];
}

interface Reference {
  readonly symbol: Symbol;
  readonly position: Position;
  readonly type: ReferenceType; // definition | usage | declaration
}

interface Dependency {
  readonly path: string;
  readonly type: DependencyType; // import | require | include
  readonly isRelative: boolean;
  readonly importedSymbols: readonly string[];
}
```

### Parser 註冊系統
```typescript
class ParserRegistry {
  private parsers = new Map<string, ParserPlugin>();
  private extensionMap = new Map<string, string[]>();
  
  register(plugin: ParserPlugin): void;
  unregister(pluginName: string): void;
  getParser(extension: string): ParserPlugin | null;
  getSupportedExtensions(): string[];
  listParsers(): ParserInfo[];
}
```

### 插件載入機制
- **動態載入**：runtime 動態發現和載入插件
- **配置驅動**：透過設定檔控制插件載入
- **版本管理**：支援插件版本相容性檢查
- **錯誤隔離**：插件錯誤不影響核心系統
- **熱重載**：開發時支援插件熱重載

### 插件開發規範
- **標準化介面**：所有插件必須實作 ParserPlugin 介面
- **錯誤處理**：插件內部錯誤必須適當捕獲和報告
- **效能要求**：解析速度和記憶體使用量標準
- **測試覆蓋**：插件必須包含完整測試套件
- **文件完整**：提供使用說明和 API 文件

### 插件發現機制
1. **內建插件**：`src/plugins/` 目錄下的插件
2. **外部插件**：`plugins-external/` 目錄下的插件
3. **npm 插件**：以 `agent-ide-parser-` 為前綴的 npm 套件
4. **全域插件**：系統全域安裝的插件

### 新增功能流程
1. 在 `docs/features/` 建立功能規格文件
2. 設計模組介面和 API
3. 編寫測試案例
4. 實作核心邏輯
5. 實作 CLI 介面
6. 實作 MCP 介面
7. 編寫整合測試
8. 更新文件
9. 效能測試和優化

### 新增 Parser 插件流程
1. 使用插件模板建立新插件專案
2. 實作 ParserPlugin 介面所有方法
3. 編寫插件測試套件（覆蓋率 > 80%）
4. 編寫插件文件和使用範例
5. 效能測試和記憶體洩漏檢查
6. 與核心系統整合測試
7. 發布到插件市集或 npm

### 插件管理命令
```bash
# 查看已安裝插件
agent-ide plugins list [--enabled] [--disabled]

# 安裝插件
agent-ide plugins install <plugin-name> [--version <version>]

# 啟用/停用插件
agent-ide plugins enable <plugin-name>
agent-ide plugins disable <plugin-name>

# 更新插件
agent-ide plugins update [plugin-name] [--all]

# 移除插件
agent-ide plugins uninstall <plugin-name>

# 插件資訊
agent-ide plugins info <plugin-name>

# 搜尋可用插件
agent-ide plugins search <keyword>
```

### 插件配置檔案
```json
{
  "parser": {
    "plugins": {
      "typescript": {
        "enabled": true,
        "version": "^1.0.0",
        "config": {
          "strictMode": true,
          "experimentalDecorators": true
        }
      },
      "swift": {
        "enabled": true,
        "version": "^1.0.0",
        "config": {
          "swiftVersion": "5.9",
          "enableAsyncAwait": true
        }
      }
    },
    "discovery": {
      "npm": true,
      "local": true,
      "global": false
    }
  }
}
```

### 程式碼審查檢查清單
- [ ] 測試覆蓋率達標
- [ ] 型別定義完整
- [ ] 錯誤處理適當
- [ ] 文件更新完成
- [ ] 無 lint 錯誤
- [ ] 效能測試通過
- [ ] CLI 和 MCP 介面一致
- [ ] Parser 插件相容性檢查
- [ ] 插件隔離性驗證

## 版本管理

### 版本號規則
- 主版本：不相容的 API 變更
- 次版本：新增功能（向後相容）
- 修訂版本：問題修復

### 發布流程
1. 更新 CHANGELOG.md
2. 執行完整測試套件
3. 建立發布分支
4. 更新版本號
5. 建立 Git tag
6. 發布到 npm

## 維護指南

### 日常維護
- 定期更新依賴
- 監控效能指標
- 處理 issue 和 PR
- 更新文件

### 緊急修復流程
1. 建立 hotfix 分支
2. 修復問題
3. 補充測試
4. 快速發布

## 社群參與

### 貢獻指南
- Fork 專案
- 建立功能分支
- 遵循程式碼規範
- 提交 PR
- 等待審查

### 問題回報
- 使用 GitHub Issues
- 提供重現步驟
- 附上錯誤訊息
- 說明預期行為

## 授權資訊

本專案採用 MIT 授權條款。

---

**注意事項**：
- 本文件為活文件，會隨專案發展持續更新
- 所有開發者都應熟悉本文件內容
- 重大變更需經過團隊討論