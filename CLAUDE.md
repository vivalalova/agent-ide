# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

AI 代理程式碼智能工具集：最小化 token、最大化準確性、CLI 介面、模組化架構

**現況**：7 核心模組、3 Parser（TS/JS/Swift）

## 常用指令

```bash
pnpm build                    # 建置（含 Swift parser 複製）
pnpm typecheck                # 型別檢查
pnpm test                     # 所有測試（3 workers）
pnpm test:single              # 單執行緒（記憶體受限）
pnpm test:bail                # 失敗即停
pnpm lint                     # ESLint
npm link                      # 本地 CLI 安裝

# 單一測試檔
pnpm test -- --run tests/e2e/commands/cli-search.e2e.test.ts

# 匹配測試名稱
pnpm test -- --run -t "應該分析專案"
```

## 架構

```
src/
├── core/           # 7 核心模組
│   ├── dependency/ # 依賴圖、循環檢測（Tarjan）、影響分析（BFS）
│   ├── indexing/   # 1000檔/秒、查詢<10ms
│   ├── move/       # 檔案移動+import更新
│   ├── refactor/   # 提取/內聯函式
│   ├── rename/     # 符號重命名+引用更新
│   ├── search/     # 文字/語義/結構化
│   ├── shift/      # 行級移動（單檔案內/跨檔案/新檔案生成）
│   └── snapshot/   # 模組快照（AI 理解用，~91% token 節省）
├── infrastructure/ # Parser框架、Cache（L1/L2/L3）、Storage（IFileSystem抽象）、Formatters
├── plugins/        # TS（Compiler API）、JS（Babel）、Swift（SwiftSyntax CLI）
├── interfaces/     # CLI（Unix哲學/JSON輸出）
└── application/    # 服務層、DI容器
```

## 測試規範

### 核心原則
- **只寫 E2E**：透過 CLI 測試，禁止直接 import 實作類別
- **memfs 隔離**：所有檔案操作在記憶體中，零硬碟 I/O
- **Fixture-Based**：`loadFixture('sample-project')` 載入到 memfs

### 測試模式
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

### 命名規範
- 檔案：`cli-<command>.e2e.test.ts`
- describe：`CLI <command> - 基於 sample-project fixture`
- it：具體行為+預期結果（✅ `應該輸出 JSON 格式` ❌ `測試功能`）

### 極端測試標準
- 數量極端：50+ 檔案/函數
- 深度極端：10+ 層嵌套
- 長度極端：500+ 行、1000+ 字元

## CLI 命令

### 統一輸出格式
所有命令支援 `--format` 參數：
- **json**：機器可讀 JSON 格式
- **summary**：人類可讀摘要格式
- **diff**：變更類命令預設，顯示程式碼差異（僅 rename/move/shift/refactor）

### 查詢類命令（唯讀）
```bash
agent-ide search <query> --path <path>              # 文字搜尋
agent-ide search symbol --query <name>              # 符號搜尋
agent-ide search structural --type <function|class> # 結構化搜尋
agent-ide analyze [complexity|dead-code|best-practices|patterns|quality] --path <path>
agent-ide deps [graph|cycles|impact|orphans] --path <path> [--all]
agent-ide snapshot --path <path> [--format json|summary]  # 模組/專案快照
```

### 變更類命令（支援 --dry-run）
```bash
agent-ide rename --path <path> --from <old> --to <new> [--dry-run] [--format diff|json|summary]
agent-ide move <source> <target> --path <path> [--dry-run] [--format diff|json|summary]
agent-ide shift <file> --from <line> --to <line> --position <pos> [--dry-run] [--format diff|json|summary]
agent-ide refactor extract-function --file <file> --start-line <n> --end-line <n> [--dry-run] [--format diff|json|summary]
agent-ide refactor inline-function --file <file> --function-name <name> [--dry-run] [--format diff|json|summary]
```

## 輸出處理架構

### 🚨 強制規範

**所有 CLI 命令的輸出必須透過統一輸出層處理，禁止直接使用 `console.log(JSON.stringify())`**

| 命令類型 | 輸出方法 | 結果型別 |
|---------|---------|---------|
| 查詢類（search, deps, analyze, snapshot） | `outputHandler.outputQuery(result, format)` | extends `QueryResult` |
| 變更類（rename, move, shift, refactor） | `outputHandler.outputMutation(input, format)` | `PreviewInput` |

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
- **QueryFormatter**：處理查詢類結果（SearchResult, DepsResult, AnalyzeResult, SnapshotResult）
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

**測試位置**：
- `tests/e2e/commands/cli-<command>.e2e.test.ts`
