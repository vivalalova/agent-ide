# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

AI 代理程式碼智能工具集：最小化 token、最大化準確性、CLI 介面、模組化架構

**現況**：8 核心模組、2 Parser（TS/JS）、Unicode 識別符支援

**環境**：Node.js ≥20 | TypeScript 5.0 | Vitest 4.0 | ESM 模組系統 | v0.5.1

## 常用指令

```bash
pnpm build                    # 建置
pnpm typecheck                # 型別檢查
pnpm test                     # 執行所有測試（E2E + Unit）
pnpm test:e2e                 # 僅 E2E 測試（CLI 端對端）
pnpm test:unit                # 僅 Unit 測試（獨立模組）
pnpm test:cli                 # CLI 整合煙霧測試（實際執行）
pnpm test:e2e:bail            # E2E 失敗即停
pnpm test:unit:bail           # Unit 失敗即停
pnpm lint                     # ESLint
npm link                      # 本地 CLI 安裝

# 單一 E2E 測試檔
pnpm test:e2e -- --run tests/e2e/commands/cli-rename-basic.e2e.test.ts

# 單一 Unit 測試檔
pnpm test:unit -- --run tests/unit/example.test.ts

# 匹配測試名稱
pnpm test:e2e -- --run -t "應該分析專案"
```

## 架構

```
src/
├── core/                 # 核心模組（對應 CLI 命令）
│   ├── shared/           # 共享層
│   │   ├── indexing/     # 索引引擎（1000檔/秒、查詢<10ms）
│   │   ├── dependency-graph/  # 依賴圖資料結構
│   │   └── symbol-finder.ts   # 符號搜尋器
│   ├── cycles/           # 循環依賴檢測（Tarjan）
│   ├── impact/           # 影響分析（BFS）
│   ├── find-references/  # 符號引用搜尋
│   ├── call-hierarchy/   # 呼叫層次分析
│   ├── snapshot/         # 模組快照（AI 理解用，~91% token 節省）
│   ├── rename/           # 符號重命名+引用更新
│   ├── change-signature/ # 參數重構+呼叫點更新
│   ├── move/             # 檔案移動+import更新
│   ├── move-member/      # 成員移動（方法/類別/函式）
│   ├── deadcode/         # Dead code 檢測與移除
│   └── patterns/         # 設計模式
├── infrastructure/       # Parser框架、Cache（L1/L2/L3）、Storage（IFileSystem抽象）、Formatters
├── plugins/              # TS（Compiler API）、JS（Babel）
├── interfaces/           # CLI（Unix哲學/JSON輸出）
└── application/          # 服務層、DI容器
```

## 測試規範

### 測試類型

| 類型 | 目錄 | 配置檔 | 命令 | 用途 |
|-----|------|-------|------|------|
| **E2E** | `tests/e2e/` | `vitest.config.e2e.ts` | `pnpm test:e2e` | CLI 端對端測試（memfs 隔離） |
| **Unit** | `tests/unit/` | `vitest.config.unit.ts` | `pnpm test:unit` | 獨立模組/函式測試 |
| **CLI** | `tests/cli/` | `vitest.config.cli.ts` | `pnpm test:cli` | CLI 整合煙霧測試（實際執行） |

### E2E 測試規範

**核心原則**：
- 透過 CLI 測試完整功能流程
- **memfs 隔離**：所有檔案操作在記憶體中，零硬碟 I/O
- **Fixture-Based**：`loadFixture('sample-project')` 載入到 memfs

**命名規範**：
- 檔案：`cli-<command>.e2e.test.ts`
- describe：`CLI <command> - 基於 sample-project fixture`
- it：具體行為+預期結果（✅ `應該輸出 JSON 格式` ❌ `測試功能`）

**測試模式**：
```typescript
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI search - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('應該搜尋並輸出 JSON 格式結果', async () => {
    const result = await executeCLI(['search', 'function', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).results).toBeDefined();
  });
});
```

### Unit 測試規範

**核心原則**：
- 測試獨立模組/函式，可直接 import 實作類別
- 快速執行、無外部依賴
- 專注於邊界條件和邏輯分支

**命名規範**：
- 檔案：`<module-name>.test.ts`
- describe：模組或類別名稱
- it：函式行為+預期結果

**測試模式**：
```typescript
import { MyModule } from '@core/my-module/index.js';

describe('MyModule', () => {
  it('should handle edge case correctly', () => {
    const result = MyModule.process(edgeCaseInput);
    expect(result).toBe(expectedOutput);
  });
});
```

### 🚨 覆蓋率要求
- `pnpm test` 自動產生覆蓋率報告（分別存於 `coverage/e2e/` 和 `coverage/unit/`）
- **覆蓋率不足必須補測試**：確保新增/修改的程式碼有對應測試覆蓋
- E2E 覆蓋率門檻設定於 `vitest.config.e2e.ts`

### 極端測試標準（E2E）
- 數量極端：50+ 檔案/函數
- 深度極端：10+ 層嵌套
- 長度極端：500+ 行、1000+ 字元

### Fixtures 規範

- **🚨 `tests/fixtures/` 的專案必須可編譯/運行**
- 新增/修改 fixture 後須驗證：TS 用 `pnpm typecheck`

## CLI 命令

### 統一輸出格式
所有命令支援 `--format` 參數：
- **json**：機器可讀 JSON 格式
- **summary**：人類可讀摘要格式
- **diff**：變更類命令預設，顯示程式碼差異（僅 rename/move）

### 查詢類命令（唯讀）
```bash
agent-ide cycles --path <path>                             # 循環依賴檢測
agent-ide impact --file <file> --path <path>               # 影響分析
agent-ide snapshot --path <path> [--format json|summary]   # 模組/專案快照
agent-ide snapshot --path <path> --since last             # 增量快照
agent-ide snapshot --path <path> --refresh                # 強制刷新快取
agent-ide find-references <symbol> --path <path>           # 符號引用搜尋
agent-ide call-hierarchy <function> --path <path>          # 呼叫層次分析
agent-ide deadcode --path <path>                           # 刪除 dead code
agent-ide deadcode --path <path> --dry-run                 # 預覽刪除
agent-ide deadcode --path <path> --include-exports         # 包含 export 符號
```

### 變更類命令（支援 --dry-run）
```bash
agent-ide rename --path <path> --from <old> --to <new> [--dry-run]
agent-ide change-signature --file <file> --function <name> --reorder "b,a" [--dry-run]
agent-ide move <source> <target> --path <path> [--dry-run]
agent-ide move-member <sourceFile> <memberName> --target-file <file> [--dry-run]
```

### Unicode 識別符支援
rename 命令支援 Unicode 識別符（中/日/韓/阿拉伯等多國語言）：
```bash
agent-ide rename --path . --from user_data --to 用戶資料 --dry-run
agent-ide rename --path . --from name --to 名前 --dry-run        # 日文
agent-ide rename --path . --from theme --to 테마 --dry-run       # 韓文
```
- 使用 Unicode 標準 UAX #31 (`\p{ID_Start}`, `\p{ID_Continue}`)
- 各 Parser 內建保留字驗證（TypeScript/JavaScript）

## 輸出處理架構

### 🚨 強制規範

**所有 CLI 命令的輸出必須透過統一輸出層處理，禁止直接使用 `console.log(JSON.stringify())`**

| 命令類型 | 輸出方法 | 結果型別 |
|---------|---------|---------|
| 查詢類（cycles, impact, snapshot, find-references, call-hierarchy） | `outputHandler.outputQuery(result, format)` | extends `QueryResult` |
| 變更類（rename, move, change-signature, move-member, deadcode） | `outputHandler.outputMutation(input, format)` | `PreviewInput` |

### 新增命令的輸出整合步驟

1. **QueryTypes 定義結果型別**（`infrastructure/formatters/query-types.ts`）
   - 在 `QueryCommand` enum 加入新命令
   - 定義 `XxxResult extends QueryResult` 介面

2. **QueryFormatter 加入格式化方法**（`infrastructure/formatters/query-formatter.ts`）
   - 在 `toSummary()` 的 switch 加入新 case
   - 實作 `formatXxxSummary()` 私有方法

3. **命令使用 outputHandler**（`interfaces/cli/commands/xxx.command.ts`）
   ```typescript
   import { QueryCommand, type XxxResult } from '@infrastructure/formatters/query-types.js';

   const result: XxxResult = {
     command: QueryCommand.Xxx,
     success: true,
     summary: { ... },
     // 命令特定欄位
   };
   outputHandler.outputQuery(result, format);
   ```

### UnifiedOutputHandler
統一處理所有 CLI 命令的輸出，位於 `src/interfaces/cli/unified-output-handler.ts`：

```typescript
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '../unified-output-handler.js';

const outputHandler = createUnifiedOutputHandler();
const format = parseOutputFormat(options.format, allowDiff);

// 查詢類命令
outputHandler.outputQuery(result, format);

// 變更類命令（dry-run 模式）
outputHandler.outputMutation(previewInput, format);
```

### Formatters 層
- **QueryFormatter**：處理查詢類結果（DepsResult, SnapshotResult）
- **PreviewFormatter**：處理變更類預覽（diff, summary, json）
- **QueryTypes**：統一的結果型別定義（QueryResult, QueryCommand enum）

## 開發流程

**開發**：規格→API→測試→實作→CLI
**驗證**：`pnpm build && pnpm lint && pnpm test`
**發布**：`npm version patch|minor|major` → `npm publish`

## 功能改動檢查清單

**🚨 任何功能改動必須同步更新以下項目：**

| 改動類型 | 必須更新 |
|---------|---------|
| CLI 新增選項 | `tests/e2e/commands/cli-*.e2e.test.ts`、`CLAUDE.md`、`plugins/skills/agent-ide/` |
| CLI 新增命令 | 同上 + `src/interfaces/cli/commands/` |
| Core 模組改動 | 對應 E2E 測試、相關文件、`plugins/skills/agent-ide/` |
| 輸出格式改動 | `infrastructure/formatters/`、E2E 測試 |
| 型別定義改動 | 所有引用處、測試、文件 |

**文件位置**：
- `README.md` - 專案介紹、安裝、快速開始
- `plugins/skills/agent-ide/SKILL.md` - 命令速查表
- `plugins/skills/agent-ide/references/guide.md` - 完整指南
- `CLAUDE.md` - 開發規範（開發用）

**🚨 SKILL.md 更新規範**：
- 更新 SKILL.md 內容時，**必須同步更新 frontmatter 的 description**
- description 目標是**最大化 AI 使用率**，需包含：觸發關鍵詞、強制語氣（🚨）、價值主張（如節省 token）

**🚨 測試覆蓋率門檻**：
- `vitest.config.e2e.ts` 的 `thresholds` 設定禁止隨意調降
- 調整門檻需有正當理由（如移除大量功能）並記錄於 commit message

**測試位置**：
- E2E 測試：`tests/e2e/commands/typescript/cli-<command>.e2e.test.ts`
- Unit 測試：`tests/unit/<module-name>.test.ts`
- CLI 測試：`tests/cli/cli-commands.cli.test.ts`
