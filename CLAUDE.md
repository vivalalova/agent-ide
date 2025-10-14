# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

# Agent IDE 專案規範

## 專案概述

為 AI 代理設計的程式碼智能工具集。

**目標**：最小化 token、最大化準確性、CLI + MCP 介面、模組化架構

**現況**：7 個核心模組 ✅、基礎設施 ✅、2 個 Parser ✅（TypeScript、JavaScript）、CLI/MCP ✅、171 個測試通過

## 快速參考

```bash
# 開發環境：Node.js >= 20、pnpm、TypeScript ES Module
pnpm build / typecheck / test / test:single
npm link && agent-ide --help
```

**架構**：
```
src/
├── core/           # 7 個核心模組
├── infrastructure/ # parser、cache、storage、utils
├── plugins/        # TypeScript、JavaScript
├── interfaces/     # CLI、MCP
└── application/    # 服務協調層
```

## 開發規範

- **TDD**：紅燈 → 綠燈 → 重構
- **品質**：TypeScript strict、禁止 any、單一職責
- **模組化**：SOLID、依賴倒置、介面隔離

## 核心模組（7個）

1. **Analysis**：複雜度分析、品質評估、死代碼檢測
2. **Dependency**：依賴圖、循環檢測（Tarjan）、影響分析（BFS）
3. **Indexing**：程式碼索引（1000檔/秒、查詢<10ms）
4. **Move**：檔案移動、import 路徑更新
5. **Refactor**：提取/內聯函式、設計模式轉換
6. **Rename**：符號重命名、引用更新、作用域分析
7. **Search**：文字/語義/結構化搜尋

## 基礎設施

- **Parser**：插件管理、統一 AST、增量解析
- **Cache**：L1/L2/L3、LRU/LFU/TTL
- **Storage**：檔案系統抽象、事務、ACID
- **Utils**：函式式工具、純函式、型別安全

## Parser 插件

- **TypeScript**：Compiler API、Program 重用、Watch 模式
- **JavaScript**：Babel、ES2023+、JSX/Flow

## 介面層

- **CLI**：`agent-ide [index|search|rename|move|analyze|deps]`
  - Unix 哲學、JSON 輸出、管道支援
- **MCP**：`code_[index|search|rename|move|analyze|deps|parser_plugins]`
  - MCP 規範、非同步、工具註冊

## 診斷命令輸出優化（Token 效率）

**目的**：診斷命令（analyze、deps）預設只回傳有問題的程式碼，節省 AI agent 的 token 消耗

**原理**：正常程式碼佔掃描結果的 99%，但 AI agent 通常只關心問題項目

### 預設行為（只輸出問題）

- `analyze complexity`：只輸出 evaluation=high 或 complexity>10 的檔案
- `analyze dead-code`：只輸出有 dead code 的檔案
- `deps`：只輸出循環依賴和孤立檔案

### 完整輸出（`--all` 參數）

```bash
# 顯示所有掃描的檔案
agent-ide analyze complexity --all
agent-ide analyze dead-code --all
agent-ide deps --all
```

### 輸出結構

```json
{
  "issues": [...],      // 預設：只有問題項目
  "all": [...],         // --all：完整掃描結果
  "summary": {          // 統計資訊（永遠存在）
    "totalScanned": 100,
    "issuesFound": 5
  }
}
```

### MCP 對應

- CLI `--all` 對應 MCP `showAll: true`
- 預設 `showAll: false`

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

1. 建立規格 → 2. 設計 API → 3. 寫測試 → 4. 實作 → 5. CLI/MCP → 6. 文件

## 授權

MIT License
