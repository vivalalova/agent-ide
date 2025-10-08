# 使用範例

> 📝 本文件由 AI Agent 生成

實際使用場景與最佳實踐。

## 目錄

- [快速入門](#快速入門)
- [常見使用場景](#常見使用場景)
  - [場景 1：專案重構](#場景-1專案重構)
  - [場景 2：程式碼審查](#場景-2程式碼審查)
  - [場景 3：依賴關係清理](#場景-3依賴關係清理)
  - [場景 4：大規模重命名](#場景-4大規模重命名)
  - [場景 5：技術債務分析](#場景-5技術債務分析)
- [進階使用](#進階使用)
  - [組合命令](#組合命令)
  - [自動化腳本](#自動化腳本)
  - [CI/CD 整合](#cicd-整合)
- [最佳實踐](#最佳實踐)

## 快速入門

### CLI 快速開始

```bash
# 1. 建立索引
agent-ide index -p /path/to/project

# 2. 搜尋程式碼
agent-ide search "UserService"

# 3. 分析品質
agent-ide analyze -p src/services

# 4. 檢查依賴
agent-ide deps -t cycles
```

### MCP 快速開始

在 Claude Code 中：

```
User: 請為當前專案建立索引
Claude: [執行 code_index create]

User: 搜尋 UserService
Claude: [執行 code_search]

User: 分析程式碼品質
Claude: [執行 code_analyze]
```

## 常見使用場景

### 場景 1：專案重構

**目標**：將 `src/services` 重構為 `src/core/services`，確保所有引用正確更新。

#### 使用 CLI

```bash
# 1. 分析影響範圍
agent-ide deps -t impact -f src/services --format json > impact.json

# 2. 預覽移動操作
agent-ide move src/services src/core/services --preview

# 3. 執行移動
agent-ide move src/services src/core/services

# 4. 驗證結果
agent-ide search "from.*services" -t regex --format json

# 5. 檢查是否有循環依賴
agent-ide deps -t cycles
```

#### 使用 MCP（Claude Code）

```
User: 我想把 src/services 移到 src/core/services，請幫我分析影響並執行

Claude: 好的，讓我先分析影響範圍。

[執行 code_deps]
分析結果：會影響 45 個檔案

讓我預覽移動操作：
[執行 code_move preview]

預覽顯示需要更新 45 個 import 路徑。確認執行嗎？

User: 確認

Claude: 執行移動：
[執行 code_move]
✓ 完成！已更新 45 個檔案的 import 路徑。

讓我檢查是否有循環依賴：
[執行 code_deps cycles]
✓ 沒有循環依賴。

建議執行測試確認功能正常。
```

---

### 場景 2：程式碼審查

**目標**：審查 `src/services/payment.ts` 的程式碼品質。

#### 使用 CLI

```bash
# 1. 複雜度分析
agent-ide analyze complexity -p src/services/payment.ts

# 2. 品質分析
agent-ide analyze quality -p src/services/payment.ts

# 3. 依賴分析
agent-ide deps -t impact -f src/services/payment.ts

# 4. 搜尋相關測試
agent-ide search "payment" -t text --include "*.test.*"

# 5. 生成完整報告
agent-ide analyze all -p src/services/payment.ts --format json > review.json
```

#### 使用 MCP（Claude Code）

```
User: 請審查 src/services/payment.ts 的程式碼品質

Claude: 我來進行完整審查。

1. 複雜度分析
[執行 code_analyze complexity]

結果：
- 循環複雜度: 15 (高)
- 認知複雜度: 20 (高)
- processPayment 函式特別複雜（10）

2. 品質指標
[執行 code_analyze quality]

結果：
- 可維護性指數: 58.3 (C級)
- 程式碼行數: 345
- 註解覆蓋率: 8.5%

3. 依賴分析
[執行 code_deps impact]

結果：
- 直接影響 12 個檔案
- 間接影響 34 個檔案
- 影響分數: 8.5/10 (高)

審查結論：

⚠️ 需要改善的項目：
1. 複雜度過高，建議拆分 processPayment 函式
2. 可維護性指數偏低，建議重構
3. 註解覆蓋率不足，需增加文件
4. 影響範圍大，修改需特別謹慎

建議：
1. 使用策略模式拆分支付邏輯
2. 增加單元測試覆蓋率
3. 補充函式和類別註解
```

---

### 場景 3：依賴關係清理

**目標**：找出並修復專案中的循環依賴。

#### 使用 CLI

```bash
# 1. 檢測循環依賴
agent-ide deps -t cycles --format json > cycles.json

# 2. 視覺化依賴圖
agent-ide deps -t graph --format dot > deps.dot
dot -Tpng deps.dot -o deps.png

# 3. 找出孤立檔案
agent-ide deps -t all | grep "orphaned"

# 4. 分析每個循環依賴的影響
for file in $(jq -r '.data.cycles.files[]' cycles.json); do
  agent-ide deps -t impact -f "$file"
done
```

#### 使用 MCP（Claude Code）

```
User: 幫我找出專案中的循環依賴並提供修復建議

Claude: 我來進行完整的依賴分析。

[執行 code_deps cycles]

⚠️ 發現 3 個循環依賴：

1. src/services/user.ts ⟷ src/services/auth.ts
   [執行 code_search 分析引用]

   原因：
   - UserService 引用 AuthService 進行驗證
   - AuthService 引用 UserService 獲取使用者資料

   修復建議：
   - 建立獨立的 AuthenticationService
   - 使用依賴注入解耦

2. src/models/user.ts ⟷ src/models/post.ts
   [執行 code_search 分析引用]

   原因：
   - User 模型包含 posts: Post[]
   - Post 模型包含 author: User

   修復建議：
   - 使用介面定義關聯
   - 考慮延遲載入

3. src/utils/helper.ts ⟷ src/utils/validator.ts
   [執行 code_search 分析引用]

   原因：
   - helper 使用 validator 驗證資料
   - validator 使用 helper 處理資料

   修復建議：
   - 拆分共用邏輯到獨立模組

需要我協助修復嗎？
```

---

### 場景 4：大規模重命名

**目標**：將 `UserService` 重命名為 `UserManager`，確保所有引用正確更新。

#### 使用 CLI

```bash
# 1. 搜尋所有引用
agent-ide search "UserService" --format json > refs.json

# 2. 預覽重命名
agent-ide rename -t class -f UserService -o UserManager --preview

# 3. 確認後執行
agent-ide rename -t class -f UserService -o UserManager

# 4. 驗證結果
agent-ide search "UserManager"
agent-ide search "UserService"  # 應該沒有結果

# 5. 執行測試
npm test
```

#### 使用 MCP（Claude Code）

```
User: 把 UserService 重命名為 UserManager

Claude: 我來幫你重命名。先建立索引：
[執行 code_index create]

搜尋所有 UserService 引用：
[執行 code_search "UserService"]

找到 23 個引用：
- 1 個類別定義 (src/services/user.ts)
- 15 個 import 語句
- 7 個型別註解

預覽變更：
[執行 code_rename preview]

影響檔案：
1. src/services/user.ts - 類別定義
2. src/controllers/user.ts - import 和使用
3. src/app.ts - import 和初始化
... (還有 20 個檔案)

確認執行嗎？

User: 確認

Claude: 執行重命名：
[執行 code_rename]

✓ 重命名完成！
- 更新了 23 個引用
- 影響 15 個檔案

驗證結果：
[執行 code_search "UserService"]
✓ 沒有找到舊名稱的引用

[執行 code_search "UserManager"]
✓ 找到 23 個新名稱的引用

建議執行測試確認功能正常。
```

---

### 場景 5：技術債務分析

**目標**：識別專案中的技術債務。

#### 使用 CLI

```bash
# 1. 分析所有檔案的複雜度
agent-ide analyze complexity -p src --format json > complexity.json

# 2. 找出高複雜度檔案
jq '.data.files[] | select(.complexity.cyclomaticComplexity > 10)' complexity.json

# 3. 分析品質指標
agent-ide analyze quality -p src --format json > quality.json

# 4. 找出低品質檔案
jq '.data.files[] | select(.quality.maintainabilityIndex < 60)' quality.json

# 5. 檢測循環依賴
agent-ide deps -t cycles

# 6. 生成報告
cat complexity.json quality.json | jq -s '.[0] + .[1]' > tech-debt.json
```

#### 使用 MCP（Claude Code）

```
User: 分析專案的技術債務並提供優化建議

Claude: 我來進行全面的技術債務分析。

1. 複雜度分析
[執行 code_analyze complexity]

高複雜度檔案 (Top 5)：
1. src/services/payment.ts - 循環複雜度 25
2. src/services/order.ts - 循環複雜度 18
3. src/controllers/user.ts - 循環複雜度 15
4. src/utils/validator.ts - 循環複雜度 14
5. src/services/notification.ts - 循環複雜度 12

2. 品質指標分析
[執行 code_analyze quality]

低可維護性檔案 (Top 5)：
1. src/services/payment.ts - 指數 45.2 (D級)
2. src/legacy/processor.ts - 指數 48.8 (D級)
3. src/utils/helper.ts - 指數 52.1 (C級)
4. src/services/order.ts - 指數 55.3 (C級)
5. src/models/complex-model.ts - 指數 57.9 (C級)

3. 依賴關係分析
[執行 code_deps all]

問題：
- 3 個循環依賴
- 8 個孤立檔案
- 5 個高影響檔案（影響分數 > 8）

4. 死代碼檢測
[執行 code_search 未使用的匯出]

發現 12 個未使用的匯出

技術債務總結：

🔴 嚴重問題：
1. src/services/payment.ts - 複雜度極高且可維護性差
2. 3 個循環依賴需要立即處理
3. src/legacy/processor.ts - 遺留程式碼需要重構

🟡 中等問題：
1. 8 個孤立檔案可以移除
2. 12 個未使用的匯出需要清理
3. 5 個檔案註解覆蓋率 < 10%

優化建議（優先順序排序）：

優先級 1（高）：
1. 重構 src/services/payment.ts
   - 拆分為多個小函式
   - 使用策略模式降低複雜度
   - 增加單元測試

2. 解決循環依賴
   - user.ts ⟷ auth.ts
   - models/user.ts ⟷ models/post.ts
   - helper.ts ⟷ validator.ts

優先級 2（中）：
1. 重構 src/services/order.ts
2. 清理 src/legacy/processor.ts 或移除
3. 移除 8 個孤立檔案

優先級 3（低）：
1. 清理 12 個未使用的匯出
2. 補充程式碼註解
3. 提升測試覆蓋率

需要我協助處理任何項目嗎？
```

---

## 進階使用

### 組合命令

使用管道組合多個命令：

```bash
# 找出高複雜度的檔案並分析依賴
agent-ide analyze complexity --format json | \
  jq -r '.data.files[] | select(.complexity.cyclomaticComplexity > 10) | .file' | \
  while read file; do
    echo "=== $file ==="
    agent-ide deps -t impact -f "$file"
  done

# 批次重命名
cat rename-list.txt | while IFS=',' read old new; do
  agent-ide rename -f "$old" -o "$new" --preview
done
```

### 自動化腳本

建立 shell script 自動化常見任務：

**quality-check.sh**

```bash
#!/bin/bash

PROJECT_PATH="${1:-.}"
OUTPUT_DIR="./reports"

mkdir -p "$OUTPUT_DIR"

echo "執行程式碼品質檢查..."

# 1. 建立索引
echo "1. 建立索引..."
agent-ide index -p "$PROJECT_PATH"

# 2. 複雜度分析
echo "2. 分析複雜度..."
agent-ide analyze complexity -p "$PROJECT_PATH" --format json > "$OUTPUT_DIR/complexity.json"

# 3. 品質分析
echo "3. 分析品質..."
agent-ide analyze quality -p "$PROJECT_PATH" --format json > "$OUTPUT_DIR/quality.json"

# 4. 依賴分析
echo "4. 分析依賴..."
agent-ide deps -t all --format json > "$OUTPUT_DIR/deps.json"

# 5. 生成報告
echo "5. 生成報告..."
cat "$OUTPUT_DIR"/*.json | jq -s '{
  complexity: .[0].data,
  quality: .[1].data,
  dependencies: .[2].data
}' > "$OUTPUT_DIR/report.json"

echo "✓ 報告已生成：$OUTPUT_DIR/report.json"
```

**使用方式：**

```bash
chmod +x quality-check.sh
./quality-check.sh /path/to/project
```

### CI/CD 整合

#### GitHub Actions

**.github/workflows/code-quality.yml**

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

      - name: Build Index
        run: agent-ide index -p .

      - name: Check Complexity
        run: |
          agent-ide analyze complexity --format json > complexity.json
          HIGH_COMPLEXITY=$(jq '[.data.files[] | select(.complexity.cyclomaticComplexity > 15)] | length' complexity.json)
          if [ "$HIGH_COMPLEXITY" -gt 0 ]; then
            echo "⚠️ 發現 $HIGH_COMPLEXITY 個高複雜度檔案"
            jq '.data.files[] | select(.complexity.cyclomaticComplexity > 15)' complexity.json
            exit 1
          fi

      - name: Check Circular Dependencies
        run: |
          agent-ide deps -t cycles --format json > cycles.json
          CYCLES=$(jq '.data.cycles.circularDependencies' cycles.json)
          if [ "$CYCLES" -gt 0 ]; then
            echo "⚠️ 發現 $CYCLES 個循環依賴"
            jq '.data.cycles' cycles.json
            exit 1
          fi

      - name: Upload Reports
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: quality-reports
          path: |
            complexity.json
            cycles.json
```

#### GitLab CI

**.gitlab-ci.yml**

```yaml
code_quality:
  stage: test
  image: node:20
  script:
    - npm install -g agent-ide
    - agent-ide index -p .
    - agent-ide analyze complexity --format json > complexity.json
    - agent-ide deps -t cycles --format json > cycles.json
    - |
      HIGH_COMPLEXITY=$(jq '[.data.files[] | select(.complexity.cyclomaticComplexity > 15)] | length' complexity.json)
      if [ "$HIGH_COMPLEXITY" -gt 0 ]; then
        echo "⚠️ 發現高複雜度檔案"
        exit 1
      fi
  artifacts:
    reports:
      codequality:
        - complexity.json
        - cycles.json
    when: always
```

---

## 最佳實踐

### 1. 索引管理

```bash
# ✅ 好的做法
agent-ide index -u  # 定期增量更新

# ❌ 避免
agent-ide index  # 每次都完整重建（慢）
```

### 2. 搜尋策略

```bash
# ✅ 好的做法
agent-ide search "UserService" -t symbol -l 10  # 精確搜尋，限制結果

# ❌ 避免
agent-ide search "user" -t text  # 過於廣泛，結果太多
```

### 3. 重構前準備

```bash
# ✅ 好的做法
# 1. 先分析影響
agent-ide deps -t impact -f src/service.ts

# 2. 預覽變更
agent-ide rename -f old -o new --preview

# 3. 執行變更
agent-ide rename -f old -o new

# 4. 執行測試
npm test

# ❌ 避免
agent-ide rename -f old -o new  # 直接執行，沒有預覽
```

### 4. 持續監控

```bash
# ✅ 好的做法
# 定期執行品質檢查
agent-ide analyze complexity | \
  tee complexity-$(date +%Y%m%d).log

# 追蹤品質趨勢
git log --oneline | head -10 | while read commit msg; do
  git checkout $commit
  agent-ide analyze quality --format json
done > quality-history.json

# ❌ 避免
# 只在出問題時才檢查
```

### 5. 團隊協作

```bash
# ✅ 好的做法
# 建立專案檢查腳本
cat > check-quality.sh <<'EOF'
#!/bin/bash
agent-ide analyze all --format json | \
  jq '.data.quality.grade' | \
  grep -E "^[AB]$" || exit 1
EOF

# 加入 pre-commit hook
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/bash
./check-quality.sh
EOF

# ❌ 避免
# 每個開發者使用不同的檢查標準
```

### 6. 效能優化

```bash
# ✅ 好的做法
# 排除不必要的目錄
agent-ide index -x "node_modules/**,dist/**,coverage/**"

# 限制分析範圍
agent-ide analyze -p src/services  # 只分析特定目錄

# ❌ 避免
agent-ide analyze -p .  # 分析整個專案（包含 node_modules）
```

### 7. 錯誤處理

```bash
# ✅ 好的做法
if agent-ide rename -f old -o new --preview; then
  read -p "確認執行? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    agent-ide rename -f old -o new
  fi
else
  echo "重命名失敗，請檢查錯誤訊息"
  exit 1
fi

# ❌ 避免
agent-ide rename -f old -o new  # 沒有錯誤處理
```

---

## 相關文件

- [CLI 使用指南](cli-guide.md)
- [MCP 使用指南](mcp-guide.md)
- [返回首頁](index.md)
