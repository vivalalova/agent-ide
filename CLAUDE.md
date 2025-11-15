# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

# Agent IDE 專案規範

## 專案概述

AI 代理程式碼智能工具集：最小化 token、最大化準確性、CLI 介面、模組化架構

**現況**：10 核心模組、3 Parser（TS/JS/Swift）、1,167 Unit Tests + E2E Tests 通過

## 快速參考

```bash
pnpm build         # 建置（含 Swift parser 複製）
pnpm typecheck     # 型別檢查
pnpm test:unit     # Unit 測試（快速）
pnpm test:e2e      # E2E 測試（完整）
pnpm test:all      # 所有測試
pnpm test:single   # 單執行緒（記憶體受限）
pnpm test:bail     # 失敗即停
pnpm lint          # ESLint
npm link           # 本地 CLI 安裝
```

**架構**：`core/`（10模組）、`infrastructure/`（parser/cache/storage）、`plugins/`（TS/JS/Swift）、`interfaces/`（CLI）、`application/`（服務層）

**路徑映射**：
- `@core/*` → `src/core/*`
- `@infrastructure/*` → `src/infrastructure/*`
- `@shared/*` → `src/shared/*`
- `@plugins/*` → `src/plugins/*`
- `@application/*` → `src/application/*`
- `@interfaces/*` → `src/interfaces/*`

## 開發規範

- **TDD**：紅→綠→重構
- **品質**：TS strict、禁 any、單一職責、SOLID
- **測試策略**：Unit Tests（模組隔離） + E2E Tests（CLI 完整流程）

## 測試規範

### 測試策略

**雙層測試架構**：
1. **Unit Tests** (`tests/unit/**/*.test.ts`)
   - 模組層級的單元測試
   - 使用 vitest + mock
   - 快速執行、高覆蓋率（90%+）
   - 適用於：core、infrastructure 模組

2. **E2E Tests** (`tests/e2e/**/*.e2e.test.ts`)
   - CLI 完整流程測試
   - 使用 fixture-manager + cli-executor
   - 驗證整合行為
   - 適用於：CLI 指令、工作流程

### Unit Test 規範

**原則**：
- 使用 vitest 框架
- 完整的 mock 和隔離
- 涵蓋基本功能、邊界情況、錯誤處理
- 測試檔案位置：`tests/unit/<module>/<file>.test.ts`

**範例**：
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DependencyGraph } from '@core/dependency/dependency-graph';

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  it('應該新增節點', () => {
    graph.addNode('file.ts');
    expect(graph.hasNode('file.ts')).toBe(true);
  });
});
```

### E2E Test 規範

**原則**：
- 透過 CLI 測試完整流程
- Fixture-Based 測試
- 驗證實際輸出和行為

**測試輔助**：
- `fixture-manager.ts`：loadFixture/tempPath/getFilePath/readFile/writeFile/cleanup
- `cli-executor.ts`：executeCLI→{exitCode,stdout,stderr}

**範例**：
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

**Unit Tests**：
- 檔案：`<module>.test.ts`
- describe：模組/類別名稱
- it：`應該<行為>`

**E2E Tests**：
- 檔案：`cli-<command>.e2e.test.ts`
- describe：`CLI <command> - 基於 sample-project fixture`
- it：具體行為+預期結果

### 測試覆蓋率要求

- **Core 模組**：90%+ 語句覆蓋率
- **Infrastructure 模組**：90%+ 語句覆蓋率
- **整體專案**：持續提升

### 常見陷阱

**Unit Tests**：
- ❌ 測試實作細節 → ✅ 測試公開 API
- ❌ 過度 mock → ✅ 適度 mock 外部依賴
- ❌ 測試耦合 → ✅ 測試隔離

**E2E Tests**：
- ❌ 建立自訂 helper → ✅ 用 fixture-manager
- ❌ 直接測試類別 → ✅ 透過 CLI

## 核心模組

1. **Analysis**：複雜度、品質、死代碼
2. **Dependency**：依賴圖、循環檢測（Tarjan）、影響分析（BFS）
3. **Indexing**：1000檔/秒、查詢<10ms
4. **Move**：檔案移動+import更新
5. **Refactor**：提取/內聯函式
6. **Rename**：符號重命名+引用更新
7. **Search**：文字/語義/結構化
8. **Shift**：行級移動（單檔案內/跨檔案/新檔案生成）
9. **ShitScore**：0-100分垃圾度評分
   - **四維度**（30%/30%/30%/20%）：Complexity、Maintainability、Architecture、QualityAssurance
   - QA 子維度：Type Safety 30%、Test Coverage 25%、Error Handling 20%、Naming 15%、Security 10%

## 基礎設施

**Parser**（插件管理/統一AST）、**Cache**（L1/L2/L3、LRU/LFU/TTL）、**Storage**（FS抽象/事務/ACID）、**Utils**（純函式/型別安全）

## Parser 插件

- **TypeScript**：Compiler API、Program 重用
- **JavaScript**：Babel、ES2023+、JSX/Flow
- **Swift**：SwiftSyntax 509+、CLI Bridge

## 介面層

- **CLI**：`agent-ide [search|rename|move|shift|analyze|deps|shit]`（Unix哲學/JSON輸出）

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

**開發**：規格→API→測試→實作→CLI→文件
**發布**：`pnpm build && pnpm test` → `npm version patch/minor/major` → `npm publish`
