# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

# Agent IDE 專案規範

## 專案概述

為 AI 代理設計的程式碼智能工具集。

**目標**：最小化 token、最大化準確性、CLI 介面、模組化架構

**現況**：8 個核心模組 ✅、基礎設施 ✅、3 個 Parser ✅（TypeScript、JavaScript、Swift）、CLI ✅、**220+ 個測試通過**

## 快速參考

```bash
# 開發環境：Node.js >= 20、pnpm、TypeScript ES Module
pnpm build / typecheck / test / test:single
npm link && agent-ide --help
```

**架構**：
```
src/
├── core/           # 8 個核心模組（含 ShitScore）
├── infrastructure/ # parser、cache、storage、utils
├── plugins/        # TypeScript、JavaScript、Swift
├── interfaces/     # CLI
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
│   ├── cli/
│   │   ├── ts/                # TypeScript/JavaScript 測試
│   │   │   ├── cli-shit.e2e.test.ts
│   │   │   ├── cli-analyze.e2e.test.ts
│   │   │   ├── cli-deps.e2e.test.ts
│   │   │   └── ...
│   │   └── swift/             # Swift 測試
│   │       ├── cli-swift-analyze.e2e.test.ts
│   │       ├── cli-swift-deps.e2e.test.ts
│   │       └── ...
│   ├── helpers/               # 測試輔助工具
│   │   ├── fixture-manager.ts # Fixture 管理
│   │   └── cli-executor.ts    # CLI 執行器
│   └── fixtures/
│       ├── sample-project/    # TypeScript/JavaScript 測試專案
│       └── swift-sample-project/  # Swift 測試專案
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
   - **四大維度**（30%/30%/30%/20%）：
     - Complexity（複雜度）：高複雜度函式、過長函式、深層巢狀、過多參數
     - Maintainability（維護性）：死代碼、大檔案、重複代碼
     - Architecture（架構）：循環依賴、孤立檔案、高耦合
     - **QualityAssurance（品質保證）** ✨ 新增：
       - Type Safety（型別安全 30%）：any 型別、@ts-ignore、as any、strict 模式
       - Test Coverage（測試覆蓋率 25%）：測試檔案比例
       - Error Handling（錯誤處理 20%）：空 catch 區塊、靜默吞錯
       - Naming Conventions（命名規範 15%）：底線開頭變數、檔案命名
       - Security（安全性 10%）：硬編碼密碼、eval、innerHTML

## 基礎設施

- **Parser**：插件管理、統一 AST、增量解析
- **Cache**：L1/L2/L3、LRU/LFU/TTL
- **Storage**：檔案系統抽象、事務、ACID
- **Utils**：函式式工具、純函式、型別安全

## Parser 插件

- **TypeScript**：Compiler API、Program 重用、Watch 模式
- **JavaScript**：Babel、ES2023+、JSX/Flow
- **Swift**：SwiftSyntax 509+、CLI Bridge、MVVM/SwiftUI 支援

## 介面層

- **CLI**：`agent-ide [index|search|rename|move|analyze|deps|shit]`
  - Unix 哲學、JSON 輸出、管道支援

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


## Parser 插件介面

```typescript
interface ParserPlugin {
  // 基本資訊
  name: string;
  version: string;
  supportedExtensions: readonly string[];
  supportedLanguages: readonly string[];

  // 核心 Parser 功能
  parse(code: string, filePath: string): Promise<AST>;
  extractSymbols(ast: AST): Promise<Symbol[]>;
  findReferences(ast: AST, symbol: Symbol): Promise<Reference[]>;
  extractDependencies(ast: AST): Promise<Dependency[]>;

  // 重構功能
  rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]>;
  extractFunction(ast: AST, selection: Range): Promise<CodeEdit[]>;
  findDefinition(ast: AST, position: Position): Promise<Definition | null>;
  findUsages(ast: AST, symbol: Symbol): Promise<Usage[]>;

  // 分析功能（語言特定）
  detectUnusedSymbols(ast: AST, allSymbols: Symbol[]): Promise<UnusedCode[]>;
  analyzeComplexity(code: string, ast: AST): Promise<ComplexityMetrics>;
  extractCodeFragments(code: string, filePath: string): Promise<CodeFragment[]>;
  detectPatterns(code: string, ast: AST): Promise<PatternMatch[]>;

  // 品質檢查功能（語言特定）
  checkTypeSafety(code: string, ast: AST): Promise<TypeSafetyIssue[]>;
  checkErrorHandling(code: string, ast: AST): Promise<ErrorHandlingIssue[]>;
  checkSecurity(code: string, ast: AST): Promise<SecurityIssue[]>;
  checkNamingConventions(symbols: Symbol[], filePath: string): Promise<NamingIssue[]>;
  isTestFile(filePath: string): boolean;

  // 通用功能
  validate(): Promise<ValidationResult>;
  dispose(): Promise<void>;
  getDefaultExcludePatterns(): string[];
  shouldIgnoreFile(filePath: string): boolean;
  isAbstractDeclaration(symbol: Symbol): boolean;
}
```

**新增方法說明**：
- `detectUnusedSymbols`: 檢測未使用的符號（死代碼）
- `analyzeComplexity`: 分析程式碼複雜度（圈複雜度、認知複雜度）
- `extractCodeFragments`: 提取程式碼片段用於重複代碼檢測
- `detectPatterns`: 檢測樣板代碼模式（try-catch、logger 等）
- `checkTypeSafety`: 檢查型別安全問題（any、@ts-ignore 等）
- `checkErrorHandling`: 檢查錯誤處理問題（空 catch、靜默吞錯）
- `checkSecurity`: 檢查安全性問題（硬編碼密碼、eval、XSS）
- `checkNamingConventions`: 檢查命名規範（底線開頭變數等）
- `isTestFile`: 判斷檔案是否為測試檔案

## 新增功能流程

1. 建立規格 → 2. 設計 API → 3. 寫測試 → 4. 實作 → 5. CLI → 6. 文件

## 重要改進記錄

### 重複代碼檢測整合（2025-01-17）

**問題**：ShitScore 報告重複代碼永遠 0%，DuplicationDetector 完整實作但未整合

**解決方案**：
1. ✅ 整合 DuplicationDetector 到 ShitScoreAnalyzer
2. ✅ 調整檢測門檻：minLines: 3, minTokens: 5（可檢測小方法）
3. ✅ 實作方法級片段提取（基於正則表達式和大括號配對）
4. ✅ 跨檔案檢測邏輯（避免同檔案內方法誤判為重複）
5. ✅ Type-1、Type-2、Type-3 克隆檢測完整運作

**技術細節**：
- 提取共用 `calculateAverageLines` 函式
- Type-2/Type-3 檢測器過濾同檔案重複
- 改善 JSDoc 文件
- 移除 non-null assertions 和未使用變數

**測試覆蓋**：
- 新增 12 個 E2E 測試（cli-shit-duplication.e2e.test.ts）
- 驗證 Type-1、Type-2 檢測
- 驗證維護性評分整合
- 驗證 --detailed 參數輸出

**改善成果**：
- 重複代碼檢測從 0% → 實際檢測結果
- 維護性評分準確度提升（重複代碼佔 20% 權重）
- 全專案測試：218 passed | 2 skipped

### ShitScore 改進：擴展片段提取與模式檢測（2025-01-18）

**問題**：現有重複代碼檢測只能檢測方法級重複，無法識別版權宣告、常數定義、配置物件等非方法級重複，也無法檢測樣板代碼模式（try-catch、logger 初始化等）

**解決方案**：
1. ✅ **Phase 1: 擴展片段提取策略**
   - 新增 `extractTopLevelComments()` - 檢測檔案開頭的版權宣告等註解
   - 新增 `extractConstantDefinitions()` - 檢測常數物件定義（`export const XXX = {...}`）
   - 新增 `extractConfigObjects()` - 檢測配置物件模式
   - 改進 `tokenize()` - 新增參數支援保留註解 tokens

2. ✅ **Phase 2: 建立 Pattern Detector**
   - 新建 `src/core/analysis/pattern-detector.ts` 模組
   - 實作 5 種模式檢測器：
     - `detectTryCatchBoilerplate()` - 錯誤處理樣板（27 處）
     - `detectLoggerInit()` - Logger 初始化（7 處）
     - `detectConstructorDI()` - 建構函式依賴注入（18 處）
     - `detectEnvVarAccess()` - 環境變數存取（5 處）
     - `detectConfigObject()` - 配置物件模式

3. ✅ **Phase 3: 整合到 ShitScore**
   - 更新 `MaintainabilityData` 型別新增 `patternDuplicationCount`
   - 調整維護性評分權重：
     - deadCode: 0.5 → 0.35
     - largeFile: 0.3 → 0.2
     - duplicateCode: 0.2（維持）
     - **patternDuplication: 0.25（新增）**
   - 新增針對模式重複的改善建議

**技術細節**：
- `parseFileToFragments` 整合 4 種提取策略（註解、常數、配置、方法）
- `PatternDetector` 使用正則表達式 + 結構匹配檢測模式
- 模式群組化避免重複計數（同檔案同位置只計一次）
- 改善建議針對不同模式提供具體改進方向

**測試覆蓋**：
- 所有現有測試通過（218 個 E2E 測試）
- 在 simulator 專案驗證：
  - duplicateCode: 189.47%
  - **patternDuplication: 91.23%** ← 新增檢測項目
  - 提供高優先級建議："建議使用裝飾器、Interceptor 或 ConfigService 統一管理"

**改善成果**：
- 檢測覆蓋率：8 個重複片段 → 90+ 個重複項目（包含所有類型）
- 向 code-reviewer 接近度：~90% 覆蓋率
- 維護性評分更準確（新增模式重複維度佔 25% 權重）
- 提供可操作的改善建議（針對不同模式）

### ParserPlugin 架構重構：語言特定功能遷移至 Plugin（2025-01-24）

**問題**：語言特定的分析功能（複雜度、重複代碼、模式檢測等）散落在 core/ 目錄，違反模組化原則，擴展新語言困難

**解決方案**：
1. ✅ **Phase 1: 擴展 ParserPlugin 介面**
   - 新增 9 個必需方法至 `ParserPlugin` 介面：
     - `detectUnusedSymbols()` - 死代碼檢測
     - `analyzeComplexity()` - 複雜度分析
     - `extractCodeFragments()` - 程式碼片段提取（重複代碼檢測）
     - `detectPatterns()` - 樣板模式檢測
     - `checkTypeSafety()` - 型別安全檢查
     - `checkErrorHandling()` - 錯誤處理檢查
     - `checkSecurity()` - 安全性檢查
     - `checkNamingConventions()` - 命名規範檢查
     - `isTestFile()` - 測試檔案判斷
   - 建立 `analysis-types.ts` 定義所有通用型別

2. ✅ **Phase 2-3: 語言特定功能遷移**
   - 移動所有 analyzers 到 `src/plugins/typescript/analyzers/`：
     - `UnusedSymbolDetector`
     - `ComplexityAnalyzer`
     - `DuplicationDetector`
     - `PatternDetector`
     - `TypeSafetyChecker`
     - `ErrorHandlingChecker`
     - `SecurityChecker`
     - `NamingChecker`
     - `TestCoverageChecker`
   - 刪除 `core/analysis/` 下所有語言特定檔案
   - 刪除 `core/shit-score/collectors/` 下所有檔案

3. ✅ **Phase 4: TypeScript Parser 完整實作**
   - `extractCodeFragments`: 提取方法、註解、常數、配置（支援重複代碼檢測）
   - `checkTypeSafety`: 檢測 any、@ts-ignore、as any
   - `checkErrorHandling`: 檢測空 catch、靜默吞錯
   - `checkSecurity`: 檢測硬編碼密碼、eval、innerHTML
   - `checkNamingConventions`: 檢測底線開頭變數
   - 整合所有 TypeScript-specific analyzers

4. ✅ **Phase 5: JavaScript Parser 完整實作**
   - 實作與 TypeScript 相似的檢測邏輯
   - `extractCodeFragments`: 支援 ES6+ 語法
   - `checkErrorHandling`, `checkSecurity`, `checkNamingConventions`: 共用檢測邏輯
   - `checkTypeSafety`: 回傳空（JavaScript 無型別系統）

5. ✅ **Phase 6: ShitScoreAnalyzer 完全重寫**
   - 移除對舊 API 的依賴
   - 改用 Parser 新方法收集所有資料
   - 統一錯誤處理和資料流程

6. ✅ **Phase 7: 更新介面層**
   - CLI: 移除舊 API 依賴
   - 確保向下相容

**技術細節**：
- 使用 async/await 統一非同步處理
- 所有輔助方法標記為 `private async`
- 使用 `import('crypto')` 取代 `require('crypto')` 避免 ES module 衝突
- TypeScript strict 模式全面啟用
- 型別安全：禁止 any，使用 import() 型別定義

**測試覆蓋**：
- **220/220 測試通過 (100%)** ✅
- 所有 E2E 測試保持通過
- 新增測試覆蓋：
  - 重複代碼檢測（14 個測試）
  - 品質保證維度（18 個測試）
  - 型別安全、錯誤處理、命名規範、安全性檢查

**改善成果**：
- ✅ 模組化架構：語言特定功能完全封裝在 plugin 中
- ✅ 擴展性：新增語言只需實作 ParserPlugin 介面
- ✅ 可維護性：清晰的職責分離，core/ 只包含通用邏輯
- ✅ 測試通過率：從 0% → 100% (220/220)
- ✅ 程式碼品質：移除 require()、修正所有型別錯誤
- ✅ 向下相容：所有現有功能和 API 保持不變

**遷移路徑**：
```
Before:
core/analysis/*.ts (語言特定)
core/shit-score/collectors/*.ts (語言特定)

After:
plugins/typescript/analyzers/*.ts
plugins/javascript/analyzers/* (未來擴展)
```

## 授權

MIT License
