# Agent IDE 測試規範指南

## 概述

本文件定義 Agent IDE 專案的完整測試規範，確保程式碼品質、功能正確性和系統穩定性。所有測試必須遵循 TDD 開發流程和繁體中文描述規範。

## 1. 測試組織結構規範

### 1.1 目錄結構

```
tests/
├── unit/                    # 單元測試
│   ├── core/               # 核心業務邏輯測試
│   │   ├── indexing/
│   │   ├── rename/
│   │   ├── move/
│   │   ├── dependency/
│   │   ├── search/
│   │   ├── analysis/
│   │   └── refactor/
│   ├── infrastructure/     # 基礎設施測試
│   │   ├── parser/
│   │   ├── cache/
│   │   ├── storage/
│   │   └── utils/
│   ├── plugins/           # Parser 插件測試
│   │   ├── typescript/
│   │   ├── javascript/
│   │   └── swift/
│   └── shared/            # 共享模組測試
├── integration/           # 整合測試
│   ├── core-modules/      # 模組間互動測試
│   ├── parser-plugins/    # Parser 插件整合測試
│   └── services/          # 應用服務整合測試
├── e2e/                   # 端到端測試
│   ├── cli/               # CLI 介面測試
│   └── mcp/               # MCP 介面測試
├── performance/           # 效能測試
├── fixtures/              # 測試固定資料
│   ├── code-samples/      # 程式碼範例
│   ├── ast-snapshots/     # AST 快照
│   └── mock-data/         # 模擬資料
└── helpers/               # 測試輔助工具
    ├── test-utils.ts      # 測試工具函式
    ├── mock-factories.ts  # Mock 工廠
    └── assertions.ts      # 自定義斷言
```

### 1.2 檔案命名規則

- **單元測試**：`{source-file}.test.ts`
- **整合測試**：`{module-name}.integration.test.ts`
- **端到端測試**：`{feature-name}.e2e.test.ts`
- **效能測試**：`{feature-name}.performance.test.ts`
- **測試輔助檔案**：使用描述性名稱，如 `mock-parser.ts`

### 1.3 測試檔案與源碼對應關係

```typescript
// 源碼檔案
src/core/indexing/symbol-index.ts

// 對應測試檔案
tests/unit/core/indexing/symbol-index.test.ts

// 整合測試檔案
tests/integration/core-modules/indexing-with-parser.integration.test.ts
```

## 2. 測試寫作標準

### 2.1 BDD 風格結構

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';

describe('SymbolIndex - 符號索引管理', () => {
  describe('建立索引', () => {
    describe('當處理 TypeScript 檔案時', () => {
      test('應該正確提取函式符號', async () => {
        // Arrange - 準備階段
        const sourceCode = `
          function calculateSum(a: number, b: number): number {
            return a + b;
          }
        `;

        // Act - 執行階段
        const symbols = await symbolIndex.extractSymbols(sourceCode, 'test.ts');

        // Assert - 驗證階段
        expect(symbols).toHaveLength(1);
        expect(symbols[0]).toMatchObject({
          name: 'calculateSum',
          type: 'function',
          parameters: ['a', 'b'],
          returnType: 'number'
        });
      });

      test('應該正確處理類別和介面', async () => {
        // 測試實作
      });

      test('應該處理複雜的泛型定義', async () => {
        // 測試實作
      });
    });

    describe('當處理空檔案時', () => {
      test('應該回傳空的符號陣列', async () => {
        // 測試實作
      });
    });

    describe('當遇到語法錯誤時', () => {
      test('應該拋出 ParseError 錯誤', async () => {
        // 測試實作
      });
    });
  });

  describe('查詢索引', () => {
    // 查詢相關測試
  });

  describe('更新索引', () => {
    // 更新相關測試
  });
});
```

### 2.2 繁體中文測試描述規範

#### 2.2.1 describe 描述格式
- **模組級別**：`{模組名稱} - {模組功能描述}`
- **功能級別**：`{功能動作}` （如：建立索引、查詢符號、重新命名）
- **情境級別**：`當{條件}時` （如：當處理 TypeScript 檔案時、當遇到錯誤時）

#### 2.2.2 test 描述格式
- **正常情況**：`應該{預期行為}`
- **邊界情況**：`應該正確處理{特殊情況}`
- **錯誤情況**：`應該{錯誤處理行為}當{錯誤條件}時`

#### 2.2.3 描述範例
```typescript
describe('FileRenamer - 檔案重新命名功能', () => {
  describe('重新命名檔案', () => {
    describe('當重新命名 TypeScript 檔案時', () => {
      test('應該更新所有相關的 import 路徑', () => {});
      test('應該保持相對路徑的正確性', () => {});
      test('應該處理預設匯出和命名匯出', () => {});
    });

    describe('當目標檔案已存在時', () => {
      test('應該拋出 FileExistsError 錯誤', () => {});
    });

    describe('當原始檔案不存在時', () => {
      test('應該拋出 FileNotFoundError 錯誤', () => {});
    });
  });
});
```

### 2.3 測試案例分類

#### 2.3.1 正常流程測試 (Happy Path)
- 驗證基本功能正確性
- 確保典型使用場景運作正常
- 覆蓋主要業務邏輯路徑

#### 2.3.2 邊界條件測試 (Edge Cases)
- 空值和 null 處理
- 極大或極小數值
- 空字串、空陣列、空物件
- 檔案系統邊界（如超長路徑、特殊字符）

#### 2.3.3 錯誤處理測試 (Error Handling)
- 異常輸入處理
- 系統錯誤處理
- 網路錯誤處理
- 權限錯誤處理

## 3. 覆蓋率提升策略

### 3.1 測試層級劃分

#### 3.1.1 單元測試 (Unit Tests)
- **範圍**：單個函式、方法、類別
- **目標覆蓋率**：95% (核心模組)，80% (其他模組)
- **重點**：
  - 函式輸入輸出驗證
  - 邊界條件處理
  - 錯誤處理邏輯
  - 演算法正確性

```typescript
describe('DependencyAnalyzer - 依賴分析器', () => {
  describe('parseDependencies - 解析依賴關係', () => {
    test('應該正確解析 ES6 import 語法', () => {
      const code = `
        import { Component } from 'react';
        import * as utils from '../utils';
        import './styles.css';
      `;

      const dependencies = analyzer.parseDependencies(code);

      expect(dependencies).toEqual([
        { path: 'react', type: 'named', imports: ['Component'] },
        { path: '../utils', type: 'namespace', imports: ['*'] },
        { path: './styles.css', type: 'side-effect', imports: [] }
      ]);
    });
  });
});
```

#### 3.1.2 整合測試 (Integration Tests)
- **範圍**：模組間互動、外部依賴整合
- **目標覆蓋率**：80%
- **重點**：
  - 模組間資料傳遞
  - 外部 API 整合
  - 檔案系統操作
  - Parser 插件互動

```typescript
describe('IndexingService 與 Parser 整合', () => {
  test('應該能夠使用 TypeScript Parser 建立完整索引', async () => {
    const indexingService = new IndexingService();
    const typescriptParser = new TypeScriptParser();

    await indexingService.registerParser(typescriptParser);
    const index = await indexingService.buildIndex('./fixtures/typescript-project');

    expect(index.symbols).toHaveLength(25);
    expect(index.dependencies).toHaveLength(12);
  });
});
```

#### 3.1.3 端到端測試 (E2E Tests)
- **範圍**：完整使用者流程
- **目標覆蓋率**：主要使用場景 100%
- **重點**：
  - CLI 命令執行
  - MCP 工具呼叫
  - 檔案系統變更
  - 錯誤輸出格式

```typescript
describe('CLI - 重新命名功能端到端測試', () => {
  test('應該能夠透過 CLI 重新命名變數並更新所有引用', async () => {
    // 準備測試專案
    await setupTestProject('./fixtures/rename-test-project');

    // 執行 CLI 命令
    const result = await execCLI([
      'rename',
      '--type', 'variable',
      '--from', 'oldVariableName',
      '--to', 'newVariableName',
      '--path', './test-project'
    ]);

    // 驗證結果
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('成功重新命名 3 個檔案中的 5 處引用');

    // 驗證檔案變更
    const updatedFile = await readFile('./test-project/src/main.ts', 'utf-8');
    expect(updatedFile).toContain('newVariableName');
    expect(updatedFile).not.toContain('oldVariableName');
  });
});
```

### 3.2 核心模組 95% 覆蓋率達成方法

#### 3.2.1 程式碼覆蓋率類型
- **行覆蓋率 (Line Coverage)**：每行程式碼都被執行
- **分支覆蓋率 (Branch Coverage)**：所有條件分支都被測試
- **函式覆蓋率 (Function Coverage)**：所有函式都被呼叫
- **語句覆蓋率 (Statement Coverage)**：所有語句都被執行

#### 3.2.2 覆蓋率監控配置

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        // 全域最低要求
        global: {
          lines: 80,
          branches: 75,
          functions: 80,
          statements: 80
        },
        // 核心模組要求
        'src/core/**': {
          lines: 95,
          branches: 90,
          functions: 95,
          statements: 95
        },
        'src/infrastructure/parser/**': {
          lines: 95,
          branches: 90,
          functions: 95,
          statements: 95
        }
      },
      exclude: [
        'src/interfaces/cli/bin.ts', // CLI 入口點
        'src/**/*.types.ts',         // 型別定義檔案
        'src/**/*.constants.ts',     // 常數檔案
        'tests/**'                   // 測試檔案本身
      ]
    }
  }
});
```

#### 3.2.3 覆蓋率提升策略

1. **識別未覆蓋程式碼**
```bash
# 生成覆蓋率報告
npm run test:coverage

# 開啟 HTML 報告查看詳細資訊
open coverage/index.html
```

2. **補強測試案例**
```typescript
// 針對未覆蓋的錯誤處理分支
describe('錯誤處理', () => {
  test('應該處理檔案系統權限錯誤', async () => {
    // 模擬權限錯誤
    vi.spyOn(fs, 'readFile').mockRejectedValue(
      new Error('EACCES: permission denied')
    );

    await expect(symbolIndex.loadFromFile('/restricted/file.ts'))
      .rejects.toThrow('權限不足，無法讀取檔案');
  });
});
```

3. **參數化測試覆蓋多種情況**
```typescript
describe.each([
  { input: 'function', expected: 'function' },
  { input: 'class', expected: 'class' },
  { input: 'interface', expected: 'interface' },
  { input: 'type', expected: 'type' },
  { input: 'enum', expected: 'enum' }
])('符號類型處理', ({ input, expected }) => {
  test(`應該正確識別 ${input} 類型`, () => {
    const result = symbolClassifier.classify(input);
    expect(result).toBe(expected);
  });
});
```

### 3.3 邊界條件和異常情況測試

#### 3.3.1 輸入驗證測試
```typescript
describe('輸入驗證', () => {
  test.each([
    { input: null, description: 'null 值' },
    { input: undefined, description: 'undefined 值' },
    { input: '', description: '空字串' },
    { input: '   ', description: '空白字串' },
    { input: [], description: '空陣列' },
    { input: {}, description: '空物件' }
  ])('應該正確處理無效輸入：$description', ({ input }) => {
    expect(() => validator.validate(input))
      .toThrow('輸入值不能為空');
  });
});
```

#### 3.3.2 系統限制測試
```typescript
describe('系統限制處理', () => {
  test('應該處理超長檔案路徑', () => {
    const longPath = 'a'.repeat(1000) + '.ts';
    expect(() => pathValidator.validate(longPath))
      .toThrow('檔案路徑過長');
  });

  test('應該處理大型檔案', async () => {
    const largeContent = 'const x = 1;\n'.repeat(100000);
    const result = await parser.parse(largeContent, 'large.ts');
    expect(result.symbols).toBeDefined();
  });
});
```

## 4. 測試資料和 Mock 規範

### 4.1 測試資料管理策略

#### 4.1.1 固定資料 (Fixtures)
```typescript
// tests/fixtures/code-samples/typescript/basic-class.ts
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}

// tests/fixtures/ast-snapshots/typescript/basic-class.json
{
  "type": "SourceFile",
  "symbols": [
    {
      "name": "Calculator",
      "type": "class",
      "methods": [
        { "name": "add", "parameters": ["a", "b"], "returnType": "number" },
        { "name": "subtract", "parameters": ["a", "b"], "returnType": "number" }
      ]
    }
  ]
}
```

#### 4.1.2 測試資料工廠
```typescript
// tests/helpers/mock-factories.ts
export class TestDataFactory {
  static createSymbol(overrides: Partial<Symbol> = {}): Symbol {
    return {
      name: 'testSymbol',
      type: 'function',
      position: { line: 1, column: 0 },
      scope: 'global',
      modifiers: [],
      ...overrides
    };
  }

  static createAST(overrides: Partial<AST> = {}): AST {
    return {
      type: 'SourceFile',
      root: this.createASTNode(),
      sourceFile: 'test.ts',
      metadata: {
        language: 'typescript',
        version: '5.0'
      },
      ...overrides
    };
  }

  static createCodeProject(files: Record<string, string>): TestProject {
    return new TestProject(files);
  }
}

// 使用範例
test('應該正確處理多個符號', () => {
  const symbols = [
    TestDataFactory.createSymbol({ name: 'function1', type: 'function' }),
    TestDataFactory.createSymbol({ name: 'class1', type: 'class' }),
    TestDataFactory.createSymbol({ name: 'interface1', type: 'interface' })
  ];

  const index = new SymbolIndex(symbols);
  expect(index.size).toBe(3);
});
```

### 4.2 Mock 物件使用原則

#### 4.2.1 Mock 策略選擇

```typescript
// 1. 使用真實物件（優先選擇）
test('應該正確解析簡單函式', () => {
  const parser = new TypeScriptParser(); // 真實 Parser
  const result = parser.parse('function test() {}', 'test.ts');
  expect(result.symbols).toHaveLength(1);
});

// 2. 使用 Mock 物件（當真實物件有副作用時）
test('應該處理檔案讀取錯誤', () => {
  const mockFileReader = {
    readFile: vi.fn().mockRejectedValue(new Error('檔案不存在'))
  };

  const indexer = new FileIndexer(mockFileReader);
  expect(indexer.indexFile('missing.ts')).rejects.toThrow();
});

// 3. 部分 Mock（只 Mock 必要部分）
test('應該快取解析結果', () => {
  const parser = new TypeScriptParser();
  const mockCache = {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    clear: vi.fn()
  };

  parser.setCache(mockCache);
  parser.parse('function test() {}', 'test.ts');

  expect(mockCache.set).toHaveBeenCalledWith(
    expect.stringContaining('test.ts'),
    expect.any(Object)
  );
});
```

#### 4.2.2 Mock 實作規範

```typescript
// tests/helpers/mock-parser.ts
export class MockParser implements ParserPlugin {
  readonly name = 'mock-parser';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.mock'];
  readonly supportedLanguages = ['mock'];

  // 可控制的 Mock 行為
  private mockResults = new Map<string, any>();
  private shouldThrowError = false;
  private errorToThrow: Error | null = null;

  // 設定方法
  setParseResult(code: string, result: AST): void {
    this.mockResults.set(code, result);
  }

  setShouldThrowError(error: Error): void {
    this.shouldThrowError = true;
    this.errorToThrow = error;
  }

  // 介面實作
  async parse(code: string, filePath: string): Promise<AST> {
    if (this.shouldThrowError && this.errorToThrow) {
      throw this.errorToThrow;
    }

    return this.mockResults.get(code) || TestDataFactory.createAST();
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    return [TestDataFactory.createSymbol()];
  }

  // 其他介面方法...
}
```

### 4.3 測試環境隔離

#### 4.3.1 檔案系統隔離
```typescript
// tests/helpers/test-utils.ts
export class TestEnvironment {
  private tempDir: string;

  async setup(): Promise<void> {
    this.tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-ide-test-'));
  }

  async cleanup(): Promise<void> {
    if (this.tempDir) {
      await rm(this.tempDir, { recursive: true, force: true });
    }
  }

  createFile(relativePath: string, content: string): string {
    const fullPath = path.join(this.tempDir, relativePath);
    const dir = path.dirname(fullPath);

    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');

    return fullPath;
  }

  getTempDir(): string {
    return this.tempDir;
  }
}

// 使用範例
describe('檔案操作測試', () => {
  let testEnv: TestEnvironment;

  beforeEach(async () => {
    testEnv = new TestEnvironment();
    await testEnv.setup();
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  test('應該能夠重新命名檔案', async () => {
    const sourceFile = testEnv.createFile('src/old.ts', 'export const x = 1;');
    const renamer = new FileRenamer();

    await renamer.rename(sourceFile, 'src/new.ts');

    expect(existsSync(path.join(testEnv.getTempDir(), 'src/new.ts'))).toBe(true);
    expect(existsSync(sourceFile)).toBe(false);
  });
});
```

#### 4.3.2 快取和狀態隔離
```typescript
describe('快取功能測試', () => {
  let cache: Cache;

  beforeEach(() => {
    // 每個測試使用獨立的快取實例
    cache = new InMemoryCache();
  });

  afterEach(() => {
    // 清理快取狀態
    cache.clear();
  });

  test('應該正確快取解析結果', () => {
    const key = 'test.ts';
    const value = TestDataFactory.createAST();

    cache.set(key, value);

    expect(cache.get(key)).toEqual(value);
  });
});
```

## 5. 特殊測試需求

### 5.1 Parser 插件測試標準

#### 5.1.1 插件介面合規性測試
```typescript
// tests/helpers/parser-compliance.ts
export function testParserCompliance(plugin: ParserPlugin): void {
  describe(`${plugin.name} Parser 合規性測試`, () => {
    test('應該實作所有必要的介面方法', () => {
      expect(plugin.parse).toBeTypeOf('function');
      expect(plugin.extractSymbols).toBeTypeOf('function');
      expect(plugin.findReferences).toBeTypeOf('function');
      expect(plugin.extractDependencies).toBeTypeOf('function');
      // ... 其他必要方法
    });

    test('應該提供正確的元資料', () => {
      expect(plugin.name).toBeTruthy();
      expect(plugin.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(plugin.supportedExtensions).toBeInstanceOf(Array);
      expect(plugin.supportedLanguages).toBeInstanceOf(Array);
    });

    test('應該正確處理無效輸入', async () => {
      await expect(plugin.parse('', '')).rejects.toThrow();
      await expect(plugin.parse('invalid syntax', 'test.ext')).rejects.toThrow();
    });
  });
}

// 使用範例
import { TypeScriptParser } from '../../src/plugins/typescript/parser';

describe('TypeScript Parser', () => {
  const parser = new TypeScriptParser();

  // 執行合規性測試
  testParserCompliance(parser);

  // 特定於 TypeScript 的測試
  describe('TypeScript 特有功能', () => {
    test('應該正確解析泛型', async () => {
      const code = 'function identity<T>(arg: T): T { return arg; }';
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);

      expect(symbols[0]).toMatchObject({
        name: 'identity',
        type: 'function',
        generic: true,
        typeParameters: ['T']
      });
    });
  });
});
```

#### 5.1.2 插件效能測試
```typescript
describe('Parser 效能測試', () => {
  test('應該在合理時間內解析中型檔案', async () => {
    const mediumFile = readFileSync('./fixtures/medium-file.ts', 'utf-8'); // ~500 行
    const parser = new TypeScriptParser();

    const startTime = performance.now();
    await parser.parse(mediumFile, 'medium-file.ts');
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(1000); // 1 秒內完成
  });

  test('應該有合理的記憶體使用量', async () => {
    const largeFile = 'const x = 1;\n'.repeat(10000);
    const parser = new TypeScriptParser();

    const initialMemory = process.memoryUsage().heapUsed;
    await parser.parse(largeFile, 'large-file.ts');
    const finalMemory = process.memoryUsage().heapUsed;

    const memoryIncrease = finalMemory - initialMemory;
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB 以內
  });
});
```

### 5.2 CLI 介面測試方法

#### 5.2.1 CLI 命令測試框架
```typescript
// tests/helpers/cli-tester.ts
export class CLITester {
  private binPath: string;

  constructor(binPath = './dist/cli/bin.js') {
    this.binPath = binPath;
  }

  async exec(args: string[], options: ExecOptions = {}): Promise<CLIResult> {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [this.binPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...options.env },
        cwd: options.cwd || process.cwd()
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => stdout += data.toString());
      child.stderr.on('data', (data) => stderr += data.toString());

      child.on('close', (code) => {
        resolve({
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      child.on('error', reject);

      // 如果有輸入資料
      if (options.input) {
        child.stdin.write(options.input);
        child.stdin.end();
      }
    });
  }
}

interface CLIResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
```

#### 5.2.2 CLI 測試案例
```typescript
describe('CLI 介面測試', () => {
  let cli: CLITester;
  let testEnv: TestEnvironment;

  beforeEach(async () => {
    cli = new CLITester();
    testEnv = new TestEnvironment();
    await testEnv.setup();
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  describe('索引命令', () => {
    test('應該能夠建立專案索引', async () => {
      // 準備測試專案
      testEnv.createFile('src/main.ts', 'export function main() {}');
      testEnv.createFile('src/utils.ts', 'export const utils = {};');

      const result = await cli.exec([
        'index',
        '--path', testEnv.getTempDir(),
        '--output', 'json'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('"symbols":');
      expect(result.stdout).toContain('"main"');
      expect(result.stdout).toContain('"utils"');
    });

    test('應該顯示友善的錯誤訊息當路徑不存在時', async () => {
      const result = await cli.exec([
        'index',
        '--path', '/non/existent/path'
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('路徑不存在');
    });
  });

  describe('重新命名命令', () => {
    test('應該能夠重新命名變數', async () => {
      const sourceFile = testEnv.createFile('src/test.ts', `
        const oldName = 'value';
        console.log(oldName);
      `);

      const result = await cli.exec([
        'rename',
        '--type', 'variable',
        '--from', 'oldName',
        '--to', 'newName',
        '--file', sourceFile
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('成功重新命名');

      // 驗證檔案內容
      const content = readFileSync(sourceFile, 'utf-8');
      expect(content).toContain('newName');
      expect(content).not.toContain('oldName');
    });
  });

  describe('幫助資訊', () => {
    test('應該顯示主要幫助資訊', async () => {
      const result = await cli.exec(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Agent IDE');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('index');
      expect(result.stdout).toContain('rename');
    });
  });
});
```

### 5.3 MCP 介面測試規範

#### 5.3.1 MCP 工具測試框架
```typescript
// tests/helpers/mcp-tester.ts
export class MCPTester {
  private server: MCPServer;

  constructor() {
    this.server = new MCPServer();
  }

  async callTool(name: string, parameters: any): Promise<MCPResult> {
    try {
      const result = await this.server.callTool({
        name,
        parameters
      });

      return {
        success: true,
        data: result,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error as Error
      };
    }
  }

  getTools(): MCPTool[] {
    return this.server.listTools();
  }
}

interface MCPResult {
  success: boolean;
  data: any;
  error: Error | null;
}
```

#### 5.3.2 MCP 測試案例
```typescript
describe('MCP 介面測試', () => {
  let mcp: MCPTester;
  let testEnv: TestEnvironment;

  beforeEach(async () => {
    mcp = new MCPTester();
    testEnv = new TestEnvironment();
    await testEnv.setup();
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  describe('工具註冊', () => {
    test('應該註冊所有預期的 MCP 工具', () => {
      const tools = mcp.getTools();
      const toolNames = tools.map(t => t.name);

      expect(toolNames).toContain('code_index');
      expect(toolNames).toContain('code_rename');
      expect(toolNames).toContain('code_move');
      expect(toolNames).toContain('code_search');
      expect(toolNames).toContain('code_analyze');
      expect(toolNames).toContain('code_refactor');
    });
  });

  describe('code_index 工具', () => {
    test('應該能夠建立程式碼索引', async () => {
      testEnv.createFile('test.ts', 'export function test() {}');

      const result = await mcp.callTool('code_index', {
        path: testEnv.getTempDir(),
        update: false
      });

      expect(result.success).toBe(true);
      expect(result.data.symbols).toBeInstanceOf(Array);
      expect(result.data.symbols[0]).toMatchObject({
        name: 'test',
        type: 'function'
      });
    });

    test('應該處理無效路徑', async () => {
      const result = await mcp.callTool('code_index', {
        path: '/invalid/path'
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('路徑不存在');
    });
  });

  describe('參數驗證', () => {
    test('應該驗證必需參數', async () => {
      const result = await mcp.callTool('code_rename', {
        // 缺少必需的參數
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('缺少必需參數');
    });

    test('應該驗證參數型別', async () => {
      const result = await mcp.callTool('code_index', {
        path: 123, // 應該是字串
        update: 'true' // 應該是布林值
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('參數型別錯誤');
    });
  });
});
```

### 5.4 效能和記憶體測試

#### 5.4.1 效能基準測試
```typescript
// tests/performance/indexing.performance.test.ts
describe('索引效能測試', () => {
  const performanceThresholds = {
    smallProject: { files: 10, maxTime: 500 },    // 500ms
    mediumProject: { files: 100, maxTime: 2000 }, // 2s
    largeProject: { files: 1000, maxTime: 10000 } // 10s
  };

  test.each([
    ['小型專案', performanceThresholds.smallProject],
    ['中型專案', performanceThresholds.mediumProject],
    ['大型專案', performanceThresholds.largeProject]
  ])('應該在合理時間內完成 %s 索引', async (projectType, threshold) => {
    const testProject = await createTestProject(threshold.files);
    const indexer = new ProjectIndexer();

    const startTime = performance.now();
    await indexer.buildIndex(testProject.path);
    const endTime = performance.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(threshold.maxTime);
  });

  test('應該支援增量索引更新', async () => {
    const testProject = await createTestProject(100);
    const indexer = new ProjectIndexer();

    // 建立初始索引
    const fullIndexTime = await measureTime(() =>
      indexer.buildIndex(testProject.path)
    );

    // 修改一個檔案
    await testProject.updateFile('src/modified.ts', 'export const updated = true;');

    // 增量更新
    const incrementalUpdateTime = await measureTime(() =>
      indexer.updateIndex([testProject.getFilePath('src/modified.ts')])
    );

    // 增量更新應該比全量建立快很多
    expect(incrementalUpdateTime).toBeLessThan(fullIndexTime * 0.1);
  });
});
```

#### 5.4.2 記憶體使用測試
```typescript
describe('記憶體使用測試', () => {
  test('應該在處理大型檔案後釋放記憶體', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    const parser = new TypeScriptParser();

    // 處理多個大型檔案
    for (let i = 0; i < 10; i++) {
      const largeCode = generateLargeTypeScriptCode(10000); // 10k 行
      await parser.parse(largeCode, `large-${i}.ts`);
    }

    // 強制垃圾回收
    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    // 記憶體增長應該在合理範圍內
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // 100MB
  });

  test('應該正確處理記憶體洩漏', async () => {
    const samples: number[] = [];

    for (let i = 0; i < 50; i++) {
      const parser = new TypeScriptParser();
      await parser.parse('function test() {}', 'test.ts');
      await parser.dispose(); // 清理資源

      if (i % 10 === 0) {
        if (global.gc) global.gc();
        samples.push(process.memoryUsage().heapUsed);
      }
    }

    // 記憶體使用應該保持穩定，不持續增長
    const trend = calculateMemoryTrend(samples);
    expect(trend).toBeLessThan(1024 * 1024); // 每次測試增長不超過 1MB
  });
});
```

## 6. 測試執行和自動化

### 6.1 測試腳本配置

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "vitest run tests/e2e",
    "test:performance": "vitest run tests/performance",
    "test:parser": "vitest run tests/unit/plugins tests/integration/parser-plugins",
    "test:cli": "vitest run tests/e2e/cli",
    "test:mcp": "vitest run tests/e2e/mcp"
  }
}
```

### 6.2 持續整合配置

```yaml
# .github/workflows/test.yml
name: 測試

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: 設定 Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'pnpm'

    - name: 安裝依賴
      run: pnpm install

    - name: 執行單元測試
      run: pnpm test:unit

    - name: 執行整合測試
      run: pnpm test:integration

    - name: 執行端到端測試
      run: pnpm test:e2e

    - name: 生成覆蓋率報告
      run: pnpm test:coverage

    - name: 上傳覆蓋率報告
      uses: codecov/codecov-action@v3
```

### 6.3 測試品質門檻

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    // 測試必須在 60 秒內完成
    testTimeout: 60000,

    // 單個檔案測試超時時間
    fileTimeout: 30000,

    // 失敗時重試次數
    retry: 2,

    // 並行執行配置
    threads: true,
    maxConcurrency: 4,

    coverage: {
      // 覆蓋率門檻
      thresholds: {
        global: {
          lines: 80,
          branches: 75,
          functions: 80,
          statements: 80
        }
      },

      // 未達門檻時失敗
      thresholdAutoUpdate: false,

      // 覆蓋率報告格式
      reporter: ['text', 'html', 'lcov', 'json']
    }
  }
});
```

## 7. 測試維護和最佳實踐

### 7.1 測試程式碼品質標準

```typescript
// ✅ 好的測試案例
test('應該正確計算兩個數字的和', () => {
  // Arrange - 清楚的設定
  const calculator = new Calculator();
  const a = 5;
  const b = 3;

  // Act - 單一動作
  const result = calculator.add(a, b);

  // Assert - 明確的驗證
  expect(result).toBe(8);
});

// ❌ 避免的測試案例
test('測試計算功能', () => {
  const calc = new Calculator();
  // 測試多個功能，難以定位問題
  expect(calc.add(1, 2)).toBe(3);
  expect(calc.subtract(5, 2)).toBe(3);
  expect(calc.multiply(2, 3)).toBe(6);
  expect(calc.divide(6, 2)).toBe(3);
});
```

### 7.2 測試重構指導

```typescript
// 重構前：重複的設定程式碼
describe('SymbolIndex', () => {
  test('test1', () => {
    const parser = new TypeScriptParser();
    const index = new SymbolIndex();
    index.registerParser(parser);
    // 測試邏輯...
  });

  test('test2', () => {
    const parser = new TypeScriptParser();
    const index = new SymbolIndex();
    index.registerParser(parser);
    // 測試邏輯...
  });
});

// 重構後：提取共同設定
describe('SymbolIndex', () => {
  let index: SymbolIndex;
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser();
    index = new SymbolIndex();
    index.registerParser(parser);
  });

  test('test1', () => {
    // 只包含測試特定邏輯
  });

  test('test2', () => {
    // 只包含測試特定邏輯
  });
});
```

### 7.3 測試文件化

```typescript
/**
 * 測試群組：Parser 插件系統
 *
 * 測試範圍：
 * - Parser 註冊和發現
 * - 多語言支援
 * - 插件隔離和錯誤處理
 *
 * 相依性：
 * - TypeScript Parser 插件
 * - JavaScript Parser 插件
 *
 * 外部依賴：
 * - 檔案系統（透過 TestEnvironment 隔離）
 * - 網路（全部 Mock）
 */
describe('Parser Plugin System - Parser 插件系統', () => {
  /**
   * 測試情境：正常的插件註冊流程
   * 前置條件：系統中沒有已註冊的插件
   * 預期結果：插件成功註冊並可供使用
   */
  describe('當註冊新 Parser 插件時', () => {
    test('應該能夠成功註冊並列出插件', () => {
      // 測試實作...
    });
  });
});
```

## 8. 故障排除指南

### 8.1 常見測試問題

#### 8.1.1 測試不穩定 (Flaky Tests)
```typescript
// 問題：依賴時間的測試
test('❌ 不穩定的測試', async () => {
  const start = Date.now();
  await someAsyncOperation();
  const duration = Date.now() - start;

  expect(duration).toBeLessThan(100); // 在不同環境可能失敗
});

// 解決方案：使用 Mock 或更寬鬆的條件
test('✅ 穩定的測試', async () => {
  const mockTimer = vi.useFakeTimers();
  const promise = someAsyncOperation();

  mockTimer.advanceTimersByTime(50);
  await promise;

  expect(someResult).toBeDefined();
});
```

#### 8.1.2 記憶體洩漏檢測
```typescript
// 在測試中檢測記憶體洩漏
describe('記憶體管理', () => {
  afterEach(() => {
    // 檢查是否有未清理的監聽器
    const listeners = process.listenerCount('unhandledRejection');
    expect(listeners).toBe(0);

    // 檢查是否有未關閉的檔案描述符
    // 實作特定的清理驗證邏輯
  });
});
```

### 8.2 效能測試調優

```typescript
// 效能測試最佳化技巧
test('效能測試優化', async () => {
  // 預熱階段，避免 JIT 編譯影響
  for (let i = 0; i < 10; i++) {
    await operation();
  }

  // 實際測量階段
  const measurements = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    await operation();
    const end = performance.now();
    measurements.push(end - start);
  }

  // 統計分析
  const avg = measurements.reduce((a, b) => a + b) / measurements.length;
  const p95 = percentile(measurements, 95);

  expect(avg).toBeLessThan(10);
  expect(p95).toBeLessThan(50);
});
```

## 結論

本測試規範指南提供了完整的測試策略和實作細節，確保 Agent IDE 專案的品質和穩定性。所有開發者應該：

1. **遵循 TDD 流程**：先寫測試，再寫程式碼
2. **使用繁體中文**：所有測試描述使用繁體中文
3. **達成覆蓋率目標**：核心模組 95%，其他模組 80%
4. **隔離測試環境**：確保測試間無相互影響
5. **持續改進**：定期重構和優化測試程式碼

遵循這些規範將確保測試套件的可靠性、可維護性和有效性，為 Agent IDE 專案提供堅實的品質保障。