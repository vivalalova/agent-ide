# Agent IDE 功能概覽

Agent IDE 是為 AI 代理（例如 Claude Code CLI）打造的程式碼智能工具集，核心目標是 **降低 token 消耗、提升操作精準度**，並提供統一的 CLI/MCP 介面。

## 核心功能
- **程式碼索引**：支援全量與增量索引，整理檔案結構、符號與依賴關係，並提供統計與快取機制。
- **語意搜尋**：結合文字、正則與 AST 搜尋策略，可自訂大小寫、全字匹配、結果數量與上下文輸出。
- **智能重新命名**：跨檔案更新變數、函式、類別與泛型名稱，確保所有引用與引入同步調整。
- **檔案/模組移動**：自動追蹤 import 路徑並重新計算相對位置，減少大規模重構的手動修正成本。
- **依賴分析與影響範圍**：建立依賴圖、偵測循環、量化修改風險，並找出受影響的測試與檔案。
- **重構輔助**：提供提取函式、內聯函式、常見設計模式轉換等操作，協助維持程式碼品質。

## 架構重點
- **模組分層**：`src/core` (業務邏輯)、`infrastructure` (解析器、快取、儲存)、`interfaces` (CLI/MCP)、`plugins` (語言支援) 與 `shared` (共用型別)。
- **可插拔 Parser**：透過 `ParserRegistry` 管理，預設提供 TypeScript/JavaScript，亦可擴充 Swift 或自訂語言插件。
- **測試範圍**：使用 Vitest 覆蓋單元、整合、端對端與效能測試，另提供 `tests/test-utils` 協助建立測試 Parser。

## 典型工作流程
1. `pnpm build` 建置並輸出到 `dist/`。
2. `pnpm test` 或 `pnpm test:coverage` 驗證功能與覆蓋率。
3. 使用 `agent-ide index` 建立專案索引，再透過 `agent-ide search / rename / move` 等命令操作。
4. 若使用 MCP，則由 `AgentIdeMCP` 提供 `code_index`、`code_rename`、`code_move` 等工具給上層代理整合。

## 適用情境
- AI 代理需要高速檢索與重構大型 TypeScript/JavaScript 專案。
- 團隊希望透過統一 CLI 快速定位符號、追蹤依賴並維持程式碼一致性。
- 需在流水線或 IDE 自動化中執行重構／移動／依賴分析作業。

歡迎搭配 `examples/`、`docs/` 與 CLI/MCP 介面，依據實際需求擴充語言解析器或自訂工作流程。
