# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

AI 代理程式碼智能工具集：最小化 token、最大化準確性、CLI 介面、模組化架構

**現況**：10 核心模組、2 Parser（TS/JS）、Unicode 識別符支援

**環境**：Node.js ≥20 | TypeScript 5.0 | Vitest 4.0 | ESM | v0.13.1

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
│   ├── foundations/      # indexing/ | dependency-graph/ | symbol-finder/ | file-utils
│   ├── cycles/           # 循環依賴（Tarjan）
│   ├── impact/           # 影響分析（BFS）
│   ├── find-references/  # 符號引用
│   ├── call-hierarchy/   # 呼叫層次
│   ├── snapshot/         # 模組快照
│   ├── rename/           # 重命名+引用更新
│   ├── change-signature/ # 參數重構
│   ├── move/             # 檔案移動
│   ├── move-member/      # 成員移動
│   ├── deadcode/         # Dead code 檢測
│   └── undo/             # 變更還原
├── shared/               # types/ | errors/（全域共用）
├── infrastructure/       # Parser框架、Cache、Storage、Formatters、Changeset、History、Lock
├── plugins/              # typescript/ | javascript/ Parser
├── interfaces/           # CLI
└── application/          # DI容器
```

### Core 設計原則

- **CLI 對應**：`core/<module>/` 對應 CLI 命令
- **foundations/ 層**：核心內部共用基礎設施（indexing、dependency-graph、symbol-finder、file-utils）
- **shared/ 層**：全域共用（types、errors）- 與 `core/foundations/` 區分
- **re-export 規則**：僅 `index.ts` barrel export 允許

### 依賴層級

```text
第三層：impact（依賴 cycles + foundations）
    ↓
第二層：cycles, find-references, call-hierarchy, snapshot, rename, deadcode, move, move-member, change-signature, undo
    ↓
第一層：foundations/（indexing, dependency-graph, symbol-finder，無互依賴）→ @infrastructure
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
agent-ide rename --path <path> --from <old> --to <new> [--at <file:line:column>]
agent-ide change-signature --file <file> --function <name> --reorder "b,a"
agent-ide move <source> <target> --path <path>
agent-ide undo --path <path> [--list] [--id <id>]
```

**undo 命令**：還原上一次變更（支援多層 undo，最多 10 次）

```bash
# 列出可還原的變更
agent-ide undo --path . --list

# 還原最近一次變更
agent-ide undo --path .

# 還原特定版本（使用 --list 顯示的 ID 前 8 碼）
agent-ide undo --path . --id abc12345

# 預覽還原（不執行）
agent-ide undo --path . --dry-run
```

> 歷史記錄儲存於 `~/.config/agent-ide/history/`，超過 10 筆或 7 天自動清理

**move 位置格式**：source 帶位置時自動切換為成員移動模式：

```bash
# 檔案移動
agent-ide move src/old.ts src/new.ts --path .

# 成員移動（source 帶位置）
agent-ide move src/utils.ts:25 src/helpers.ts --path .

# 成員移動（指定插入位置）
agent-ide move src/utils.ts:25 src/helpers.ts:10 --path .
```

**⚠️ 目錄移動注意**：遵循 Unix `mv` 行為，目標目錄已存在時會嵌套：

```bash
# 目標不存在 → 直接移動
move src/utils src/helpers  # → src/helpers/...

# 目標已存在 → 嵌套進目標內
move src/utils src/helpers  # → src/helpers/utils/...
```

**Glob 模式**：支援 `*.ts`、`**/*.ts` 等 glob pattern，比照 Unix `mv` 行為：

```bash
# 移動多個 .ts 檔案到目錄
agent-ide move "src/utils/*.ts" src/lib/ --path .

# 遞迴移動所有 .ts 檔案
agent-ide move "src/old/**/*.ts" src/new/ --path .

# 單一檔案匹配時可重命名
agent-ide move "src/only/*.ts" src/renamed.ts --path .
```

> ⚠️ 多檔案時目標必須是目錄（以 `/` 結尾或已存在的目錄）

**rename `--at` 參數**：當有多個同名符號時，用 `--at` 精確定位：

```bash
# 多符號會報錯並列出位置
agent-ide rename --from userId --to uid
# ❌ 找到 15 個同名符號，請用 --at 指定位置

# 用 --at 指定 file:line 精確定位
agent-ide rename --from userId --to uid --at src/user.ts:42
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
