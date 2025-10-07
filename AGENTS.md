# Repository Guidelines

## 專案結構

```
src/
├── core/           # 7個核心模組（indexing, search, rename, move, refactor, analysis, dependency）
├── infrastructure/ # parser, cache, storage, utils
├── plugins/        # TypeScript, JavaScript, Swift
├── interfaces/     # CLI, MCP
├── application/    # 服務協調層
└── shared/         # types, constants, errors

tests/              # 鏡像 src/ 結構，包含 unit/, integration/, e2e/
bin/                # 可執行檔
dist/               # 建置輸出
docs/               # 文件
```

## 開發指令

```bash
pnpm install        # 安裝依賴（Node.js >= 20）
pnpm build          # TypeScript 建置
pnpm typecheck      # 型別檢查（提交前必跑）
pnpm test           # 執行測試
pnpm test:watch     # 監看模式
pnpm test:single    # 單分支隔離測試
```

## 程式規範

- **語言**：TypeScript strict mode、ES2022 modules、2 空格縮排
- **命名**：檔案 kebab-case、類別 PascalCase、函式/變數 camelCase、常數 SCREAMING_SNAKE_CASE
- **型別**：禁止 `any`、使用自定義錯誤類別
- **匯入**：相對路徑、保持既有註解與雙語描述

## 測試規範

- **框架**：Vitest、AAA 模式、繁體中文描述
- **檔名**：`*.test.ts`
- **覆蓋率**：整體 ≥80%、core/ ≥95%、新功能 100%
- **設定**：timeout 30s、maxConcurrency=3、singleFork=true

## Commit 規範

- **格式**：`<type>: <summary>`（小寫、命令式）
- **類型**：feat, fix, docs, style, refactor, test, chore
- **PR**：包含目的、變更、測試證據、相關議題、截圖

## Agent 工作流程

1. 在 `examples/` 原型化新功能
2. 整合到 `src/interfaces/cli/`
3. 執行 `pnpm build && node bin/agent-ide.js index --path test-project` 冒煙測試
4. 提交前確保所有測試通過
