# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

AI 代理程式碼智能工具集：最小化 token、最大化準確性、CLI 介面、模組化架構

**現況**：8 核心模組、3 Parser（TS/JS/Swift）、241 測試通過

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
pnpm test -- --run tests/e2e/commands/cli-shit.e2e.test.ts

# 匹配測試名稱
pnpm test -- --run -t "應該分析專案"
```

## 架構

```
src/
├── core/           # 8 核心模組
│   ├── dependency/ # 依賴圖、循環檢測（Tarjan）、影響分析（BFS）
│   ├── indexing/   # 1000檔/秒、查詢<10ms
│   ├── move/       # 檔案移動+import更新
│   ├── refactor/   # 提取/內聯函式
│   ├── rename/     # 符號重命名+引用更新
│   ├── search/     # 文字/語義/結構化
│   ├── shift/      # 行級移動（單檔案內/跨檔案/新檔案生成）
│   └── shit-score/ # 0-100分垃圾度評分
├── infrastructure/ # Parser框架、Cache（L1/L2/L3）、Storage（IFileSystem抽象）
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

describe('CLI shit - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('應該分析專案並輸出 JSON 格式評分', async () => {
    const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).shitScore).toBeDefined();
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

## ShitScore 維度

**四維度權重**（30%/30%/20%/20%）：
- Complexity：循環複雜度、嵌套深度
- Maintainability：檔案大小、函數長度
- Architecture：依賴深度、循環依賴
- QualityAssurance：型別安全、錯誤處理、命名

## CLI 命令

```bash
agent-ide search text --path <path> --query <query>
agent-ide search structural --path <path> --type <function|class>
agent-ide rename --path <path> --from <old> --to <new>
agent-ide move --path <path> --source <src> --target <dest>
agent-ide shift --path <path> --file <file> --from <line> --to <line> --position <pos>
agent-ide analyze --path <path> [--format json|summary]
agent-ide deps --path <path> [--format json|summary]
agent-ide shit --path <path> [--format json|text] [--detailed]
```

## 診斷命令輸出

**Token效率**：預設只輸出問題、`--all` 顯示完整結果

```json
{
  "issues": [...],      // 預設：問題項目
  "all": [...],         // --all：完整結果
  "summary": {...}      // 統計資訊
}
```

## 開發流程

**開發**：規格→API→測試→實作→CLI
**驗證**：`pnpm build && pnpm lint && pnpm test`
**發布**：`npm version patch|minor|major` → `npm publish`
