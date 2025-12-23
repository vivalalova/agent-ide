# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

AI 代理程式碼智能工具集：最小化 token、最大化準確性、CLI 介面、模組化架構

**現況**：8 核心模組、2 Parser（TS/JS）、Unicode 識別符支援

**環境**：Node.js ≥20 | TypeScript 5.0 | Vitest 4.0 | ESM | v0.5.1

## 常用指令

```bash
pnpm build              # 建置
pnpm typecheck          # 型別檢查
pnpm test               # 全部測試（E2E + Unit）
pnpm test:e2e           # E2E 測試（memfs 隔離）
pnpm test:unit          # Unit 測試
pnpm test:cli           # CLI 煙霧測試
pnpm lint               # ESLint
npm link                # 本地安裝

# 單一測試
pnpm test:e2e -- --run tests/e2e/commands/cli-rename-basic.e2e.test.ts
pnpm test:unit -- --run tests/unit/example.test.ts
```

## 架構

```text
src/
├── core/                 # 核心模組（對應 CLI 命令）
│   ├── shared/           # indexing/ | dependency-graph/ | symbol-finder/
│   ├── cycles/           # 循環依賴（Tarjan）
│   ├── impact/           # 影響分析（BFS）
│   ├── find-references/  # 符號引用
│   ├── call-hierarchy/   # 呼叫層次
│   ├── snapshot/         # 模組快照（~91% token 節省）
│   ├── rename/           # 重命名+引用更新
│   ├── change-signature/ # 參數重構
│   ├── move/             # 檔案移動
│   ├── move-member/      # 成員移動
│   └── deadcode/         # Dead code 檢測
├── shared/               # types/ | errors/
├── infrastructure/       # Parser框架、Cache、Storage、Formatters、Changeset
├── plugins/              # typescript/ | javascript/ Parser
├── interfaces/           # CLI
└── application/          # DI容器
```

### Core 設計原則

- **CLI 對應**：`core/<module>/` 對應 CLI 命令
- **shared/ 層**：多命令共用基礎設施（indexing、dependency-graph、symbol-finder）
- **re-export 規則**：僅 `index.ts` barrel export 允許

### 依賴層級

```text
第三層：impact（依賴 cycles + shared）
    ↓
第二層：cycles, find-references, call-hierarchy, snapshot, rename, deadcode, move, move-member, change-signature
    ↓
第一層：shared/（indexing, dependency-graph, symbol-finder，無互依賴）→ @infrastructure
```

## 測試規範

| 類型 | 目錄 | 命令 | 用途 |
|-----|------|------|------|
| E2E | `tests/e2e/` | `pnpm test:e2e` | CLI 端對端（memfs 隔離） |
| Unit | `tests/unit/` | `pnpm test:unit` | 獨立模組測試 |
| CLI | `tests/cli/` | `pnpm test:cli` | 整合煙霧測試 |

### E2E 測試模式

```typescript
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI <command> - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;
  beforeEach(async () => { fixture = await loadFixture('sample-project'); });
  afterEach(() => { fixture.cleanup(); });

  it('應該...', async () => {
    const result = await executeCLI(['command', '--path', fixture.rootPath], { memfs: fixture.memfs });
    expect(result.exitCode).toBe(0);
  });
});
```

### 🚨 覆蓋率要求

- 覆蓋率門檻設於 `vitest.config.e2e.ts`，禁止隨意調降
- `tests/fixtures/` 專案必須可編譯

## CLI 命令

### 輸出格式

`--format`：json | summary | diff（變更類預設）

### 查詢類（唯讀）

```bash
agent-ide cycles --path <path>
agent-ide impact --file <file> --path <path>
agent-ide snapshot --path <path> [--since last] [--refresh]
agent-ide find-references <symbol> --path <path>
agent-ide call-hierarchy <function> --path <path>
agent-ide deadcode --path <path> [--dry-run] [--include-exports]
```

### 變更類（支援 --dry-run）

```bash
agent-ide rename --path <path> --from <old> --to <new>
agent-ide change-signature --file <file> --function <name> --reorder "b,a"
agent-ide move <source> <target> --path <path>
agent-ide move-member <sourceFile> <memberName> --target-file <file>
```

## 輸出處理架構

### 🚨 強制規範

禁止 `console.log(JSON.stringify())`，必須用統一輸出層：

| 類型 | 方法 | 型別 |
|-----|------|------|
| 查詢類 | `outputHandler.outputQuery(result, format)` | extends `QueryResult` |
| 變更類 | `outputHandler.outputMutation(input, format)` | `PreviewInput` |

### Changeset 架構（變更類命令）

所有變更類命令（rename、move、deadcode、change-signature、move-member）統一使用：

```text
CLI Command → Core.generateChangeset() → ChangeApplicator.apply() → IFileSystem
                        ↓
              convertChangesetToPreviewInput() → outputMutation()
```

**核心型別**（`infrastructure/changeset/`）：

| 型別 | 說明 |
|-----|------|
| `Changeset` | 統一的變更集（textChanges + fileOperations） |
| `ChangeApplicator` | 統一寫入入口（備份→寫入→回滾） |
| `ChangesetBuilder` | 流式建構器 |

**命令實作模式**：

```typescript
// 1. 生成 Changeset（不寫入）
const changeset = await engine.generateChangeset(options);

// 2. 轉換為 PreviewInput
const previewInput = await convertChangesetToPreviewInput(changeset, fileSystem);

// 3. dry-run 或執行
if (dryRun) {
  outputHandler.outputMutation(previewInput, format);
} else {
  const result = await applicator.apply(changeset, { atomic: true, rollbackOnError: true });
  // ...
}
```

### 新增查詢類命令步驟

1. `infrastructure/formatters/query-types.ts`：加 `QueryCommand` enum + 結果介面
2. `infrastructure/formatters/query-formatter.ts`：加 `toSummary()` case
3. 命令使用 `outputHandler.outputQuery(result, format)`

### 新增變更類命令步驟

1. Core 模組新增 `generateChangeset()` 方法
2. 命令使用 `ChangeApplicator` + `convertChangesetToPreviewInput`
3. 輸出使用 `outputHandler.outputMutation()`

## 開發流程

**開發**：規格→API→測試→實作→CLI
**驗證**：`pnpm build && pnpm lint && pnpm test`
**發布**：`npm version patch|minor|major` → `npm publish`

## 🚨 功能改動檢查清單

| 改動類型 | 必須更新 |
|---------|---------|
| CLI 新增選項/命令 | E2E 測試、`CLAUDE.md`、`plugins/skills/agent-ide/` |
| Core 模組改動 | E2E 測試、文件 |
| 輸出格式改動 | `infrastructure/formatters/`、E2E 測試 |

**文件位置**：`README.md`（介紹）| `plugins/skills/agent-ide/SKILL.md`（速查）| `CLAUDE.md`（開發規範）

**SKILL.md 更新**：內容變更時必須同步更新 frontmatter description
