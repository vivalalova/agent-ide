# Agent IDE 重構計畫

## 1. 最終願景 (Final Vision)

專案應採用 **Clean Architecture** (整潔架構) 與 **Modular Monolith** (模組化單體) 的混合形式。

### 架構分層
- **Interfaces (`src/interfaces`)**: 外部入口 (CLI, API)。負責參數解析、輸入驗證，但不包含業務邏輯。
- **Application (`src/application`)**: 應用層。負責協調 Core 模組與 Infrastructure，不處理具體 AST 操作。
- **Core (`src/core`)**: 核心業務邏輯 (Domain)。每個功能 (Rename, Move) 都是獨立模組。
    - **Foundations (`src/core/foundations`)**: 跨模組共用的核心邏輯 (Dependency Graph, Symbol Finder)。
- **Infrastructure (`src/infrastructure`)**: 實作細節。File System, Parsers, Formatters。
- **Plugins (`src/plugins`)**: 語言特定實作。Core 透過介面呼叫 Plugins，不直接依賴。

### 標準化規範
1.  **模組結構統一**: 所有 Core 功能模組 (`rename`, `move`, `deadcode`) 應遵循統一結構：
    - `index.ts`: 導出公共介面。
    - `xx-engine.ts`: 核心邏輯 (統一命名為 Engine)。
    - `types.ts`: 模組專用型別。
2.  **共用邏輯收斂**:
    - 移除個別模組中的 `file-scanner` 或 `reference-finder`，改用 `foundations` 或 `symbol-finder`。
3.  **測試對齊**: `tests/` 下的結構應與 `src/` 完全一致。

---

## 2. 待辦事項 (Backlog)

### [Phase 1] 結構標準化 (Standardization)
- [ ] **命名一致性**: 將 `src/core/move/move-service.ts` 重命名為 `src/core/move/move-engine.ts`，與 `rename-engine` 對齊。
- [ ] **結構檢查**: 確保所有 Core 模組 (`change-signature`, `deadcode`, etc.) 都有 `index.ts` 和 `types.ts`。

### [Phase 2] 邏輯去重 (Deduplication)
- [ ] **Move 模組重構**: 檢查 `src/core/move/file-scanner.ts` 是否可由 `src/core/foundations` 取代。
- [ ] **Foundations 增強**: 確保 `symbol-finder` 能支援 `move` 所需的查找邏輯。

### [Phase 3] 檔案整理 (Cleanup)
- [ ] **Shared 檢查**: `src/shared` 是否包含業務邏輯？如果是，移至 `core`。
- [ ] **Plugins 解耦**: 確認 `core` 沒有 hardcode 引用 `plugins/typescript`。

### [Phase 4] 測試對齊 (Test Alignment)
- [ ] 檢查 `tests/unit/core/*` 是否對應 `src/core/*`。

---

## 3. 執行策略 (Execution Strategy)

我將開啟多個 Agent 分別處理：
1. **Agent A (Moves)**: 負責 `move` 模組的標準化與重構 (Rename Service -> Engine, Remove File Scanner)。
2. **Agent B (Structure)**: 負責檢查其他 Core 模組 (`deadcode`, `change-signature`) 的結構一致性。
3. **Agent C (Foundations)**: 負責強化 `foundations` 以支援更多模組的需求。
