# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

# Agent IDE 專案規範

## 專案概述

為 AI 代理設計的程式碼智能工具集。

**目標**：最小化 token、最大化準確性、CLI + MCP 介面、模組化架構

**現況**：8 個核心模組 ✅、基礎設施 ✅、2 個 Parser ✅（TypeScript、JavaScript）、CLI/MCP ✅、188 個測試通過

## 快速參考

```bash
# 開發環境：Node.js >= 20、pnpm、TypeScript ES Module
pnpm build / typecheck / test / test:single
npm link && agent-ide --help
```

**架構**：
```
src/
├── core/           # 7 個核心模組
├── infrastructure/ # parser、cache、storage、utils
├── plugins/        # TypeScript、JavaScript
├── interfaces/     # CLI、MCP
└── application/    # 服務協調層
```

## 開發規範

- **TDD**：紅燈 → 綠燈 → 重構
- **品質**：TypeScript strict、禁止 any、單一職責
- **模組化**：SOLID、依賴倒置、介面隔離

## 測試規範

### 測試類型
- **只寫 E2E 測試**，不寫單元測試
- 透過 CLI 命令測試完整功能流程
- 使用真實 fixture 專案（sample-project）

### 測試架構
```
tests/
├── e2e/
│   ├── cli/                    # CLI 命令測試
│   │   ├── cli-shit.e2e.test.ts
│   │   ├── cli-analyze.e2e.test.ts
│   │   ├── cli-deps.e2e.test.ts
│   │   └── ...
│   ├── helpers/                # 測試輔助工具
│   │   ├── fixture-manager.ts  # Fixture 管理
│   │   └── cli-executor.ts     # CLI 執行器
│   └── fixtures/
│       └── sample-project/     # 測試專案
└── ...
```

### Fixture-Based 測試模式

**✅ 正確寫法**：
```typescript
import { loadFixture, FixtureProject } from '../helpers/fixture-manager';
import { executeCLI } from '../helpers/cli-executor';

describe('CLI shit - 基於 sample-project fixture', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it('應該分析專案並輸出評分', async () => {
    const result = await executeCLI([
      'shit',
      '--path',
      fixture.tempPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.shitScore).toBeDefined();
  });
});
```

**❌ 錯誤寫法**：
```typescript
// 不要直接 import 實作類別
import { ShitScoreAnalyzer } from '@/core/shit-score';

// 不要直接實例化類別
const analyzer = new ShitScoreAnalyzer(...);
const result = await analyzer.analyze(path);
```

### 測試輔助工具

**fixture-manager.ts**：
- `loadFixture(name)`: 載入並複製 fixture 到臨時目錄
- `fixture.tempPath`: 臨時目錄路徑
- `fixture.getFilePath(relative)`: 取得檔案絕對路徑
- `fixture.readFile(relative)`: 讀取檔案內容
- `fixture.writeFile(relative, content)`: 寫入檔案
- `fixture.fileExists(relative)`: 檢查檔案是否存在
- `fixture.cleanup()`: 清理臨時目錄

**cli-executor.ts**：
- `executeCLI(args)`: 執行 CLI 命令
- 回傳 `{ exitCode, stdout, stderr }`

### 測試命名規範

**測試檔案**：`cli-<command>.e2e.test.ts`
- 範例：`cli-shit.e2e.test.ts`、`cli-analyze.e2e.test.ts`

**describe 區塊**：`CLI <command> - 基於 sample-project fixture`
- 範例：`CLI shit - 基於 sample-project fixture`

**it 測試案例**：描述具體行為和預期結果
- ✅ `應該分析專案並輸出 JSON 格式評分`
- ✅ `分數超過 --max-allowed 應該失敗（exit 1）`
- ❌ `測試評分功能`（太模糊）

### 診斷命令測試要點

**驗證 `--all` 參數**：
```typescript
// 預設只輸出問題
const defaultResult = await executeCLI(['analyze', 'complexity', '--format', 'json']);
const defaultOutput = JSON.parse(defaultResult.stdout);
expect(defaultOutput.issues).toBeDefined();      // 只有問題
expect(defaultOutput.all).toBeUndefined();       // 沒有完整結果

// --all 輸出完整結果
const allResult = await executeCLI(['analyze', 'complexity', '--format', 'json', '--all']);
const allOutput = JSON.parse(allResult.stdout);
expect(allOutput.all).toBeDefined();             // 完整結果
expect(allOutput.all.length).toBeGreaterThan(0);
```

**驗證輸出結構**：
```typescript
// 診斷命令（analyze、deps）使用 --all 時
expect(output.summary).toBeDefined();            // 統計資訊
expect(output.issues).toBeDefined();             // 問題項目
expect(output.all).toBeDefined();                // 完整結果（--all）

// 存取完整結果
const files = output.all;                        // analyze complexity --all
const nodes = output.all.nodes;                  // deps --all
```

### 測試覆蓋要求

- 基本功能測試（正常流程）
- 參數組合測試（`--format`、`--detailed`、`--all` 等）
- 錯誤處理測試（錯誤 exit code、錯誤訊息）
- 邊界條件測試（空專案、單檔案、大專案）
- 輸出格式測試（JSON、summary）

### 常見陷阱

❌ **不要建立自訂 test helper**
```typescript
// 錯誤：自建 createTestProject()
const testProject = await createTestProject({...});
```

✅ **使用既有 fixture-manager**
```typescript
// 正確：使用 loadFixture
const fixture = await loadFixture('sample-project');
```

❌ **不要直接測試類別**
```typescript
// 錯誤：直接實例化
const analyzer = new ShitScoreAnalyzer();
```

✅ **透過 CLI 測試**
```typescript
// 正確：透過 CLI
await executeCLI(['shit', '--path', fixture.tempPath]);
```

## 核心模組（8個）

1. **Analysis**：複雜度分析、品質評估、死代碼檢測
2. **Dependency**：依賴圖、循環檢測（Tarjan）、影響分析（BFS）
3. **Indexing**：程式碼索引（1000檔/秒、查詢<10ms）
4. **Move**：檔案移動、import 路徑更新
5. **Refactor**：提取/內聯函式、設計模式轉換
6. **Rename**：符號重命名、引用更新、作用域分析
7. **Search**：文字/語義/結構化搜尋
8. **ShitScore**：垃圾度評分系統（綜合品質評估，0-100分反向評分）

## 基礎設施

- **Parser**：插件管理、統一 AST、增量解析
- **Cache**：L1/L2/L3、LRU/LFU/TTL
- **Storage**：檔案系統抽象、事務、ACID
- **Utils**：函式式工具、純函式、型別安全

## Parser 插件

- **TypeScript**：Compiler API、Program 重用、Watch 模式
- **JavaScript**：Babel、ES2023+、JSX/Flow

## 介面層

- **CLI**：`agent-ide [index|search|rename|move|analyze|deps|shit]`
  - Unix 哲學、JSON 輸出、管道支援
- **MCP**：`code_[index|search|rename|move|analyze|deps|shit|parser_plugins]`
  - MCP 規範、非同步、工具註冊

## 診斷命令輸出優化（Token 效率）

**目的**：診斷命令（analyze、deps）預設只回傳有問題的程式碼，節省 AI agent 的 token 消耗

**原理**：正常程式碼佔掃描結果的 99%，但 AI agent 通常只關心問題項目

### 預設行為（只輸出問題）

- `analyze complexity`：只輸出 evaluation=high 或 complexity>10 的檔案
- `analyze dead-code`：只輸出有 dead code 的檔案
- `deps`：只輸出循環依賴和孤立檔案

### 完整輸出（`--all` 參數）

```bash
# 顯示所有掃描的檔案
agent-ide analyze complexity --all
agent-ide analyze dead-code --all
agent-ide deps --all
```

### 輸出結構

```json
{
  "issues": [...],      // 預設：只有問題項目
  "all": [...],         // --all：完整掃描結果
  "summary": {          // 統計資訊（永遠存在）
    "totalScanned": 100,
    "issuesFound": 5
  }
}
```

### MCP 對應

- CLI `--all` 對應 MCP `showAll: true`
- 預設 `showAll: false`

## Parser 插件介面

```typescript
interface ParserPlugin {
  name: string;
  version: string;
  supportedExtensions: string[];
  parse(code: string, filePath: string): Promise<AST>;
  extractSymbols(ast: AST): Promise<Symbol[]>;
  findReferences(ast: AST, symbol: Symbol): Promise<Reference[]>;
  extractDependencies(ast: AST): Promise<Dependency[]>;
  rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]>;
  extractFunction(ast: AST, selection: Range): Promise<CodeEdit[]>;
}
```

## 新增功能流程

1. 建立規格 → 2. 設計 API → 3. 寫測試 → 4. 實作 → 5. CLI/MCP → 6. 文件

## 授權

MIT License
