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
- [返回首頁](index.md)
