# Agent IDE 實戰指南

> 組合使用各功能完成實際開發任務

## 概述

展示如何使用 agent-ide 完成程式碼新增、刪除、重構任務。

**核心工作流程**：理解現況 → 分析問題 → 規劃方案 → 執行變更 → 驗證結果

---

## 案例 1：抽取重複邏輯

**情境**：多個 Controller 有相似驗證邏輯，需抽取成共用函數。

```bash
# 1. 檢測重複代碼
npx agent-ide analyze duplication --format json

# 2. 搜尋驗證邏輯
npx agent-ide search "validate.*request" --type regex

# 3. 檢查依賴關係
npx agent-ide deps --file src/controllers/user.controller.ts

# 4. 創建共用函數並更新引用
# 5. 驗證
npm test && npx agent-ide shit --format json
```

**成果**：重複代碼從 3 處→0、ShitScore 52.3→45.8

---

## 案例 2：API 重命名

**情境**：`getUserData` 重命名為 `fetchUserProfile`。

```bash
# 1. 預覽影響範圍
npx agent-ide rename --from getUserData --to fetchUserProfile --dry-run

# 2. 檢查依賴
npx agent-ide deps --file src/api/user.ts

# 3. 執行重命名
npx agent-ide rename --from getUserData --to fetchUserProfile

# 4. 驗證
npm run typecheck && npm test
```

**成果**：自動更新 8 檔案、23 處引用、命名品質 65→85 分

---

## 案例 3：模組化重組

**情境**：`src/api/` 重組為 `src/services/` 結構。

```bash
# 1. 生成快照
npx agent-ide snapshot --path . --output snapshot.json

# 2. 預覽移動
npx agent-ide move src/api/user.ts src/services/user.service.ts --dry-run

# 3. 批量移動
cat > move-list.json << 'EOF'
[
  {"from": "src/api/user.ts", "to": "src/services/user.service.ts"},
  {"from": "src/api/post.ts", "to": "src/services/post.service.ts"}
]
EOF
npx agent-ide move --batch move-list.json

# 4. 檢查循環依賴
npx agent-ide deps --check-cycles

# 5. 驗證
npm run build && npm test
```

**成果**：移動 3 檔案、更新 12 檔案 import、Instability 0.32→0.24

---

## 案例 4：清理死代碼

**情境**：移除未使用的函數、變數、imports。

```bash
# 1. 檢測死代碼
npx agent-ide analyze dead-code --format json > dead-code.json

# 2. 查看詳細資訊
cat dead-code.json | jq '.issues[] | {file, symbol, type}'

# 3. 批量刪除（小心驗證）
# 手動或腳本刪除未使用符號

# 4. 驗證
npm run build && npm test
npx agent-ide analyze dead-code --format json
```

**成果**：刪除 45 符號、450 行代碼、檔案大小減少 18%

---

## 案例 5：開發新功能

**情境**：新增 Pagination 功能。

```bash
# 1. 搜尋現有實作
npx agent-ide search "pagination" --type text

# 2. 查看相關依賴
npx agent-ide deps --file src/utils/pagination.ts

# 3. 實作新功能
# 創建檔案、撰寫程式碼

# 4. 檢查品質
npx agent-ide analyze complexity --file src/utils/pagination.ts
npx agent-ide analyze best-practices --file src/utils/pagination.ts

# 5. 驗證
npm test && npm run build
```

**成果**：新增 3 檔案、120 行、複雜度 <5、測試覆蓋率 95%

---

## 案例 6：降低複雜度

**情境**：`processPayment` 函數複雜度 45，需重構。

```bash
# 1. 分析問題
npx agent-ide analyze complexity --format json > complexity.json
cat complexity.json | jq '.issues[] | select(.complexity > 20)'

# 2. 獲得建議
npx agent-ide shit --detailed --format json | jq '.recommendations'

# 3. 重構：提取函數
# - 提取驗證邏輯 → validatePaymentData()
# - 提取金額計算 → calculateAmount()
# - 提取支付處理 → executePayment()

# 4. 驗證改善
npx agent-ide analyze complexity --file src/services/payment.service.ts
npm test
```

**成果**：複雜度 45→5（降低 89%）、Complexity Score 65.3→28.7

---

## 案例 7：完整重構專案

**情境**：專案 ShitScore 72.5（D級），需全面改善。

### 階段 1：評估現況（5 分鐘）

```bash
npx agent-ide shit --detailed --format json > initial-quality.json
npx agent-ide snapshot --path . --output before.json
npx agent-ide deps --format json > deps-before.json
```

### 階段 2：清理死代碼（15 分鐘）

```bash
npx agent-ide analyze dead-code --format json > dead-code.json
# 刪除 45 符號、450 行
npm test
```

### 階段 3：解決循環依賴（20 分鐘）

```bash
npx agent-ide deps --check-cycles --format json
# 手動重構 3 個循環依賴
```

### 階段 4：降低複雜度（30 分鐘）

```bash
npx agent-ide analyze complexity --format json > complexity.json
cat complexity.json | jq '.issues[] | select(.complexity > 20)'
# 重構 8 個高複雜度函數
```

### 階段 5：改善型別安全（20 分鐘）

```bash
npx agent-ide search "any" --type text --format json
# 替換 46 個 any 型別
npm run typecheck
```

### 階段 6：驗證成果（10 分鐘）

```bash
npx agent-ide shit --detailed --format json > final-quality.json
echo "Before: $(cat initial-quality.json | jq '.shitScore')"
echo "After: $(cat final-quality.json | jq '.shitScore')"
# Before: 72.5 → After: 38.2
```

**成果**：
- ShitScore: 72.5→38.2（改善 47%）、Grade: D→B
- Complexity: 68.2→35.4（-48%）
- Maintainability: 75.0→42.1（-44%）
- Architecture: 71.3→38.5（-46%）

---

## 案例 8：程式碼重排（shift）

**情境**：`src/utils/helpers.ts` 檔案混亂，需重新組織。

```bash
# 1. 檢視結構
cat src/utils/helpers.ts | nl

# 2. 移動型別定義到頂部（第 51-80 行→第 21 行之前）
npx agent-ide shift src/utils/helpers.ts --from 51 --to 80 --position 21

# 3. 提取字串處理函式到新檔案
npx agent-ide shift src/utils/helpers.ts \
  --from 51 --to 80 \
  --target src/utils/string-helpers \
  --position 1

# 4. 提取陣列處理函式
npx agent-ide shift src/utils/helpers.ts \
  --from 51 --to 90 \
  --target src/utils/array-helpers \
  --position 1

# 5. 合併分散的日期函式
npx agent-ide shift src/utils/date.ts \
  --from 10 --to 30 \
  --target src/utils/date-helpers \
  --position 1

# 6. 驗證
wc -l src/utils/*.ts
npx agent-ide search "from.*helpers" --type regex
```

**成果**：
- helpers.ts: 150→20 行
- 新增：string-helpers.ts (30行)、array-helpers.ts (40行)、date-helpers.ts (60行)
- 每個檔案職責單一、大小合理

**Shift vs Move vs Refactor**：
- **shift**：行級移動、不更新引用、快速重排
- **move**：檔案級移動、自動更新 import
- **refactor**：語法級重構、保證正確性

---

## 最佳實踐總結

### 1. 重構前先分析

```bash
# ✅ 好習慣
npx agent-ide shit --detailed --format json
npx agent-ide deps --format json
npx agent-ide analyze complexity

# ❌ 壞習慣：直接動手改
```

### 2. 使用預覽模式

```bash
# ✅ 預覽影響
npx agent-ide rename --from old --to new --dry-run
npx agent-ide move old.ts new.ts --dry-run

# ❌ 直接執行
```

### 3. 小步迭代

```bash
# ✅ 一次一個變更
npx agent-ide rename --from A --to B
npm test
npx agent-ide rename --from C --to D
npm test

# ❌ 大量變更一次完成
```

### 4. 追蹤改善

```bash
# ✅ 記錄前後對比
npx agent-ide shit --format json > before.json
# 執行重構
npx agent-ide shit --format json > after.json
jq -n --slurpfile before before.json --slurpfile after after.json \
  '{before: $before[0].shitScore, after: $after[0].shitScore}'

# ❌ 沒有量化指標
```

---

## 快速參考

### 理解階段

| 任務 | 命令 |
|------|------|
| 快速理解專案 | `snapshot --path .` |
| 搜尋特定模式 | `search "pattern"` |
| 分析依賴關係 | `deps --format json --all` |
| 評估整體品質 | `shit --detailed --format json` |

### 分析階段

| 任務 | 命令 |
|------|------|
| 檢測複雜度 | `analyze complexity` |
| 找出死代碼 | `analyze dead-code` |
| 檢測循環依賴 | `deps --check-cycles` |
| 品質檢查 | `analyze best-practices` |

### 執行階段

| 任務 | 命令 |
|------|------|
| 重命名符號 | `rename --from old --to new --dry-run` |
| 移動檔案 | `move old.ts new.ts --dry-run` |
| 移動程式碼行 | `shift file.ts --from X --to Y --position Z` |
| 查看影響 | `deps --file target.ts` |

### 驗證階段

| 任務 | 命令 |
|------|------|
| 型別檢查 | `npm run typecheck` |
| 執行測試 | `npm test` |
| 檢查品質 | `shit --format json` |
| 對比改善 | `jq '.shitScore' before.json after.json` |

---

## 總結

agent-ide 提供完整工具鏈支援程式碼重構：

- **理解**：snapshot、search、deps 快速掌握現況
- **分析**：analyze、shit 找出問題和改善點
- **執行**：rename、move、shift 安全重構
- **驗證**：quality、test 確保改善

**核心理念**：分析驅動、預覽優先、小步迭代、數據追蹤

---

## CI/CD 整合

### GitHub Actions

```yaml
name: Code Quality Check

on:
  pull_request:
    branches: [ main ]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install Agent IDE
        run: npm install -g agent-ide
      - name: Check Complexity
        run: |
          agent-ide analyze complexity --format json > complexity.json
          HIGH_COMPLEXITY=$(jq '[.data.files[] | select(.complexity.cyclomaticComplexity > 15)] | length' complexity.json)
          if [ "$HIGH_COMPLEXITY" -gt 0 ]; then
            echo "⚠️ 發現高複雜度檔案"
            exit 1
          fi
      - name: Check Circular Dependencies
        run: |
          agent-ide deps --format json > deps.json
          CYCLES=$(jq '.circularDependencies | length' deps.json)
          if [ "$CYCLES" -gt 0 ]; then
            echo "⚠️ 發現循環依賴"
            exit 1
          fi
      - name: Quality Gate
        run: |
          agent-ide shit --max-allowed=70
```

### 門檻檢查

```bash
# 複雜度門檻
agent-ide analyze complexity --format json | jq -e '[.issues[] | select(.complexity > 15)] | length == 0'

# ShitScore 門檻
agent-ide shit --max-allowed=70
```
