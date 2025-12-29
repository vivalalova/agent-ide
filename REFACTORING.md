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

### [Phase 1] 結構標準化 (Standardization) ✅ 完成
- [x] **命名一致性**: 將 `src/core/move/move-service.ts` 重命名為 `src/core/move/move-engine.ts`
- [x] **命名一致性**: 將 `change-signature-service.ts` 重命名為 `change-signature-engine.ts`
- [x] **命名一致性**: 將 `move-member-service.ts` 重命名為 `move-member-engine.ts`
- [x] **結構檢查**: `call-hierarchy` 新增 `types.ts`
- [x] **結構檢查**: `find-references` 新增 `types.ts` 和 `reference-finder-engine.ts`

### [Phase 2] 邏輯去重 (Deduplication) ✅ 完成
- [x] **Move 模組分析**: `file-scanner.ts` 保留（功能不同於 foundations，負責 import 路徑解析）
- [x] **Foundations 確認**: `symbol-finder` 已能支援各模組需求

### [Phase 3] 檔案整理 (Cleanup) ✅ 完成
- [x] **Shared 檢查**: `src/shared` 符合規範（僅含 types、errors）
- [x] **Plugins 解耦**: 新增 `infrastructure/parser/initializer.ts` 作為橋接層

### [Phase 4] 測試對齊 (Test Alignment) ✅ 完成
- [x] **E2E 測試**: 所有 9 個 CLI 命令皆有完整覆蓋
- [x] **Unit 測試**: 結構已對齊 `src/`（core/、infrastructure/、plugins/、shared/）

---

## 3. 執行紀錄 (Execution Log)

### 2024-12-29 重構完成

使用 10 個並行 Agent 完成所有重構任務：

| Agent | 任務 | 結果 |
|-------|------|------|
| 1 | `move-service` → `move-engine` | ✅ 完成 |
| 2 | `change-signature-service` → `change-signature-engine` | ✅ 完成 |
| 3 | `move-member-service` → `move-member-engine` | ✅ 完成 |
| 4 | `call-hierarchy` 新增 `types.ts` | ✅ 完成 |
| 5 | `find-references` 結構標準化 | ✅ 完成 |
| 6 | `file-scanner` 去重分析 | ✅ 保留（功能不同） |
| 7 | `shared/` 目錄審查 | ✅ 符合規範 |
| 8 | `core→plugins` 解耦 | ✅ 完成 |
| 9 | Unit 測試結構對齊 | ✅ 完成 |
| 10 | E2E 測試審查 | ✅ 完整覆蓋 |

### 驗證結果

- **Build**: 通過
- **TypeScript**: 通過
- **Lint**: 通過
- **E2E 測試**: 34 files, 763 tests passed
- **Unit 測試**: 44 files, 2061 tests passed
- **總計**: 78 files, 2824 tests passed
