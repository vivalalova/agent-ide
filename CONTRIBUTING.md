# 開發者指南

## 歡迎貢獻

感謝您對 Agent IDE 專案的興趣！這份指南將幫助您開始貢獻程式碼、回報問題或改進文件。

## 🚀 開始之前

### 必備條件

- Node.js 20 或更高版本
- pnpm 8 或更高版本
- Git
- 熟悉 TypeScript 和測試驅動開發 (TDD)

### 開發環境設定

```bash
# 1. Fork 並複製專案
git clone https://github.com/your-username/agent-ide.git
cd agent-ide

# 2. 安裝依賴
pnpm install

# 3. 執行測試確保環境正常
pnpm test

# 4. 建置專案
pnpm build

# 5. 測試 CLI 功能
node dist/interfaces/cli/index.js --help
```

## 📋 專案架構

### 目錄結構

```
src/
├── core/                   # 核心業務邏輯
│   ├── indexing/          # 程式碼索引
│   ├── rename/            # 重新命名功能
│   ├── move/              # 檔案移動功能
│   ├── dependency/        # 依賴分析
│   ├── search/            # 程式碼搜尋
│   ├── analysis/          # 程式碼分析
│   └── refactor/          # 重構功能
├── infrastructure/        # 基礎設施層
│   ├── parser/            # Parser 框架
│   ├── cache/             # 快取管理
│   ├── storage/           # 儲存抽象
│   └── utils/             # 工具函式
├── plugins/               # 語言 Parser 插件
│   ├── typescript/        # TypeScript 支援
│   ├── javascript/        # JavaScript 支援
│   └── swift/             # Swift 支援
├── application/           # 應用服務層
├── interfaces/            # 介面層
│   ├── cli/               # CLI 介面
│   └── mcp/               # MCP 介面
└── shared/                # 共享模組
    ├── types/             # 型別定義
    ├── constants/         # 常數
    └── errors/            # 錯誤類別
```

### 核心模組說明

#### 1. Indexing 模組
負責建立和管理程式碼索引，包括：
- 檔案索引
- 符號索引
- 依賴關係索引
- 增量更新

#### 2. Parser 系統
可插拔的語言解析器系統：
- 統一的 Parser 介面
- 動態載入機制
- 語言特定實作

#### 3. Search 模組
多種搜尋策略：
- 文字搜尋
- 正則表達式搜尋
- AST 語義搜尋
- 模糊搜尋

## 🧪 測試驅動開發 (TDD)

我們採用嚴格的 TDD 開發流程：

### TDD 週期

1. **紅燈 (Red)**：先寫測試，確保測試失敗
2. **綠燈 (Green)**：寫最少的程式碼讓測試通過
3. **重構 (Refactor)**：改善程式碼結構，保持測試通過

### 測試結構

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('ModuleName', () => {
  let instance: ModuleName;

  beforeEach(() => {
    instance = new ModuleName();
  });

  describe('功能描述', () => {
    it('應該在特定條件下產生預期結果', async () => {
      // Arrange - 準備測試資料
      const input = createTestInput();
      
      // Act - 執行被測試的操作
      const result = await instance.method(input);
      
      // Assert - 驗證結果
      expect(result).toBeDefined();
      expect(result.property).toBe(expectedValue);
    });
  });
});
```

### 測試命名規範

- 測試檔案：`*.test.ts`
- 測試描述使用繁體中文
- 遵循 AAA 模式 (Arrange, Act, Assert)

### 測試覆蓋率要求

- **最低覆蓋率**：80%
- **核心模組**：95%
- **新功能**：100%

```bash
# 執行測試並查看覆蓋率
pnpm test --coverage
```

## 🔧 程式碼規範

### TypeScript 規範

```typescript
// ✅ 好的實踐
interface UserConfig {
  readonly name: string;
  readonly age: number;
  readonly isActive: boolean;
}

class UserService {
  private readonly config: UserConfig;

  constructor(config: UserConfig) {
    this.config = config;
  }

  async getUser(id: string): Promise<User | null> {
    if (!id.trim()) {
      throw new InvalidUserIdError('User ID cannot be empty');
    }
    
    return this.userRepository.findById(id);
  }
}

// ❌ 避免的實踐
class BadUserService {
  private config: any; // 避免使用 any

  getUser(id) { // 缺少型別註解
    if (!id) return null; // 避免返回 null，應該拋出錯誤
  }
}
```

### 錯誤處理

```typescript
// 使用自定義錯誤類別
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly position?: Position
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

// 在業務邏輯中拋出具體錯誤
if (!isValidIdentifier(newName)) {
  throw new InvalidIdentifierError(
    `Invalid identifier: ${newName}`,
    newName
  );
}
```

### 命名規範

- **檔案**：kebab-case (`user-service.ts`)
- **類別**：PascalCase (`UserService`)
- **函式/變數**：camelCase (`getUserById`)
- **常數**：SCREAMING_SNAKE_CASE (`MAX_RETRIES`)
- **型別/介面**：PascalCase (`UserConfig`)

## 🔌 Plugin 開發

### 建立新的 Parser Plugin

1. **建立插件目錄**

```bash
mkdir src/plugins/your-language
cd src/plugins/your-language
```

2. **實作 Parser 介面**

```typescript
import { ParserPlugin } from '../../infrastructure/parser/interface.js';

export class YourLanguageParser implements ParserPlugin {
  readonly name = 'your-language';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.your-ext'];
  readonly supportedLanguages = ['your-language'];

  async parse(code: string, filePath: string): Promise<AST> {
    // 實作語法解析
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    // 實作符號提取
  }

  async extractDependencies(ast: AST): Promise<Dependency[]> {
    // 實作依賴提取
  }

  async rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    // 實作重新命名
  }

  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    // 實作查找引用
  }

  async findDefinition(ast: AST, position: Position): Promise<Definition | null> {
    // 實作查找定義
  }

  async findUsages(ast: AST, symbol: Symbol): Promise<Usage[]> {
    // 實作查找使用
  }

  async validate(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async dispose(): Promise<void> {
    // 清理資源
  }
}
```

3. **撰寫測試**

```typescript
// tests/plugins/your-language/parser.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { YourLanguageParser } from '../../../src/plugins/your-language/parser.js';

describe('YourLanguageParser', () => {
  let parser: YourLanguageParser;

  beforeEach(() => {
    parser = new YourLanguageParser();
  });

  describe('基本解析功能', () => {
    it('應該能解析簡單的程式碼', async () => {
      const code = 'your sample code here';
      const ast = await parser.parse(code, 'test.your-ext');
      
      expect(ast).toBeDefined();
      expect(ast.type).toBe('Program');
    });
  });
});
```

4. **註冊插件**

```typescript
// src/plugins/your-language/index.ts
export { YourLanguageParser } from './parser.js';

// 在 CLI 或 MCP 介面中註冊
import { ParserRegistry } from '../infrastructure/parser/registry.js';
import { YourLanguageParser } from '../plugins/your-language/index.js';

const registry = ParserRegistry.getInstance();
registry.register(new YourLanguageParser());
```

### Plugin 測試要求

- 基本解析功能測試
- 符號提取測試
- 重新命名功能測試
- 錯誤處理測試
- 效能測試

## 🚢 提交流程

### 分支策略

- `main`：穩定版本
- `develop`：開發分支
- `feature/feature-name`：功能分支
- `bugfix/issue-number`：錯誤修復分支

### Commit 訊息格式

```
<type>(<scope>): <description>

<body>

<footer>
```

類型：
- `feat`: 新功能
- `fix`: 錯誤修復
- `docs`: 文件變更
- `style`: 程式碼格式變更
- `refactor`: 重構
- `test`: 測試相關
- `chore`: 建置工具或依賴更新

範例：
```
feat(search): 新增模糊搜尋功能

實作基於 Levenshtein 距離的模糊搜尋算法，
支援容錯搜尋和自動完成建議。

Closes #123
```

### Pull Request 檢查清單

- [ ] 所有測試通過
- [ ] 新功能有對應測試
- [ ] 程式碼符合專案規範
- [ ] 文件已更新
- [ ] 無 lint 錯誤
- [ ] 型別檢查通過
- [ ] 效能測試通過

### Code Review 指南

#### 作為 Author

- 確保 PR 描述清楚
- 自我檢查程式碼
- 回應所有評論
- 保持 PR 大小適中

#### 作為 Reviewer

- 檢查功能正確性
- 驗證測試覆蓋率
- 確認程式碼風格一致
- 提供建設性意見

## 🐛 問題回報

### Bug Report 模板

```markdown
## 問題描述
簡潔描述遇到的問題

## 重現步驟
1. 第一步
2. 第二步
3. 觀察到的問題

## 預期行為
描述預期應該發生什麼

## 實際行為
描述實際發生什麼

## 環境資訊
- OS: [e.g. macOS 14.0]
- Node.js: [e.g. 20.0.0]
- Agent IDE: [e.g. 1.0.0]

## 附加資訊
任何其他相關資訊、錯誤訊息、螢幕截圖等
```

### Feature Request 模板

```markdown
## 功能描述
清楚描述建議的功能

## 使用情境
描述這個功能解決什麼問題

## 建議的解決方案
描述您希望的實作方式

## 替代方案
描述其他可能的解決方案

## 附加內容
任何其他相關資訊
```

## 📊 效能考量

### 效能目標

- **索引建立**：< 1000 檔案/秒
- **搜尋回應**：< 50ms
- **重新命名**：< 200ms
- **記憶體使用**：< 100MB (10,000 檔案專案)

### 效能測試

```typescript
describe('效能測試', () => {
  it('搜尋效能應該符合要求', async () => {
    const startTime = Date.now();
    
    const result = await searchEngine.search({
      query: 'function',
      paths: ['/large/project']
    });
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(50);
  });
});
```

### 效能優化策略

1. **索引優化**
   - 增量更新
   - 智能快取
   - 並行處理

2. **記憶體管理**
   - LRU 快取
   - 物件池
   - 垃圾回收優化

3. **I/O 優化**
   - 批次檔案操作
   - 非同步處理
   - 壓縮傳輸

## 🛠️ 開發工具

### VS Code 設定

建議的 VS Code 設定：

```json
{
  "typescript.preferences.quoteStyle": "single",
  "editor.formatOnSave": false,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": [
    "typescript",
    "javascript"
  ]
}
```

### 有用的指令

```bash
# 開發模式（監看檔案變更）
pnpm dev

# 執行特定測試
pnpm test -- tests/core/search

# 監看測試
pnpm test:watch

# 型別檢查
pnpm typecheck

# Lint 檢查
pnpm lint

# 修復 Lint 錯誤
pnpm lint:fix

# 建置專案
pnpm build

# 清理建置檔案
pnpm clean
```

## 📖 資源連結

- [TypeScript 官方文件](https://www.typescriptlang.org/docs/)
- [Vitest 測試框架](https://vitest.dev/)
- [ESLint 規則配置](https://eslint.org/docs/rules/)
- [專案 GitHub Repository](https://github.com/your-org/agent-ide)

## 🤝 社群

- **GitHub Discussions**: 功能討論和問答
- **GitHub Issues**: Bug 回報和功能請求
- **Pull Requests**: 程式碼貢獻

## 📄 授權

本專案採用 MIT 授權條款。貢獻程式碼即表示您同意將您的貢獻以相同授權條款釋出。

---

**感謝您的貢獻！** 🙏

如果您有任何問題或需要協助，請不要猶豫在 GitHub Issues 中提問。