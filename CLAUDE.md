# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Agent IDE 專案規範

## 專案概述

Agent IDE 是一個為 AI 代理設計的程式碼智能工具集，提供高效的程式碼操作和分析功能。

### 核心目標
- 最小化 token 使用量
- 最大化操作準確性
- 提供統一的 CLI 和 MCP 介面
- 高度模組化的架構設計

## 實作現況

### ✅ 已完成模組
- **核心業務層** (7/7 模組，33個檔案)
  - ✅ analysis - 複雜度、死代碼、重複檢測
  - ✅ dependency - 依賴分析、循環檢測
  - ✅ indexing - 檔案索引、增量更新
  - ✅ move - 檔案移動、路徑更新
  - ✅ refactor - 提取/內聯函式、設計模式
  - ✅ rename - 符號重新命名、引用更新
  - ✅ search - 多引擎搜尋

- **基礎設施層** (16個檔案)
  - ✅ cache、parser、storage、utils

- **Parser 插件**
  - ✅ TypeScript Parser
  - ⏳ JavaScript、Swift Parser

- **介面層**
  - ✅ CLI、MCP 介面

### 📊 測試狀況
- 60個測試檔案，1410個測試通過
- 執行時間約 4.6 秒

## 常用開發命令

```bash
# 建置和測試
pnpm build
pnpm typecheck
pnpm test
pnpm test:single  # 單一測試（記憶體優化）

# CLI 工具
npm link
agent-ide --help
```

### 環境要求
- Node.js >= 20.0.0
- 使用 pnpm
- TypeScript ES Module

## 架構設計

```
src/
├── core/           # 核心業務邏輯（7個模組）
├── infrastructure/ # 基礎設施層
├── plugins/        # Parser 插件
├── interfaces/     # CLI/MCP 介面
├── application/    # 應用服務層（待實作）
└── shared/         # 共享模組
```

## 開發規範

### TDD 開發流程
1. 紅燈：寫測試，確保失敗
2. 綠燈：最少程式碼通過測試
3. 重構：優化結構

### 程式碼品質
- TypeScript strict mode
- 禁止 any 型別
- 自定義錯誤類別
- 單一職責原則

### 模組化原則
- 單一職責、依賴倒置
- 介面隔離、開放封閉
- 最小知識原則

## CLI 命令

```bash
agent-ide index     # 建立索引
agent-ide rename    # 重新命名
agent-ide move      # 移動檔案
agent-ide search    # 搜尋程式碼
agent-ide analyze   # 分析品質
agent-ide refactor  # 執行重構
agent-ide deps      # 分析依賴
```

## MCP 工具

1. `code_index` - 程式碼索引
2. `code_rename` - 重新命名
3. `code_move` - 移動操作
4. `code_search` - 程式碼搜尋
5. `code_analyze` - 程式碼分析
6. `code_refactor` - 重構操作
7. `code_deps` - 依賴分析

## Parser 插件系統

### 插件介面
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

### 插件管理
```bash
agent-ide plugins list
agent-ide plugins install <name>
agent-ide plugins enable <name>
```

## 開發指南

### 開發前必讀
- `CLAUDE.md` - 專案規範
- `plan.md` - 模組實作計畫

### 新增功能流程
1. 建立功能規格
2. 設計 API
3. 寫測試
4. 實作邏輯
5. 實作 CLI/MCP
6. 更新文件

## 授權

MIT License