# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

AI 代理程式碼智能工具集：最小化 token、最大化準確性、CLI 介面、模組化架構

**現況**：9 核心模組、2 內建 Parser（TS/JS）、可註冊額外 Parser 副檔名、Unicode 識別符支援

**環境**：Node.js ≥20 | TypeScript 5.0 | Vitest 4.0 | ESM | v0.13.7

## 常用指令

```bash
pnpm build              # 建置
pnpm typecheck          # 型別檢查
pnpm test               # 預設快速測試（Unit + 關鍵 TS E2E，<30s 目標）
pnpm test:full          # 完整測試（全部 E2E + Unit，無 coverage）
pnpm test:e2e           # 全部 E2E 測試（memfs 隔離，無 coverage）
pnpm test:e2e:quick     # 關鍵 TypeScript E2E 快速測試
pnpm test:unit          # Unit 快速測試（無 coverage）
pnpm test:coverage      # 全部 coverage 測試（E2E + Unit，含門檻）
pnpm test:cli           # CLI 煙霧測試
pnpm lint               # ESLint
pnpm validate:plugin    # Plugin 結構 + skill docs/help 對齊檢查
pnpm sync:skill-docs    # 從真實 CLI help 重新產生 skill reference 區塊與 plugin description
npm link                # 本地安裝

# 單一測試
pnpm test:e2e -- --run tests/e2e/commands/typescript/cli-rename.e2e.test.ts
pnpm test:unit -- --run tests/unit/core/cycles/cycle-detector.test.ts
```

## 架構

```text
src/
├── core/                 # 核心模組（對應 CLI 命令）
│   ├── foundations/      # indexing/ | dependency-graph/ | symbol-finder/ | file-utils
│   ├── cycles/           # 循環依賴（Tarjan）
│   ├── impact/           # 影響分析（BFS）
│   ├── call-hierarchy/   # 呼叫層次
│   ├── rename/           # 重命名+引用更新
│   ├── change-signature/ # 參數重構
│   ├── move/             # 檔案移動
│   ├── move-member/      # 成員移動
│   └── deadcode/         # Dead code 檢測
├── shared/               # types/ | errors/（全域共用）
├── infrastructure/       # Parser框架、Cache、Storage、Formatters、Changeset
├── plugins/              # typescript/ | javascript/ Parser
└── interfaces/           # CLI
```

### Parser 語言擴充契約

- **單一註冊來源**：預設 Parser 由 `infrastructure/parser/initializer.ts` 管理；CLI、IndexEngine、worker 都必須呼叫同一套 bootstrap，禁止各自 hardcode TS/JS 註冊。
- **副檔名來源**：索引、搜尋、impact、cycles 以 `ParserRegistry.getSupportedExtensions()` 合併 `includeExtensions`；新增 Parser 後不可另存一份副檔名清單。
- **worker 擴充**：worker 任務可帶 `parserModulePaths`，worker 解析前會載入外部 Parser module；測試需覆蓋非 TS/JS extension。
- **能力邊界**：`change-signature`、`call-hierarchy`、`move-member` 仍是 TS/JS 語意流程；非 TS/JS Parser 必須透過 `getCapabilities()` 明確宣告支援，否則 CLI fast-fail。
- **測試要求**：新增語言支援時至少用假 Parser 驗證 indexing/search、impact/cycles、worker bootstrap，以及不支援能力的錯誤訊息。

### Core 設計原則

- **CLI 對應**：`core/<module>/` 對應 CLI 命令；例外是 `find-references`，無獨立 `core/` 模組，實作直接在 `interfaces/cli/commands/find-references.command.ts` + `infrastructure/formatters/strategies/find-references-formatter.ts` + `plugins/{typescript,javascript}/reference-finder.ts`
- **foundations/ 層**：核心內部共用基礎設施（indexing、dependency-graph、symbol-finder、file-utils）
- **shared/ 層**：全域共用（types、errors）- 與 `core/foundations/` 區分
- **re-export 規則**：僅 `index.ts` barrel export 允許

### 依賴層級

```text
第三層：impact（依賴 cycles + foundations）
    ↓
第二層：cycles, call-hierarchy, rename, deadcode, move, move-member, change-signature
    ↓
第一層：foundations/（indexing, dependency-graph, symbol-finder，無互依賴）→ @infrastructure
```

## 測試規範

| 類型 | 目錄 | 命令 | 用途 |
|-----|------|------|------|
| E2E Quick | `tests/e2e/commands/typescript/` | `pnpm test:e2e:quick` | 關鍵 TypeScript CLI 端對端快速測試 |
| E2E Full | `tests/e2e/` | `pnpm test:e2e` | 完整 CLI 端對端（memfs 隔離，無 coverage） |
| Unit | `tests/unit/` | `pnpm test:unit` | 獨立模組測試（快速無 coverage） |
| CLI | `tests/cli/` | `pnpm test:cli` | 整合煙霧測試 |

### Fixtures（`tests/fixtures/`）

E2E 測試用的範例專案與 parser 模組：

- **專案 fixture**（`sample-project/`、`js-project/`…）：磁碟上的迷你 TS/JS 專案。`loadFixture(name)` 把整個目錄載入**全新 memfs 虛擬根目錄**（目錄內容有程序內快取），測試對檔案的讀寫都發生在記憶體、不碰磁碟原檔，每個測試拿獨立副本、天然隔離
- **parser 模組 fixture**（`toy-parser.mjs` 等根層 `.mjs`）：測試 parser 註冊/生命週期用的假 parser 模組
- 新 bug 重現需要特定專案形狀時建新 fixture 目錄（見下方「Bug 重現即測試案例」）；單檔案案例優先用 `fixture.writeFile()` 動態寫入既有 fixture，不必開新目錄

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
- 覆蓋率驗證使用 `pnpm test:coverage`；日常 `pnpm test` 為 Unit + 關鍵 TS E2E 快速路徑
- `tests/fixtures/` 專案必須可編譯

### 🚨 Bug 重現即測試案例（禁拋棄式重現）

- bug 修復**先寫 reproduction test**（先紅後綠），重現案例直接寫成 `tests/` 下的 test case + 需要的 fixture 專案放 `tests/fixtures/`，成為永久 regression 覆蓋
- **禁**用 scratchpad／臨時目錄做一次性手動重現後丟棄：可重用的案例才留得住、下次回歸才驗得到
- 共用 fixture 用 `loadFixture()` 載入；單檔案案例可在測試內 `fixture.writeFile()` 寫入
- 手動 CLI 重現／隔離實驗必帶 `--no-cache`：索引快取以路徑為 key，實驗中增刪改 fixture 檔案後不失效，會讀到舊索引汙染隔離結論

## CLI 命令

### 輸出格式

`--format`：json | summary | diff（變更類預設）

### 全域選項

- `--no-cache`：停用索引快取
- `--cache-dir <path>`：覆寫索引快取目錄
- `--verbose`：顯示詳細處理資訊

### 查詢類（唯讀）

```bash
agent-ide cycles --path <path>
agent-ide impact --file <file> --path <path>
agent-ide search <symbol> --path <path> [--type function] [--no-fuzzy]
agent-ide find-references <symbol> --path <path> [--at <file:line:column>]
agent-ide call-hierarchy <function> --path <path> [--at <file:line:column>]
agent-ide deadcode --path <path> [--dry-run] [--include-exports] [--include-public-members] [--exclude <patterns...>]
```

`impact --path` 是 project root；相對 `--file` 以 `--path` 為基準解析。JSON validation errors 會提供 `pathContext`，包含 resolved project root 與 target file metadata。

### 變更類（支援 --dry-run）

```bash
agent-ide rename --path <path> --from <old> --to <new> [--at <file:line:column>]
agent-ide change-signature --file <file> --function <name> --reorder "b,a"
agent-ide change-signature --file <file> --function <name> --add "options:RequestOptions={ cache: false }" --call-site-value "options=runtimeOptions"
agent-ide change-signature --file <file> --function <name> --remove "unused"
agent-ide change-signature --file <file> --function <name> --rename "oldName:newName"
agent-ide change-signature --file <file> --function <name> --change-type "value:unknown"
agent-ide deadcode --path <path> --apply [--include-exports]
agent-ide move <source> <target> --path <path>
```

`deadcode` 預設只預覽，不寫入；實際刪除必須明確加 `--apply`。`--dry-run` 即使和 `--apply` 同時指定也會維持預覽模式。

**move 位置格式**：source 帶位置時自動切換為成員移動模式：

`--path` 是 project root；相對 source/target 都以 `--path` 為基準解析。`move --dry-run` 會輸出 resolved project root、source、requested target、final target 與 import 更新預覽；目標已存在且是目錄時 final target 會明確顯示嵌套後路徑。

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

**唯讀符號查詢 `--at` 參數**：`find-references` 與 `call-hierarchy` 可用 `--at <file:line:column>` 鎖定同名符號；JSON 輸出包含 `symbols` 定義候選清單，定位成功時包含 `targetSymbol`。`find-references` 的 `symbols` / `definitions` 不包含 parser 產生的 import-only candidate。

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

### 🚨 發布機制（重要）

本專案使用 **semantic-release 自動發布**，由 `.github/workflows/release.yml` 處理：

- push 到 `main` → CI 跑 build + test → `npx semantic-release` 自動執行：
  - 依 commit message（conventional commits）判斷 patch/minor/major
  - 自動更新 `package.json` 版本（產生 `chore(release): x.y.z [skip ci]` commit）
  - 自動建立 git tag、GitHub Release、npm publish（OIDC，無需 token）
- Commit 規範：`feat:` → minor、`fix:` → patch、`BREAKING CHANGE:` → major、其他（`chore:`/`docs:`/`refactor:`）不觸發發版

**禁止手動 `npm version` / `npm publish`**：會產生非 conventional commit 與離散 tag，與 semantic-release 衝突造成版本錯亂。需要發版只要 push 符合規範的 commit 即可。已透過 `.claude/settings.json` 的 `permissions.deny` 阻擋這些指令。

### Plugin 設定檔驗證

用 Claude Code CLI 驗證設定檔正確性（錯誤訊息會指出問題欄位）：

```bash
# 1. CLI help 或 SKILL.md description 變更後，先從 TS source CLI 同步 reference/plugin metadata
pnpm sync:skill-docs

# 2. 驗證 manifest、plugin 結構、skill docs/help 對齊
claude plugin validate .claude-plugin/marketplace.json
claude plugin validate plugins/skills/agent-ide/plugin.json
pnpm validate:plugin

# 3. CLI source/help 有改時，另跑一般建置驗證；docs-only metadata 可跳過 build
pnpm build

# 4. 額外做一次本地安裝 smoke test（從專案根目錄執行）
claude plugin marketplace add . --scope local
claude plugin install agent-ide@agent-ide-skills --scope local

# 重新測試前先移除
claude plugin marketplace remove agent-ide-skills
```

**常見錯誤**：

| 錯誤訊息 | 原因 | 修正 |
|---------|------|------|
| `plugins.0.source: Invalid input` | source 格式錯誤 | 使用 `./path/to/plugin` 格式 |
| `skills: Invalid input` | skills 欄位格式錯誤 | 移除或使用正確路徑格式 |

**正確結構**：

```text
.claude-plugin/
└── marketplace.json     # source 指向 plugin 目錄

plugins/skills/agent-ide/
├── plugin.json          # 無 skills 欄位（SKILL.md 在同目錄自動偵測）
├── SKILL.md
└── references/
```

## 🚨 功能改動檢查清單

| 改動類型 | 必須更新 |
|---------|---------|
| CLI 新增選項/命令 | E2E 測試、`AGENTS.md`、`plugins/skills/agent-ide/` |
| Core 模組改動 | E2E 測試、文件 |
| 輸出格式改動 | `infrastructure/formatters/`、E2E 測試 |

**文件位置**：`README.md`（介紹）| `plugins/skills/agent-ide/SKILL.md`（速查）| `AGENTS.md`（開發規範）

**SKILL.md 更新**：內容變更時必須同步更新 frontmatter description
