# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

# Agent IDE 專案規範

## 專案概述

AI 代理程式碼智能工具集：最小化 token、最大化準確性、CLI/MCP 介面、模組化架構

**現況**：8 核心模組、3 Parser（TS/JS/Swift）、220+ 測試通過

## 快速參考

```bash
pnpm build         # 建置（含 Swift parser 複製）
pnpm typecheck     # 型別檢查
pnpm test          # 所有測試
pnpm test:single   # 單執行緒（記憶體受限）
pnpm test:bail     # 失敗即停
pnpm lint          # ESLint
npm link           # 本地 CLI 安裝
```

**架構**：`core/`（8模組+ShitScore）、`infrastructure/`（parser/cache/storage）、`plugins/`（TS/JS/Swift）、`interfaces/`（CLI/MCP）、`application/`（服務層）

## 參考文件

**功能詳細說明**（docs/）：
- [**實戰指南**](./docs/GUIDE.md) - **7 個完整案例：新增/刪除/重構的組合使用方法**
- [Snapshot](./docs/SNAPSHOT.md) - 快照生成與使用、型別安全重構案例
- [Indexing](./docs/INDEXING.md) - 增量索引、三層快取、並行處理
- [Search](./docs/SEARCH.md) - 文字/符號/語義搜尋、正規表達式
- [Rename](./docs/RENAME.md) - 符號重命名、衝突檢測、備份回退
- [Move](./docs/MOVE.md) - 檔案移動、import 自動更新、批量操作
- [Dependencies](./docs/DEPENDENCIES.md) - 循環依賴檢測（Tarjan）、影響分析（BFS）
- [Quality](./docs/QUALITY.md) - ShitScore 評分、複雜度分析、死代碼檢測

## 開發規範

- **TDD**：紅→綠→重構
- **品質**：TS strict、禁 any、單一職責、SOLID
- **測試**：只寫 E2E（CLI 測試）、使用 fixture-manager + cli-executor

## 測試規範

### 核心原則
- **只寫 E2E**：透過 CLI 測試完整流程，禁止直接 import 實作類別
- **Fixture-Based**：使用 `loadFixture('sample-project')` 複製到臨時目錄
- **測試輔助**：`fixture-manager.ts`（loadFixture/tempPath/getFilePath/readFile/writeFile/cleanup）、`cli-executor.ts`（executeCLI→{exitCode,stdout,stderr}）

### 測試模式範例
```typescript
import { loadFixture } from '../helpers/fixture-manager';
import { executeCLI } from '../helpers/cli-executor';

describe('CLI shit - 基於 sample-project fixture', () => {
  let fixture;
  beforeEach(async () => { fixture = await loadFixture('sample-project'); });
  afterEach(async () => { await fixture.cleanup(); });

  it('應該分析專案並輸出 JSON 格式評分', async () => {
    const result = await executeCLI(['shit', '--path', fixture.tempPath, '--format', 'json']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).shitScore).toBeDefined();
  });
});
```

### 命名規範
- 檔案：`cli-<command>.e2e.test.ts`
- describe：`CLI <command> - 基於 sample-project fixture`
- it：具體行為+預期結果（✅ `應該輸出 JSON 格式` ❌ `測試功能`）

### 診斷命令測試要點
- 驗證 `--all` 參數：預設 `output.issues`（只有問題）、`--all` 時 `output.all`（完整結果）
- 輸出結構：`{summary, issues, all?}`（all 僅 --all 時存在）

### 測試覆蓋
基本功能、參數組合（--format/--detailed/--all）、錯誤處理、邊界條件、輸出格式

### 常見陷阱
❌ 建立自訂 helper → ✅ 用 fixture-manager
❌ 直接測試類別 → ✅ 透過 CLI

## 核心模組

1. **Analysis**：複雜度、品質、死代碼
2. **Dependency**：依賴圖、循環檢測（Tarjan）、影響分析（BFS）
3. **Indexing**：1000檔/秒、查詢<10ms
4. **Move**：檔案移動+import更新
5. **Refactor**：提取/內聯函式
6. **Rename**：符號重命名+引用更新
7. **Search**：文字/語義/結構化
8. **ShitScore**：0-100分垃圾度評分
   - **四維度**（30%/30%/30%/20%）：Complexity、Maintainability、Architecture、QualityAssurance
   - QA 子維度：Type Safety 30%、Test Coverage 25%、Error Handling 20%、Naming 15%、Security 10%

## 基礎設施

**Parser**（插件管理/統一AST）、**Cache**（L1/L2/L3、LRU/LFU/TTL）、**Storage**（FS抽象/事務/ACID）、**Utils**（純函式/型別安全）

## Parser 插件

- **TypeScript**：Compiler API、Program 重用
- **JavaScript**：Babel、ES2023+、JSX/Flow
- **Swift**：SwiftSyntax 509+、CLI Bridge

## 介面層

- **CLI**：`agent-ide [index|search|rename|move|analyze|deps|shit]`（Unix哲學/JSON輸出）
- **MCP**：`npx agent-ide-mcp`（Claude Code/Desktop整合，工具：code_*）

## 診斷命令輸出優化

**Token效率**：預設只輸出問題（issues）、`--all` 顯示完整結果（all）、永遠包含統計（summary）

```json
{
  "issues": [...],      // 預設：問題項目
  "all": [...],         // --all：完整結果
  "summary": {...}      // 統計資訊
}
```

## ParserPlugin 介面

**四大類方法**：
1. **核心**：parse/extractSymbols/findReferences/extractDependencies
2. **重構**：rename/extractFunction/findDefinition/findUsages
3. **分析**：detectUnusedSymbols/analyzeComplexity/extractCodeFragments/detectPatterns
4. **品質檢查**：checkTypeSafety/checkErrorHandling/checkSecurity/checkNamingConventions/isTestFile

## 流程

**開發**：規格→API→測試→實作→CLI/MCP→文件
**發布**：`pnpm build && pnpm test` → `npm version patch/minor/major` → `npm publish`

## 架構演進記錄

### 重複代碼檢測整合（2025-01-17）
整合 DuplicationDetector、調整門檻（minLines:3/minTokens:5）、Type-1/2/3 克隆檢測、重複代碼從 0%→實際檢測

### 擴展片段提取與模式檢測（2025-01-18）
新增 4 種片段提取（註解/常數/配置/方法）、5 種模式檢測（try-catch/logger/DI/env/config）、維護性權重調整（deadCode:0.35/largeFile:0.2/duplicateCode:0.2/patternDuplication:0.25）

### ParserPlugin 架構重構（2025-01-24）
語言特定功能從 core/ 遷移至 plugins/、新增 9 個 ParserPlugin 必需方法、所有 analyzers 移至 `plugins/typescript/analyzers/`、測試 220/220 通過、遷移路徑：`core/analysis/*.ts` → `plugins/*/analyzers/*.ts`

### Snapshot 模組實作（2025-01-31）
新增 `core/snapshot/` 程式碼快照系統、支援三種壓縮層級（minimal/medium/full）、增量更新機制（基於檔案 hash）、CLI 命令整合（`agent-ide snapshot`）、配置檔支援（`.agent-ide.json`）、目標：中型專案 ~50K tokens（節省 75%）、核心類別：SnapshotEngine/CodeCompressor/SnapshotDiffer/ConfigManager

## 授權

MIT License
