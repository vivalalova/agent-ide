# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Agent IDE 專案規範

## 專案概述

Agent IDE 是一個為 AI 代理設計的程式碼智能工具集，提供高效的程式碼操作和分析功能。

**核心目標**：最小化 token 使用量、最大化操作準確性、提供統一的 CLI 和 MCP 介面、高度模組化架構

## 實作現況

- **核心業務層** (7/7 模組): analysis、dependency、indexing、move、refactor、rename、search ✅
- **基礎設施層**: cache、parser、storage、utils ✅
- **Parser 插件**: TypeScript ✅、JavaScript ✅、Swift ✅
- **介面層**: CLI、MCP ✅
- **應用服務層**: Application Services ✅
- **測試**: 71個檔案、1629個測試通過、執行時間 101秒

## 開發環境

```bash
# 環境要求
Node.js >= 20.0.0、pnpm、TypeScript ES Module

# 常用命令
pnpm build / typecheck / test / test:single
npm link && agent-ide --help
```

## 架構設計

```
src/
├── core/           # 核心業務邏輯（7個模組）
├── infrastructure/ # 基礎設施層
├── plugins/        # Parser 插件
├── interfaces/     # CLI/MCP 介面
├── application/    # 應用服務層 ✅
└── shared/         # 共享模組
```

## 開發規範

- **TDD 流程**: 紅燈 → 綠燈 → 重構
- **程式碼品質**: TypeScript strict mode、禁止 any、自定義錯誤類別、單一職責
- **模組化原則**: SOLID 原則、依賴倒置、介面隔離、最小知識

---

# 核心模組規範

## Analysis 模組 ✅
**功能**: 複雜度分析、品質評估、死代碼檢測、重複程式碼檢測、架構分析
- 檔案: `complexity-analyzer.ts`、`dead-code-detector.ts`、`duplication-detector.ts`、`quality-metrics.ts`
- 原則: 分析準確性、提供可操作建議、增量分析、結果快取

## Dependency 模組 ✅
**功能**: 依賴關係圖、循環依賴檢測（Tarjan 演算法）、影響範圍分析（BFS）、架構優化建議
- 檔案: `dependency-analyzer.ts`、`dependency-graph.ts`、`cycle-detector.ts`
- 原則: 圖論基礎、分析深度、實用性

## Indexing 模組 ✅
**功能**: 程式碼索引、符號查詢、依賴追蹤、檔案監控
- 檔案: `index-engine.ts`、`file-index.ts`、`symbol-index.ts`、`file-watcher.ts`
- 效能: 1000檔案/秒、查詢<10ms、更新<50ms/檔案、<10MB/1000檔案

## Move 模組 ✅
**功能**: 檔案/目錄移動、import/export 路徑自動更新、原子性操作
- 檔案: `move-service.ts`、`import-resolver.ts`
- 流程: 預檢查 → 影響分析 → 執行移動 → 驗證結果

## Refactor 模組 ✅
**功能**: 提取/內聯函式、設計模式轉換、語義保持驗證
- 檔案: `design-patterns.ts`、`extract-function.ts`、`inline-function.ts`
- 原則: 行為保持、安全性、智能化

## Rename 模組 ✅
**功能**: 符號重新命名、引用更新、作用域分析、衝突檢測
- 檔案: `rename-engine.ts`、`reference-updater.ts`、`scope-analyzer.ts`
- 流程: 驗證 → 分析 → 預覽 → 執行 → 驗證

## Search 模組 ✅
**功能**: 文字/語義/結構化搜尋、多引擎支援、智能排序
- 檔案: `service.ts`、`engines/text-engine.ts`
- 原則: 索引優先、漸進式搜尋、結果截斷、最小化 token

---

# 基礎設施層規範

## Parser 框架 ✅
**功能**: 插件管理、統一 AST 模型、增量解析、錯誤恢復
- 檔案: `base.ts`、`factory.ts`、`interface.ts`、`registry.ts`
- 特性: 動態載入、沙箱執行、版本管理、熱更新

## Cache 基礎設施 ✅
**功能**: 多層快取（L1記憶體/L2磁碟/L3分散式）、LRU/LFU/TTL策略、失效管理
- 檔案: `cache-manager.ts`、`memory-cache.ts`、`strategies.ts`

## Storage 基礎設施 ✅
**功能**: 檔案系統抽象、事務管理、檔案監控、ACID支援
- 檔案: `file-system.ts`、`file-watcher.ts`、`path-utils.ts`

## Utils 工具模組 ✅
**功能**: 字串/陣列/物件/非同步/檔案/加密/驗證/日誌工具
- 原則: 函式式設計、純函式、型別安全、程式碼重用

---

# 插件系統規範

## TypeScript Parser ✅
**技術**: TypeScript Compiler API
- 特性: Program 重用、SourceFile 快取、Watch 模式、增量編譯
- 檔案: `parser.ts`、`symbol-extractor.ts`、`dependency-analyzer.ts`

## JavaScript Parser ✅
**技術**: Babel (@babel/parser、traverse、types、generator)
- 特性: ES2023+支援、JSX/Flow、Decorators、Top-level await

## Swift Parser ✅
**技術**: tree-sitter-swift
- 特性: Swift 5.x、SwiftUI DSL、Async/Await、Actors、Macros

---

# 介面層規範

## CLI 介面 ✅
**命令**: `agent-ide [index|rename|move|search|analyze|refactor|deps]`
- 原則: Unix 哲學、管道支援、JSON 輸出、最小化 token
- 特性: 互動模式、進度顯示、批次處理

## MCP 介面 ✅
**工具**: `code_[index|rename|move|search|analyze|refactor|deps]`
- 原則: MCP 規範符合、非同步處理、認證授權、速率限制
- 特性: 工具註冊、資源管理、提示機制

---

# Application Services ✅

**功能**: 模組協調、工作流程引擎、會話管理、快取協調、錯誤處理
- **已實作**: EventBus 事件系統、StateManager 狀態管理、ErrorHandler 錯誤處理、SessionManager 會話管理、CacheCoordinator 快取協調、ModuleCoordinator 模組協調、WorkflowEngine 工作流程引擎
- **測試覆蓋**: 184個測試全部通過（100%）
- 原則: 業務邏輯協調、效能優化、可靠性保證、擴展性設計

---

# 開發指南

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
1. 建立功能規格 → 2. 設計 API → 3. 寫測試 → 4. 實作邏輯 → 5. 實作 CLI/MCP → 6. 更新文件

## 授權
MIT License