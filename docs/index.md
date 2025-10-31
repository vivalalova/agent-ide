# Agent IDE

> 📝 本文件由 AI Agent 生成

為 AI 代理設計的程式碼智能工具集，提供索引、搜尋、重構、依賴分析等功能。

## 核心特色

- **快速索引**：增量索引，處理速度達 1000 檔案/秒
- **智能搜尋**：符號搜尋、文字搜尋、正則表達式搜尋
- **安全重構**：跨檔案符號重命名，自動更新所有引用
- **依賴分析**：依賴圖建立、循環依賴檢測、影響範圍分析
- **程式碼品質**：複雜度分析、品質評估、最佳實踐檢查
- **自動化**：移動檔案自動更新 import 路徑
- **多層快取**：查詢響應 <50ms
- **插件系統**：支援 TypeScript、JavaScript、Swift（開發中）

## 快速開始

### CLI 安裝

```bash
# 從 npm（發布後）
npm install -g agent-ide

# 從原始碼
git clone https://github.com/vivalalova/agent-ide.git
cd agent-ide
pnpm install && pnpm build && npm link
```

詳細說明請參考 [CLI 使用指南](cli-guide.md)。

## 核心功能

| 功能 | CLI 命令 | 說明 |
|------|---------|------|
| 程式碼索引 | `index` | 建立和管理程式碼索引 |
| 程式碼搜尋 | `search` | 搜尋符號、文字、正則表達式 |
| 符號重命名 | `rename` | 安全重命名，自動更新引用 |
| 檔案移動 | `move` | 移動檔案，自動更新 import |
| 程式碼重構 | `refactor` | 提取/內聯函式 |
| 品質分析 | `analyze` | 複雜度、品質指標分析 |
| 依賴分析 | `deps` | 依賴圖、循環依賴、影響分析 |
| 插件管理 | `plugins` | Parser 插件管理 |

## 效能指標

- **索引速度**：~1000 檔案/秒
- **查詢響應**：<50ms（有快取）、<500ms（無快取）
- **記憶體使用**：~100MB / 10k 檔案
- **並行處理**：支援多執行緒索引
- **快取機制**：L1（記憶體）+ L2（檔案）+ L3（持久化）

## 文件導航

- [CLI 使用指南](cli-guide.md) - 完整的 CLI 命令參考
- [使用範例](examples.md) - 實際使用場景與最佳實踐
- [GitHub Repository](https://github.com/vivalalova/agent-ide) - 原始碼與問題回報

## 架構概覽

```
Agent IDE
├── 核心模組
│   ├── Indexing（索引引擎）
│   ├── Search（搜尋引擎）
│   ├── Rename（重命名引擎）
│   ├── Move（移動服務）
│   ├── Refactor（重構引擎）
│   ├── Analysis（品質分析）
│   └── Dependency（依賴分析）
├── 基礎設施
│   ├── Parser（解析框架）
│   ├── Cache（快取系統）
│   ├── Storage（儲存抽象）
│   └── Utils（工具函式）
├── 插件系統
│   ├── TypeScript Parser
│   ├── JavaScript Parser
│   └── Swift Parser（開發中）
└── 介面層
    └── CLI（命令列介面）
```

## 支援語言

- ✅ TypeScript
- ✅ JavaScript（ES2023+、JSX）
- 🚧 Swift（開發中）

## 開發

```bash
pnpm install      # 安裝依賴
pnpm build        # 建置
pnpm test         # 執行測試（1629 個測試）
pnpm typecheck    # 型別檢查
```

## 授權

MIT License - 查看 [LICENSE](https://github.com/vivalalova/agent-ide/blob/main/LICENSE) 瞭解詳情

## 貢獻

歡迎貢獻！請查看 [貢獻指南](https://github.com/vivalalova/agent-ide/blob/main/CONTRIBUTING.md)

- [回報問題](https://github.com/vivalalova/agent-ide/issues)
- [參與討論](https://github.com/vivalalova/agent-ide/discussions)

---

**讓 AI 代理更聰明地理解和操作程式碼** 🤖✨
