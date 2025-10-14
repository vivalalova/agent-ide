# 貢獻指南

感謝對 Agent IDE 的興趣！

## 快速開始

```bash
# 環境需求：Node.js 20+、pnpm 8+、Git

# 1. Fork 並複製
git clone https://github.com/your-username/agent-ide.git
cd agent-ide

# 2. 安裝、測試、建置
pnpm install
pnpm test
pnpm build

# 3. 驗證 CLI
node dist/interfaces/cli/index.js --help
```

## 專案架構

```
src/
├── core/           # 7個核心模組（indexing, search, rename, move, refactor, analysis, dependency）
├── infrastructure/ # parser, cache, storage, utils
├── plugins/        # TypeScript, JavaScript
├── application/    # 服務協調層
├── interfaces/     # CLI, MCP
└── shared/         # types, constants, errors

tests/              # 鏡像 src/ 結構
```

## TDD 開發流程

**紅燈 → 綠燈 → 重構**

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

      // Act - 執行操作
      const result = await instance.method(input);

      // Assert - 驗證結果
      expect(result).toBeDefined();
      expect(result.property).toBe(expectedValue);
    });
  });
});
```

**測試要求**：
- 檔名：`*.test.ts`
- 描述：繁體中文、AAA 模式
- 覆蓋率：整體 ≥80%、core/ ≥95%、新功能 100%

```bash
pnpm test --coverage  # 查看覆蓋率
```

## 程式規範

### TypeScript

```typescript
// ✅ 好的實踐
interface UserConfig {
  readonly name: string;
  readonly age: number;
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

// ❌ 避免
class BadService {
  private config: any;  // 避免 any
  getUser(id) { ... }   // 缺少型別
}
```

### 錯誤處理

```typescript
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

// 拋出具體錯誤
if (!isValidIdentifier(newName)) {
  throw new InvalidIdentifierError(`Invalid identifier: ${newName}`, newName);
}
```

### 命名規範

- 檔案：kebab-case (`user-service.ts`)
- 類別/介面：PascalCase (`UserService`)
- 函式/變數：camelCase (`getUserById`)
- 常數：SCREAMING_SNAKE_CASE (`MAX_RETRIES`)

## Parser 插件開發

```typescript
// 1. 實作 ParserPlugin 介面
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

  // ... 其他必要方法
}

// 2. 撰寫測試
describe('YourLanguageParser', () => {
  it('應該能解析簡單的程式碼', async () => {
    const code = 'your sample code';
    const ast = await parser.parse(code, 'test.your-ext');
    expect(ast).toBeDefined();
  });
});

// 3. 註冊插件
const registry = ParserRegistry.getInstance();
registry.register(new YourLanguageParser());
```

## 提交流程

### 分支策略

- `main`：穩定版本
- `feature/feature-name`：功能分支
- `bugfix/issue-number`：錯誤修復分支

### Commit 格式

```
<type>: <description>

<body>

<footer>
```

**類型**：`feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

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

## 常用指令

```bash
pnpm test              # 執行測試
pnpm test:watch        # 監看模式
pnpm test:single       # 單分支隔離測試
pnpm typecheck         # 型別檢查
pnpm lint              # Lint 檢查
pnpm build             # 建置專案
```

## 效能要求

- 索引建立：< 1000 檔案/秒
- 搜尋回應：< 50ms
- 重新命名：< 200ms
- 記憶體使用：< 100MB (10,000 檔案專案)

## 問題回報

### Bug Report

```markdown
## 問題描述
簡潔描述問題

## 重現步驟
1. 第一步
2. 第二步
3. 觀察到的問題

## 預期/實際行為
描述預期與實際發生的差異

## 環境
- OS: macOS 14.0
- Node.js: 20.0.0
- Agent IDE: 1.0.0
```

### Feature Request

```markdown
## 功能描述
清楚描述建議的功能

## 使用情境
描述這個功能解決什麼問題

## 建議的解決方案
描述希望的實作方式
```

## 資源

- [TypeScript 文件](https://www.typescriptlang.org/docs/)
- [Vitest 測試框架](https://vitest.dev/)
- [GitHub Repository](https://github.com/vivalalova/agent-ide)

## 社群

- GitHub Discussions：功能討論
- GitHub Issues：Bug 回報和功能請求
- Pull Requests：程式碼貢獻

## 授權

MIT License - 貢獻程式碼即表示您同意將您的貢獻以相同授權條款釋出。

---

**感謝您的貢獻！** 🙏

如有問題請在 GitHub Issues 中提問。
