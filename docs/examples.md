# 使用範例

> 實際使用場景與最佳實踐

## 快速入門

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

---

## 場景 1：專案重構

**目標**：將 `src/services` 重構為 `src/core/services`

```bash
# 1. 分析影響範圍
agent-ide deps -t impact -f src/services --format json > impact.json

# 2. 預覽移動
agent-ide move src/services src/core/services --preview

# 3. 執行移動
agent-ide move src/services src/core/services

# 4. 驗證結果
agent-ide search "from.*services" -t regex --format json

# 5. 檢查循環依賴
agent-ide deps -t cycles
```

---

## 場景 2：程式碼審查

**目標**：審查 `src/services/payment.ts` 程式碼品質

```bash
# 1. 複雜度分析
agent-ide analyze complexity -p src/services/payment.ts

# 2. 品質分析
agent-ide analyze quality -p src/services/payment.ts

# 3. 依賴分析
agent-ide deps -t impact -f src/services/payment.ts

# 4. 搜尋測試
agent-ide search "payment" -t text --include "*.test.*"

# 5. 完整報告
agent-ide analyze all -p src/services/payment.ts --format json > review.json
```

---

## 場景 3：依賴清理

**目標**：修復循環依賴

```bash
# 1. 檢測循環依賴
agent-ide deps -t cycles --format json > cycles.json

# 2. 視覺化依賴圖
agent-ide deps -t graph --format dot > deps.dot
dot -Tpng deps.dot -o deps.png

# 3. 分析影響
for file in $(jq -r '.data.cycles.files[]' cycles.json); do
  agent-ide deps -t impact -f "$file"
done
```

---

## 場景 4：大規模重命名

**目標**：將 `UserService` 重命名為 `UserManager`

```bash
# 1. 搜尋引用
agent-ide search "UserService" --format json > refs.json

# 2. 預覽重命名
agent-ide rename -t class -f UserService -o UserManager --preview

# 3. 執行重命名
agent-ide rename -t class -f UserService -o UserManager

# 4. 驗證結果
agent-ide search "UserManager"
agent-ide search "UserService"  # 應該沒有結果

# 5. 測試
npm test
```

---

## 場景 5：技術債務分析

**目標**：識別技術債務

```bash
# 1. 複雜度分析
agent-ide analyze complexity -p src --format json > complexity.json

# 2. 找出高複雜度檔案
jq '.data.files[] | select(.complexity.cyclomaticComplexity > 10)' complexity.json

# 3. 品質分析
agent-ide analyze quality -p src --format json > quality.json

# 4. 找出低品質檔案
jq '.data.files[] | select(.quality.maintainabilityIndex < 60)' quality.json

# 5. 檢測循環依賴
agent-ide deps -t cycles

# 6. 生成報告
cat complexity.json quality.json | jq -s '.[0] + .[1]' > tech-debt.json
```

---

## 場景 6：程式碼重排

**目標**：整理混亂的檔案結構

```bash
# 1. 檢視結構
cat src/utils/helpers.ts | nl

# 2. 移動型別定義到頂部
agent-ide shift src/utils/helpers.ts --from 50 --to 70 --position 1 --preview

# 3. 執行移動
agent-ide shift src/utils/helpers.ts --from 50 --to 70 --position 1

# 4. 提取工具函式到新檔案
agent-ide shift src/utils/helpers.ts \
  --from 80 --to 120 \
  --target src/utils/string-utils \
  --position 1

# 5. 檢查需要更新的 import
agent-ide search "from.*helpers" --type regex --format json
```

**注意**：shift 不會自動更新 import 引用。

---

## 組合命令

```bash
# 找出高複雜度檔案並分析依賴
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

---

## 自動化腳本

**quality-check.sh**：

```bash
#!/bin/bash
PROJECT_PATH="${1:-.}"
OUTPUT_DIR="./reports"

mkdir -p "$OUTPUT_DIR"

# 建立索引
agent-ide index -p "$PROJECT_PATH"

# 複雜度分析
agent-ide analyze complexity -p "$PROJECT_PATH" --format json > "$OUTPUT_DIR/complexity.json"

# 品質分析
agent-ide analyze quality -p "$PROJECT_PATH" --format json > "$OUTPUT_DIR/quality.json"

# 依賴分析
agent-ide deps -t all --format json > "$OUTPUT_DIR/deps.json"

# 生成報告
cat "$OUTPUT_DIR"/*.json | jq -s '{
  complexity: .[0].data,
  quality: .[1].data,
  dependencies: .[2].data
}' > "$OUTPUT_DIR/report.json"

echo "✓ 報告已生成：$OUTPUT_DIR/report.json"
```

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
      - name: Build Index
        run: agent-ide index -p .
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
          agent-ide deps -t cycles --format json > cycles.json
          CYCLES=$(jq '.data.cycles.circularDependencies' cycles.json)
          if [ "$CYCLES" -gt 0 ]; then
            echo "⚠️ 發現循環依賴"
            exit 1
          fi
```

---

## 最佳實踐

### 1. 索引管理

```bash
# ✅ 定期增量更新
agent-ide index -u

# ❌ 每次完整重建（慢）
agent-ide index
```

### 2. 搜尋策略

```bash
# ✅ 精確搜尋
agent-ide search "UserService" -t symbol -l 10

# ❌ 過於廣泛
agent-ide search "user" -t text
```

### 3. 重構前準備

```bash
# ✅ 先分析、預覽、執行、測試
agent-ide deps -t impact -f src/service.ts
agent-ide rename -f old -o new --preview
agent-ide rename -f old -o new
npm test

# ❌ 直接執行
agent-ide rename -f old -o new
```

### 4. 持續監控

```bash
# ✅ 定期品質檢查
agent-ide analyze complexity | tee complexity-$(date +%Y%m%d).log
```

### 5. 效能優化

```bash
# ✅ 排除不必要目錄
agent-ide index -x "node_modules/**,dist/**"

# ✅ 限制分析範圍
agent-ide analyze -p src/services

# ❌ 分析整個專案（含 node_modules）
agent-ide analyze -p .
```

---

## 相關文件

- [CLI 使用指南](cli-guide.md)
- [返回首頁](index.md)
