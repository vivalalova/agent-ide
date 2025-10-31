---
name: agent-ide
description: "Comprehensive code intelligence toolkit for AI agents: indexing, search, refactoring, dependency analysis, and quality assessment. Enables safe, automated code improvements with preview modes and quality gates."
version: 1.0.0
---

# Agent-IDE: Code Intelligence Skill

AI 代理程式碼智能工具集：透過 CLI 命令提供索引、搜尋、重構、依賴分析和品質評估功能。

## 🎯 適用場景

使用 agent-ide 處理以下請求：

**分析與理解**
- 「分析這個專案」/「程式碼品質如何？」
- 「顯示專案結構」
- 「找出循環依賴」
- 「檢查死代碼」

**搜尋與發現**
- 「找出所有 UserService 類別」
- 「搜尋驗證邏輯」
- 「顯示這個函式在哪裡被使用」

**安全重構**
- 「重命名 getUserData 為 fetchUserProfile」
- 「移動這個檔案到不同目錄」
- 「抽取重複邏輯」
- 「降低這個函式的複雜度」

**品質改善**
- 「清理死代碼」
- 「改善程式碼品質」
- 「修復循環依賴」
- 「優化這個專案」

## ✅ 使用方式

Agent-ide 透過 **CLI 命令**執行，使用 `npx agent-ide` 調用：

```bash
# 基本格式
npx agent-ide <command> [options]

# 所有命令都支援 JSON 輸出
npx agent-ide <command> --format json
```

## 🛠️ 可用命令

| 命令 | 用途 | 關鍵參數 |
|------|------|----------|
| `snapshot` | 生成專案概覽 | `--path`, `--compression-level` |
| `search` | 搜尋程式碼 | `<query>`, `--type`, `--format` |
| `rename` | 重命名符號 | `--from`, `--to`, `--preview` |
| `move` | 移動檔案+更新import | `<from> <to>`, `--preview` |
| `analyze` | 分析程式碼品質 | `<type>`, `--all`, `--format` |
| `deps` | 依賴關係分析 | `--file`, `--all`, `--format` |
| `shit` | 品質評分 | `--detailed`, `--top`, `--format` |

所有命令都支援 `--format json` 輸出結構化資料。

---

# 📚 核心能力

## 1. 📸 Snapshot 分析

**用途**：快速理解專案結構，無需讀取所有檔案。

**使用時機**：
- 使用者詢問「分析這個專案」/「結構是什麼？」
- 開始重構工作前
- 理解新的程式碼庫

**執行方式**：
```bash
# 生成專案快照
npx agent-ide snapshot --path /path/to/project --compression-level medium --format json

# 壓縮層級選項
# --compression-level minimal  # 最快，僅基本統計
# --compression-level medium   # 平衡，包含結構和關鍵指標（推薦）
# --compression-level full     # 完整，所有符號和依賴關係
```

**輸出包含**：
- `summary`: { totalFiles, totalLines, totalSymbols }
- `structure`: 檔案組織結構
- `dependencies`: import/export 依賴圖
- `quality`: ShitScore、問題清單
- `symbols`: 關鍵類別/函式

**範例互動**：
```
使用者：「分析這個專案」

AI：
1. 執行 npx agent-ide snapshot
2. 呈現摘要：
   - 「找到 234 個檔案、15,234 行、1,570 個符號」
   - 「結構：src/ (services, controllers, models)」
   - 「品質：ShitScore 45.2 (B 級)」
   - 「主要問題：3 個循環依賴、45 個死代碼實例」
3. 根據發現的問題提供後續步驟建議
```

---

## 2. 🔍 智能搜尋

**用途**：三種搜尋模式高效查找程式碼。

**搜尋模式**：

### 文字搜尋（最快）
```bash
npx agent-ide search "TODO" --type text --format json
```
適用：字串、註解、簡單模式

### 符號搜尋（精確）
```bash
npx agent-ide search "UserService" --type symbol --format json

# 指定符號類型
npx agent-ide search "getUserData" --type symbol --symbol-kind function --format json
# symbolKind: class/function/variable/interface
```
適用：查找類別、函式、特定程式碼元素

### 正規表達式搜尋（靈活）
```bash
npx agent-ide search "function.*User" --type regex --format json
```
適用：複雜模式

**範例互動**：

**查找類別**：
```
使用者：「找出所有 Service 類別」

AI：
執行：npx agent-ide search ".*Service" --type symbol --symbol-kind class --format json
→ 返回所有 *Service 類別及其位置
```

**追蹤使用位置**：
```
使用者：「這個 calculateTotal 函式在哪裡被使用？」

AI：
執行：npx agent-ide search "calculateTotal" --type symbol --format json
→ 顯示所有引用位置和上下文
```

---

## 3. ✏️ 安全重構

### Rename（重命名符號）

**用途**：重命名變數/函式/類別，自動更新所有引用。

**🚨 規則**：變數/函式/類別改名時**必須**使用 agent-ide，禁止手動逐一修改。

**執行流程**：
```bash
# 步驟 1：預覽影響範圍
npx agent-ide rename --from oldName --to newName --preview --format json

# 步驟 2：檢查預覽結果
# - 確認影響的檔案數量
# - 檢查是否有命名衝突
# - 評估風險

# 步驟 3：執行重命名
npx agent-ide rename --from oldName --to newName --format json
```

**範例互動**：
```
使用者：「重命名 getUserData 為 fetchUserProfile」

AI：
步驟 1：預覽
npx agent-ide rename --from getUserData --to fetchUserProfile --preview --format json
→ 發現 15 個檔案中有 28 處引用

步驟 2：確認
「將在 15 個檔案中更新 28 處引用。沒有命名衝突。確認執行？」

使用者：「確認」

步驟 3：執行
npx agent-ide rename --from getUserData --to fetchUserProfile --format json
→ 成功更新所有引用

步驟 4：驗證
執行 build/lint 確認沒有錯誤
```

### Move（移動檔案）

**用途**：移動檔案並自動更新所有 import 路徑。

**🚨 規則**：移動檔案時**必須**使用 agent-ide，禁止手動移動後逐一修改 import。

**執行流程**：
```bash
# 步驟 1：預覽影響範圍
npx agent-ide move src/old.ts src/new.ts --preview --format json

# 步驟 2：執行移動
npx agent-ide move src/old.ts src/new.ts --format json
```

**範例互動**：
```
使用者：「移動 user-service.ts 到 services/ 目錄」

AI：
步驟 1：預覽
npx agent-ide move src/user-service.ts src/services/user-service.ts --preview --format json
→ 將更新 12 個檔案的 import 語句

步驟 2：執行
npx agent-ide move src/user-service.ts src/services/user-service.ts --format json
→ 檔案已移動，所有 import 已更新

步驟 3：驗證
執行 build/lint 確認沒有錯誤
```

---

## 4. 🔗 依賴關係分析

**用途**：視覺化依賴關係、檢測循環依賴、分析影響範圍。

**執行方式**：
```bash
# 預設：只顯示問題（循環依賴、孤立檔案）
npx agent-ide deps --format json

# 完整依賴圖（包含所有 nodes 和 edges）
npx agent-ide deps --all --format json

# 查詢特定檔案
npx agent-ide deps --file src/service.ts --format json
```

**輸出結構**：
```json
{
  "summary": {
    "totalFiles": 234,
    "totalDependencies": 567,
    "circularDependencies": 3,
    "orphanFiles": 5
  },
  "issues": [
    {
      "type": "circular",
      "files": ["a.ts", "b.ts", "c.ts"]
    }
  ],
  "all": [  // 僅 --all 時存在
    { "nodes": [...], "edges": [...] }
  ]
}
```

**範例互動**：
```
使用者：「檢查循環依賴」

AI：
執行：npx agent-ide deps --format json
→ 發現 3 個循環依賴：
  1. auth.ts ↔ user.ts
  2. order.ts → payment.ts → invoice.ts → order.ts
  3. ...

建議：
- 循環 1：將共用邏輯抽取到 auth-utils.ts
- 循環 2：引入 dependency injection 打破循環
```

---

## 5. 📊 品質評估

### ShitScore（垃圾度評分）

**用途**：0-100 分綜合品質評分（分數越高越糟糕）。

**評分維度**（四大維度）：
- **Complexity 複雜度**（30%）：高圈複雜度、長函式、深層巢狀、過多參數
- **Maintainability 維護性**（30%）：死代碼、超大檔案、重複代碼
- **Architecture 架構**（30%）：循環依賴、孤立檔案、高耦合
- **QualityAssurance 品質保證**（20%）：
  - Type Safety 型別安全（30%）
  - Test Coverage 測試覆蓋（25%）
  - Error Handling 錯誤處理（20%）
  - Naming 命名規範（15%）
  - Security 安全性（10%）

**評級系統**：
- ✅ **A (0-29)**：優秀
- ⚠️ **B (30-49)**：良好
- 💩 **C (50-69)**：需重構
- 💩💩 **D (70-84)**：強烈建議重構
- 💩💩💩 **F (85-100)**：建議重寫

**執行方式**：
```bash
# 基本評分
npx agent-ide shit --format json

# 詳細分析（包含 topShit 和 recommendations）
npx agent-ide shit --detailed --format json

# 顯示前 20 個最糟項目
npx agent-ide shit --detailed --top=20 --format json

# CI/CD 門檻檢查（超過 70 分則失敗）
npx agent-ide shit --max-allowed=70
```

**範例互動**：
```
使用者：「評估程式碼品質」

AI：
執行：npx agent-ide shit --detailed --format json

結果：
- 總分：58.3 (C 級 - 需重構)
- 複雜度：45.2 (主要問題：3 個高複雜度函式)
- 維護性：67.8 (主要問題：45 個死代碼實例)
- 架構：52.1 (主要問題：3 個循環依賴)
- 品質保證：60.5 (主要問題：型別覆蓋率 65%)

Top 5 最糟檔案：
1. auth-service.ts (ShitScore: 82.3)
   - 圈複雜度 35（建議 <10）
   - 15 個未使用的變數
   - 函式長度 245 行（建議 <50）

建議優先處理：
1. 重構 auth-service.ts 的 validateToken 函式
2. 刪除 45 個未使用的變數/函式
3. 修復 3 個循環依賴
```

### Analyze（分析）

**用途**：針對特定品質維度進行深入分析。

**分析類型**：
```bash
# 複雜度分析（預設只顯示高複雜度檔案）
npx agent-ide analyze complexity --format json

# 顯示所有檔案的複雜度
npx agent-ide analyze complexity --all --format json

# 死代碼檢測（預設只顯示有死代碼的檔案）
npx agent-ide analyze dead-code --format json

# 最佳實踐檢查
npx agent-ide analyze best-practices --format json

# 重複代碼檢測
npx agent-ide analyze duplication --format json
```

---

# 🔄 自動化工作流程

## Workflow 1: 專案診斷

**目的**：全面分析專案，識別所有問題。

**觸發時機**：
- 使用者請求「分析專案」/「檢查品質」
- 開始大規模重構前
- 定期品質審查

**執行步驟**：

```bash
# 步驟 1：生成快照（快速概覽）
npx agent-ide snapshot --path . --compression-level medium --format json

# 步驟 2：品質評分（綜合評估）
npx agent-ide shit --detailed --top=10 --format json

# 步驟 3：依賴分析（架構問題）
npx agent-ide deps --format json

# 步驟 4：複雜度分析（程式碼問題）
npx agent-ide analyze complexity --format json

# 步驟 5：死代碼檢測（維護性問題）
npx agent-ide analyze dead-code --format json
```

**輸出報告**：
```
📊 專案診斷報告

基本資訊：
- 234 個檔案、15,234 行、1,570 個符號
- 主要語言：TypeScript (95%), JavaScript (5%)

品質評分：58.3 (C 級 - 需重構)
├─ 複雜度：45.2/100
├─ 維護性：67.8/100
├─ 架構：52.1/100
└─ 品質保證：60.5/100

🚨 關鍵問題：
1. 循環依賴（3 個）
   - auth.ts ↔ user.ts
   - order.ts → payment.ts → invoice.ts → order.ts

2. 高複雜度函式（5 個）
   - auth-service.ts:validateToken (CC: 35)
   - payment-service.ts:processPayment (CC: 28)

3. 死代碼（45 個實例）
   - 18 個未使用的變數
   - 15 個未使用的函式
   - 12 個未使用的 import

💡 優先建議：
1. 修復循環依賴（影響架構穩定性）
2. 重構高複雜度函式（降低維護成本）
3. 清理死代碼（減少專案體積）
```

---

## Workflow 2: 安全重構

**目的**：確保重構操作安全、可追蹤、可驗證。

**原則**：Preview → Confirm → Execute → Verify

**步驟**：

**1. 預覽階段**
```bash
# Rename 預覽
npx agent-ide rename --from oldName --to newName --preview --format json

# Move 預覽
npx agent-ide move src/old.ts src/new.ts --preview --format json
```

**2. 確認階段**
- 呈現影響範圍給使用者
- 檢查命名衝突
- 評估風險等級
- 等待使用者確認

**3. 執行階段**
```bash
# Rename 執行
npx agent-ide rename --from oldName --to newName --format json

# Move 執行
npx agent-ide move src/old.ts src/new.ts --format json
```

**4. 驗證階段**
```bash
# 執行 build
pnpm build

# 執行 lint
pnpm lint

# 執行測試（如果有）
pnpm test
```

**範例互動**：
```
使用者：「重命名 getUserData 為 fetchUserProfile」

AI：
[預覽階段]
執行：npx agent-ide rename --from getUserData --to fetchUserProfile --preview --format json

預覽結果：
- 影響 15 個檔案中的 28 處引用
- 無命名衝突
- 風險等級：低

[確認階段]
「即將重命名 getUserData → fetchUserProfile：
 - 15 個檔案將被修改
 - 28 處引用將被更新
 - 無命名衝突

確認執行？」

使用者：「確認」

[執行階段]
執行：npx agent-ide rename --from getUserData --to fetchUserProfile --format json
✓ 成功更新 28 處引用

[驗證階段]
執行：pnpm build
✓ Build 成功，無錯誤

執行：pnpm lint
✓ Lint 成功，無警告

重構完成！所有測試通過。
```

---

## Workflow 3: 程式碼清理

**目的**：系統化清理死代碼、提升維護性。

**執行步驟**：

**步驟 1：掃描死代碼**
```bash
npx agent-ide analyze dead-code --format json
```

**步驟 2：分類問題**
- 未使用的變數（安全刪除）
- 未使用的函式（檢查是否為 public API）
- 未使用的 import（安全刪除）
- 未使用的檔案（需確認）

**步驟 3：刪除死代碼**
- 使用 Edit 工具逐項刪除
- 每刪除一批就執行驗證

**步驟 4：驗證**
```bash
pnpm build && pnpm lint && pnpm test
```

**步驟 5：報告改善**
```bash
# 重新評分
npx agent-ide shit --format json
```

**範例互動**：
```
使用者：「清理這個專案的死代碼」

AI：
[步驟 1：掃描]
執行：npx agent-ide analyze dead-code --format json

發現 45 個死代碼實例：
- 18 個未使用的變數
- 15 個未使用的函式
- 12 個未使用的 import

[步驟 2：分類]
安全刪除（42 個）：
- 所有未使用的變數和 import
- 12 個內部函式

需確認（3 個）：
- processLegacyPayment（可能為向後兼容保留）
- exportToCSV（可能為未來功能）
- debugHelper（可能用於開發）

[步驟 3：執行刪除]
刪除 42 個安全項目...
✓ 完成

[步驟 4：驗證]
執行：pnpm build && pnpm lint
✓ 所有檢查通過

[步驟 5：報告]
執行：npx agent-ide shit --format json

改善成果：
- ShitScore：58.3 → 49.7 (C → B)
- 維護性：67.8 → 38.2 (大幅改善)
- 減少代碼量：15,234 → 14,823 行 (-2.7%)

保留 3 個待確認項目，需要您決定是否刪除。
```

---

## Workflow 4: 降低複雜度

**目的**：識別並重構高複雜度函式。

**執行步驟**：

**步驟 1：找出高複雜度函式**
```bash
npx agent-ide analyze complexity --format json
```

**步驟 2：逐一重構**
- 讀取函式內容
- 分析邏輯結構
- 提出重構建議（提取子函式、簡化條件、移除嵌套等）
- 執行重構
- 驗證

**步驟 3：測量改善**
```bash
# 重新分析複雜度
npx agent-ide analyze complexity --format json

# 對比前後 ShitScore
npx agent-ide shit --format json
```

**範例互動**：
```
使用者：「降低 validateToken 函式的複雜度」

AI：
[步驟 1：分析]
執行：npx agent-ide analyze complexity --format json

validateToken (auth-service.ts:45):
- 圈複雜度：35 (建議 <10)
- 函式長度：245 行 (建議 <50)
- 嵌套深度：6 層 (建議 <3)

[步驟 2：重構計劃]
識別出 4 個可抽取的邏輯：
1. Token 格式驗證 → extractTokenFormatValidation()
2. 過期檢查 → checkTokenExpiration()
3. 簽章驗證 → verifyTokenSignature()
4. 權限檢查 → validatePermissions()

[步驟 3：執行重構]
1. 抽取 extractTokenFormatValidation...
2. 抽取 checkTokenExpiration...
3. 抽取 verifyTokenSignature...
4. 抽取 validatePermissions...
5. 簡化主函式邏輯...

[步驟 4：驗證]
執行：pnpm build && pnpm lint && pnpm test
✓ 所有測試通過

[步驟 5：測量改善]
validateToken 新指標：
- 圈複雜度：35 → 8 (-77%)
- 函式長度：245 → 42 行 (-82%)
- 嵌套深度：6 → 2 層 (-66%)

專案整體 ShitScore：58.3 → 52.1 (-10.6%)
```

---

## Workflow 5: 全專案優化

**目的**：系統化改善整個專案品質。

**執行階段**：

### Phase 1: 清理（Quick Wins）
```bash
# 死代碼
npx agent-ide analyze dead-code --format json
# → 刪除所有安全項目

# 未使用的 import
# → 使用 lint --fix 自動清理
```

### Phase 2: 修復架構問題
```bash
# 循環依賴
npx agent-ide deps --format json
# → 逐一修復循環依賴

# 孤立檔案
# → 刪除或整合
```

### Phase 3: 降低複雜度
```bash
# 高複雜度函式
npx agent-ide analyze complexity --format json
# → 按優先級重構（複雜度最高的先處理）
```

### Phase 4: 提升型別安全
```bash
# 檢查 any 使用
npx agent-ide search "any" --type text --format json
# → 替換為具體型別

# 啟用嚴格模式
# → tsconfig.json: strict: true
```

**每個 Phase 後驗證**：
```bash
pnpm build && pnpm lint && pnpm test
npx agent-ide shit --format json  # 追蹤 ShitScore 變化
```

**最終報告**：
```
全專案優化完成

ShitScore 改善：
- 初始：58.3 (C 級)
- 最終：32.1 (B 級)
- 改善：-45%

分項改善：
- 複雜度：45.2 → 28.3 (-37%)
- 維護性：67.8 → 25.4 (-62%)
- 架構：52.1 → 38.7 (-26%)
- 品質保證：60.5 → 35.2 (-42%)

完成項目：
✓ 刪除 45 個死代碼實例
✓ 修復 3 個循環依賴
✓ 重構 5 個高複雜度函式
✓ 提升型別覆蓋率 65% → 92%
✓ 減少代碼量 15,234 → 13,892 行 (-8.8%)
```

---

# 🎯 實戰案例

## 案例 1：抽取重複邏輯

**情境**：多個 Service 類別有相同的錯誤處理邏輯。

**步驟**：

1. **搜尋重複模式**
```bash
npx agent-ide analyze duplication --format json
```

2. **確認重複邏輯**
- 使用 Read 工具讀取相關檔案
- 確認邏輯確實重複

3. **創建共用函式**
- 創建 `src/shared/error-handler.ts`
- 實作 `handleServiceError(error: Error): never`

4. **替換所有使用位置**
- 使用 Edit 工具逐一替換
- 每替換一個檔案就驗證

5. **驗證**
```bash
pnpm build && pnpm lint && pnpm test
```

6. **測量改善**
```bash
npx agent-ide shit --format json
```

---

## 案例 2：API 重命名

**情境**：`getUserById` 改名為 `findUserById` 以符合命名規範。

**步驟**：

1. **預覽影響**
```bash
npx agent-ide rename --from getUserById --to findUserById --preview --format json
```

2. **確認範圍**
- 檢查影響的檔案數
- 確認無命名衝突

3. **執行重命名**
```bash
npx agent-ide rename --from getUserById --to findUserById --format json
```

4. **驗證**
```bash
pnpm build && pnpm lint && pnpm test
```

5. **檢查前端呼叫**
- 搜尋 API 端點 `/api/users/:id`
- 確認前端程式碼無影響（只是內部重命名）

---

## 案例 3：模組化重構

**情境**：將 `auth-service.ts` (800 行) 拆分為多個檔案。

**步驟**：

1. **分析現有結構**
```bash
# 讀取檔案
# 分析符號和邏輯區塊
npx agent-ide search "class.*Auth" --type symbol --format json
```

2. **規劃拆分**
- `auth-service.ts`: 主要 AuthService 類別
- `token-validator.ts`: Token 驗證邏輯
- `password-hasher.ts`: 密碼加密邏輯
- `session-manager.ts`: Session 管理邏輯

3. **創建新檔案**
- 創建 `src/auth/token-validator.ts`
- 創建 `src/auth/password-hasher.ts`
- 創建 `src/auth/session-manager.ts`

4. **移動程式碼**
- 使用 Edit 工具抽取邏輯到新檔案
- 更新 `auth-service.ts` 使用新模組

5. **驗證**
```bash
pnpm build && pnpm lint && pnpm test
```

6. **測量改善**
```bash
npx agent-ide analyze complexity --format json
npx agent-ide shit --format json
```

---

## 案例 4：清理死代碼

**情境**：專案累積大量未使用的程式碼。

**步驟**：參考 **Workflow 3: 程式碼清理**

---

## 案例 5：新增功能（搜尋 + 分析 + 實作）

**情境**：新增「批量匯出使用者資料」功能。

**步驟**：

1. **理解現有架構**
```bash
# 生成快照
npx agent-ide snapshot --path . --compression-level medium --format json

# 搜尋相關邏輯
npx agent-ide search "export" --type symbol --format json
npx agent-ide search "User" --type symbol --symbol-kind class --format json
```

2. **分析依賴關係**
```bash
# 查看 UserService 的依賴
npx agent-ide deps --file src/services/user-service.ts --format json
```

3. **實作新功能**
- 創建 `src/services/export-service.ts`
- 實作 `exportUsers(filters: UserFilter): Promise<Blob>`
- 使用現有的 UserRepository

4. **更新 API**
- 新增 `POST /api/users/export` 端點
- 使用 ExportService

5. **驗證**
```bash
pnpm build && pnpm lint && pnpm test
```

6. **品質檢查**
```bash
# 確保新程式碼品質良好
npx agent-ide analyze complexity --format json
npx agent-ide shit --format json
```

---

## 案例 6：降低複雜度

**情境**：參考 **Workflow 4: 降低複雜度**

---

## 案例 7：全專案重構

**情境**：接手遺留專案，需要全面改善品質。

**步驟**：參考 **Workflow 5: 全專案優化**

---

# 💡 最佳實踐

## 1. 永遠先預覽

**原則**：重構操作前一律使用 `--preview`。

```bash
# ✅ 正確
npx agent-ide rename --from old --to new --preview --format json
# 確認無誤後
npx agent-ide rename --from old --to new --format json

# ❌ 錯誤
npx agent-ide rename --from old --to new --format json  # 直接執行
```

**原因**：預覽可以：
- 評估影響範圍
- 檢測命名衝突
- 降低風險

---

## 2. 小步驟、頻繁驗證

**原則**：每完成一個小改動就驗證。

```bash
# 每次重構後
pnpm build && pnpm lint

# 關鍵重構後
pnpm test
```

**避免**：一次改動 10 個檔案再驗證（難以定位問題）

---

## 3. 追蹤改善

**原則**：記錄 ShitScore 變化。

```bash
# 重構前
npx agent-ide shit --format json > before.json

# 重構後
npx agent-ide shit --format json > after.json

# 對比
# 呈現改善百分比給使用者
```

---

## 4. 組合工具使用

**原則**：診斷時組合多個命令，獲得全面視角。

```bash
# 完整診斷
npx agent-ide snapshot --format json          # 概覽
npx agent-ide shit --detailed --format json   # 品質
npx agent-ide deps --format json              # 架構
npx agent-ide analyze complexity --format json # 複雜度
```

---

## 5. 品質門檻

**原則**：設定 ShitScore 門檻，拒絕低品質程式碼。

```bash
# CI/CD 整合
npx agent-ide shit --max-allowed=70

# 失敗時阻止 merge
```

**建議門檻**：
- 新專案：≤ 40 (B 級)
- 遺留專案：≤ 60 (C 級)
- 關鍵模組：≤ 30 (A 級)

---

## 6. 記錄決策

**原則**：重大重構時記錄原因和影響。

範例：
```
重構決策：拆分 auth-service.ts

原因：
- ShitScore 82.3（單檔最高）
- 圈複雜度 35（遠超標準）
- 800 行（過大）

執行：
- 拆分為 4 個模組
- 抽取 validateToken 等 5 個函式

結果：
- ShitScore：82.3 → 34.2 (-58%)
- 圈複雜度：35 → 平均 6.2 (-82%)
- 行數：800 → 平均 150/檔
```

---

## 7. 清楚溝通

**原則**：向使用者清楚說明每個步驟。

```
✅ 好的溝通：
「即將重命名 getUserData → fetchUserProfile：
 - 影響 15 個檔案
 - 28 處引用將更新
 - 無命名衝突
 - 風險等級：低

確認執行？」

❌ 不好的溝通：
「執行重命名...」
```

---

# 📖 參考資料

完整文件請參考：

- [**實戰指南**](../../../docs/GUIDE.md) - 7 個完整案例
- [Snapshot](../../../docs/SNAPSHOT.md) - 快照功能詳解
- [Search](../../../docs/SEARCH.md) - 搜尋功能詳解
- [Rename](../../../docs/RENAME.md) - 重命名功能詳解
- [Move](../../../docs/MOVE.md) - 移動功能詳解
- [Dependencies](../../../docs/DEPENDENCIES.md) - 依賴分析詳解
- [Quality](../../../docs/QUALITY.md) - ShitScore 詳解

CLI 命令參考：
```bash
npx agent-ide --help
npx agent-ide <command> --help
```

---

**讓 AI 代理更聰明地理解和操作程式碼** 🤖✨
