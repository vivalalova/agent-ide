# Quality 功能詳細說明

> 程式碼品質分析工具，提供複雜度、垃圾度、最佳實踐檢查

---

## 概述

Quality 功能提供全方位的程式碼品質分析，包含複雜度檢測、死代碼分析、垃圾度評分等多個維度，幫助團隊維持高品質的程式碼庫。

### 核心特性

- **ShitScore 評分**：0-100 分垃圾度綜合評分（分數越高越糟）
- **複雜度分析**：圈複雜度、認知複雜度、巢狀深度
- **死代碼檢測**：未使用的變數、函數、匯出
- **最佳實踐檢查**：命名規範、錯誤處理、型別安全
- **重複代碼檢測**：Type-1/2/3 克隆檢測

---

## ShitScore 評分系統

### 評分概念

ShitScore 是一個 0-100 的綜合評分，分數**越高代表程式碼越糟糕**，越需要重構。

### 四大維度

| 維度 | 權重 | 說明 |
|------|------|------|
| **Complexity** | 30% | 複雜度垃圾：高圈複雜度、長函式、深層巢狀 |
| **Maintainability** | 30% | 維護性垃圾:死代碼、超大檔案、重複代碼 |
| **Architecture** | 30% | 架構垃圾：循環依賴、孤立檔案、高耦合 |
| **Quality Assurance** | 10% | 品質保證：型別安全、錯誤處理、命名規範 |

### 評級系統

| 評級 | 分數範圍 | 說明 | 建議 |
|------|---------|------|------|
| ✅ **A** | 0-29 | 優秀 | 保持現狀 |
| ⚠️ **B** | 30-49 | 良好 | 小幅優化 |
| 💩 **C** | 50-69 | 需重構 | 安排重構計畫 |
| 💩💩 **D** | 70-84 | 強烈建議重構 | 優先處理 |
| 💩💩💩 **F** | 85-100 | 建議重寫 | 考慮重寫 |

---

## 使用方式

### CLI 命令

```bash
# 基本評分
agent-ide shit --path /path/to/project

# JSON 格式輸出
agent-ide shit --path /path/to/project --format json

# 詳細分析（包含 top shit 和建議）
agent-ide shit --path /path/to/project --detailed --format json

# 顯示前 20 個最糟項目
agent-ide shit --path /path/to/project --detailed --top=20 --format json

# CI/CD 門檻檢查（超過 70 分則失敗）
agent-ide shit --path /path/to/project --max-allowed=70

# 複雜度分析
agent-ide analyze complexity --path /path/to/project --format json

# 死代碼檢測
agent-ide analyze dead-code --path /path/to/project --format json

# 最佳實踐檢查
agent-ide analyze best-practices --path /path/to/project --format json
```

---

## ShitScore 詳細分析

### 基本輸出

```bash
agent-ide shit --format json
```

**輸出**：
```json
{
  "shitScore": 45.23,
  "grade": "B",
  "breakdown": {
    "complexity": {
      "score": 38.5,
      "weight": 0.30,
      "contribution": 11.55
    },
    "maintainability": {
      "score": 52.0,
      "weight": 0.30,
      "contribution": 15.60
    },
    "architecture": {
      "score": 41.2,
      "weight": 0.30,
      "contribution": 12.36
    },
    "qualityAssurance": {
      "score": 57.2,
      "weight": 0.10,
      "contribution": 5.72
    }
  },
  "summary": {
    "totalFiles": 234,
    "analyzedFiles": 198,
    "skippedFiles": 36
  }
}
```

### 詳細輸出（--detailed）

```bash
agent-ide shit --detailed --top=10 --format json
```

**額外資訊**：
```json
{
  "shitScore": 45.23,
  "grade": "B",
  "breakdown": { /* 同上 */ },
  "topShit": [
    {
      "file": "src/legacy/old-service.ts",
      "score": 92.5,
      "issues": [
        {
          "type": "complexity",
          "severity": "high",
          "message": "Cyclomatic complexity: 45 (threshold: 10)"
        },
        {
          "type": "maintainability",
          "severity": "high",
          "message": "File size: 1250 lines (threshold: 500)"
        },
        {
          "type": "qualityAssurance",
          "severity": "medium",
          "message": "15 instances of 'any' type"
        }
      ]
    }
  ],
  "recommendations": [
    {
      "priority": "high",
      "category": "complexity",
      "suggestion": "Refactor 3 functions with complexity > 20",
      "files": ["src/legacy/old-service.ts", "src/utils/helper.ts"]
    },
    {
      "priority": "medium",
      "category": "maintainability",
      "suggestion": "Remove 12 unused exports",
      "files": ["src/api/index.ts", "src/utils/index.ts"]
    }
  ]
}
```

---

## 複雜度分析

### 圈複雜度（Cyclomatic Complexity）

計算程式碼的決策點數量：

```bash
agent-ide analyze complexity --format json
```

**輸出（預設只顯示問題）**：
```json
{
  "summary": {
    "totalFiles": 234,
    "avgComplexity": 5.2,
    "maxComplexity": 45,
    "filesOverThreshold": 8
  },
  "issues": [
    {
      "file": "src/services/payment.service.ts",
      "function": "processPayment",
      "complexity": 45,
      "threshold": 10,
      "severity": "high",
      "location": { "line": 123, "column": 5 }
    },
    {
      "file": "src/utils/validator.ts",
      "function": "validateInput",
      "complexity": 23,
      "threshold": 10,
      "severity": "medium",
      "location": { "line": 45, "column": 3 }
    }
  ]
}
```

**完整輸出（--all）**：
```json
{
  "summary": { /* 同上 */ },
  "issues": [ /* 同上 */ ],
  "all": [
    {
      "file": "src/services/user.service.ts",
      "functions": [
        {
          "name": "getUserById",
          "complexity": 3,
          "status": "ok"
        },
        {
          "name": "createUser",
          "complexity": 7,
          "status": "ok"
        }
      ]
    }
  ]
}
```

### 複雜度門檻

| 複雜度 | 評級 | 說明 | 建議 |
|-------|------|------|------|
| 1-10 | ✅ 簡單 | 容易理解和維護 | 保持 |
| 11-20 | ⚠️ 中等 | 稍微複雜 | 考慮重構 |
| 21-50 | 💩 複雜 | 難以維護 | 建議重構 |
| 50+ | 💩💩💩 極度複雜 | 高風險 | 立即重構 |

### 認知複雜度（Cognitive Complexity）

衡量程式碼的理解難度：

```typescript
// 圈複雜度: 4, 認知複雜度: 7
function complexFunction(a, b, c) {
  if (a) {                    // +1 (cognitive)
    for (let i = 0; i < b; i++) {  // +2 (nested)
      if (c) {                // +3 (nested deeper)
        doSomething();
      }
    }
  }
  return a || b || c;         // +1 (boolean)
}
```

---

## 死代碼檢測

### 未使用的符號

找出專案中未被使用的變數、函數、類別：

```bash
agent-ide analyze dead-code --format json
```

**輸出（預設只顯示問題）**：
```json
{
  "summary": {
    "totalSymbols": 1234,
    "unusedSymbols": 45,
    "unusedExports": 12,
    "estimatedWaste": "450 lines"
  },
  "issues": [
    {
      "file": "src/utils/helper.ts",
      "symbol": "oldHelper",
      "kind": "function",
      "location": { "line": 45, "column": 10 },
      "exported": false,
      "lastModified": "2024-03-15"
    },
    {
      "file": "src/api/index.ts",
      "symbol": "deprecatedAPI",
      "kind": "function",
      "location": { "line": 89, "column": 17 },
      "exported": true,
      "lastModified": "2023-12-01"
    }
  ]
}
```

### 死代碼分類

| 類型 | 說明 | 處理方式 |
|------|------|---------|
| **未使用變數** | 宣告但從未讀取 | 刪除 |
| **未使用函數** | 定義但從未呼叫 | 檢查後刪除 |
| **未使用匯出** | export 但沒有 import | 可能是公開 API |
| **未使用 import** | import 但從未使用 | 刪除 |

---

## 最佳實踐檢查

### 型別安全檢查

檢測 TypeScript 型別使用問題：

```bash
agent-ide analyze best-practices --format json
```

**Type Safety 問題**：
```json
{
  "summary": {
    "totalIssues": 67,
    "typeSafetyScore": 72.3
  },
  "issues": {
    "typeSafety": [
      {
        "file": "src/services/api.ts",
        "line": 45,
        "issue": "any",
        "severity": "high",
        "message": "Using 'any' type reduces type safety",
        "suggestion": "Use specific interface or unknown"
      },
      {
        "file": "src/utils/helper.ts",
        "line": 123,
        "issue": "type-assertion",
        "severity": "medium",
        "message": "Type assertion without validation",
        "suggestion": "Add runtime type check"
      }
    ]
  }
}
```

### 錯誤處理檢查

檢測錯誤處理模式：

```json
{
  "issues": {
    "errorHandling": [
      {
        "file": "src/services/payment.ts",
        "line": 67,
        "issue": "empty-catch",
        "severity": "high",
        "message": "Empty catch block suppresses errors",
        "suggestion": "Log error or rethrow"
      },
      {
        "file": "src/api/user.ts",
        "line": 34,
        "issue": "no-error-handling",
        "severity": "medium",
        "message": "Async function without try-catch",
        "suggestion": "Add error handling"
      }
    ]
  }
}
```

### 命名規範檢查

檢測命名慣例一致性：

```json
{
  "issues": {
    "naming": [
      {
        "file": "src/utils/helper.ts",
        "line": 12,
        "issue": "inconsistent-naming",
        "severity": "low",
        "message": "Variable 'user_id' uses snake_case, expected camelCase",
        "suggestion": "Rename to 'userId'"
      },
      {
        "file": "src/models/User.ts",
        "line": 5,
        "issue": "unclear-name",
        "severity": "medium",
        "message": "Single letter variable 'x' is unclear",
        "suggestion": "Use descriptive name"
      }
    ]
  }
}
```

---

## 重複代碼檢測

### Type-1/2/3 克隆檢測

檢測三種類型的重複代碼：

```bash
agent-ide analyze duplication --format json
```

**輸出**：
```json
{
  "summary": {
    "totalDuplicates": 15,
    "duplicateLines": 234,
    "duplicationRate": 5.2
  },
  "issues": [
    {
      "type": "type-1",
      "description": "Exact clone",
      "instances": [
        {
          "file": "src/services/user.service.ts",
          "startLine": 45,
          "endLine": 67
        },
        {
          "file": "src/services/admin.service.ts",
          "startLine": 89,
          "endLine": 111
        }
      ],
      "suggestion": "Extract to shared function"
    },
    {
      "type": "type-2",
      "description": "Structurally similar",
      "instances": [
        {
          "file": "src/controllers/user.controller.ts",
          "startLine": 23,
          "endLine": 45
        },
        {
          "file": "src/controllers/post.controller.ts",
          "startLine": 34,
          "endLine": 56
        }
      ],
      "suggestion": "Create generic base class"
    }
  ]
}
```

### 重複類型

| 類型 | 說明 | 範例 |
|------|------|------|
| **Type-1** | 完全相同（除空白/註解） | 複製貼上 |
| **Type-2** | 結構相同，變數名不同 | 改名後的複製 |
| **Type-3** | 部分相同，有些語句不同 | 修改後的複製 |

---

## CI/CD 整合

### GitHub Actions

```yaml
name: Code Quality Check

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Install agent-ide
        run: npm install -g agent-ide

      - name: ShitScore Gate
        run: |
          agent-ide shit --format json > shit.json
          score=$(jq '.shitScore' shit.json)
          if (( $(echo "$score > 70" | bc -l) )); then
            echo "::error::ShitScore too high: $score"
            exit 1
          fi

      - name: Complexity Check
        run: |
          agent-ide analyze complexity --format json > complexity.json
          high=$(jq '.summary.filesOverThreshold' complexity.json)
          if [ $high -gt 5 ]; then
            echo "::warning::$high files with high complexity"
          fi

      - name: Dead Code Check
        run: |
          agent-ide analyze dead-code --format json > dead-code.json
          unused=$(jq '.summary.unusedSymbols' dead-code.json)
          if [ $unused -gt 0 ]; then
            echo "::warning::$unused unused symbols found"
          fi

      - name: Upload Reports
        uses: actions/upload-artifact@v2
        with:
          name: quality-reports
          path: |
            shit.json
            complexity.json
            dead-code.json
```

### 門檻設定建議

```yaml
env:
  MAX_SHIT_SCORE: 70        # ShitScore 門檻
  MAX_COMPLEXITY: 20        # 複雜度門檻
  MAX_UNUSED_SYMBOLS: 10    # 未使用符號門檻
  MAX_DUPLICATE_RATE: 10    # 重複率門檻（%）
```

---

## 實用範例

### 1. 找出最需要重構的檔案

```bash
# 使用 detailed 模式
agent-ide shit --detailed --top=10 --format json > shit.json

# 提取 top shit 檔案
cat shit.json | jq '.topShit[].file'

# 輸出：
# "src/legacy/old-service.ts"
# "src/utils/complex-helper.ts"
# "src/api/messy-controller.ts"
```

### 2. 追蹤品質趨勢

```bash
# 定期記錄評分
agent-ide shit --format json > quality-$(date +%Y%m%d).json

# 比較趨勢
jq '.shitScore' quality-20250101.json  # 45.23
jq '.shitScore' quality-20250201.json  # 38.67
# 改善了 6.56 分！
```

### 3. 重構前後對比

```bash
# 重構前
agent-ide shit --format json > before.json

# 執行重構...

# 重構後
agent-ide shit --format json > after.json

# 對比
echo "Before: $(jq '.shitScore' before.json)"
echo "After: $(jq '.shitScore' after.json)"
echo "Improvement: $(jq -n "$(jq '.shitScore' before.json) - $(jq '.shitScore' after.json)")"
```

### 4. 產生重構建議

```bash
# 取得詳細建議
agent-ide shit --detailed --format json | jq '.recommendations'

# 依優先級排序
agent-ide shit --detailed --format json | \
  jq '.recommendations | sort_by(.priority) | reverse'
```

### 5. 清理死代碼

```bash
# 找出所有未使用的符號
agent-ide analyze dead-code --format json | \
  jq '.issues[] | select(.exported == false)'

# 生成刪除腳本
agent-ide analyze dead-code --format json | \
  jq -r '.issues[] | "# Remove \(.symbol) from \(.file):\(.location.line)"'
```

---

## 最佳實踐

### 1. 設定合理門檻

```bash
# ✅ 根據專案現況設定門檻
current_score=$(agent-ide shit --format json | jq '.shitScore')

# 設定目標：每月改善 5 分
target_score=$(echo "$current_score - 5" | bc)

# CI/CD 使用目標分數
agent-ide shit --max-allowed=$target_score
```

### 2. 優先處理高影響問題

```bash
# ✅ 先解決高優先級問題
agent-ide shit --detailed --format json | \
  jq '.recommendations[] | select(.priority == "high")'

# ❌ 不要一次處理所有問題
```

### 3. 定期監控趨勢

```bash
# ✅ 每週記錄品質指標
agent-ide shit --format json > weekly-quality.json

# 建立儀表板追蹤趨勢
```

### 4. 整合到開發流程

```bash
# ✅ Pre-commit hook
# .git/hooks/pre-commit
#!/bin/bash
score=$(agent-ide shit --format json | jq '.shitScore')
if (( $(echo "$score > 80" | bc -l) )); then
  echo "ShitScore too high: $score"
  echo "Please refactor before committing"
  exit 1
fi
```

### 5. 重構後驗證

```bash
# ✅ 重構後確認改善
agent-ide shit --format json > after.json

# 確保各維度都有改善
jq '.breakdown.complexity.score' after.json
jq '.breakdown.maintainability.score' after.json
```

---

## 與其他工具比較

### vs SonarQube

| 特性 | agent-ide | SonarQube |
|------|-----------|-----------|
| 速度 | ⚡⚡⚡ 秒級 | ⚡ 分鐘級 |
| 安裝 | 🟢 npm install | 🔴 需伺服器 |
| CI/CD | ✅ 易整合 | ⚠️ 需配置 |
| 自訂規則 | ❌ | ✅ |
| 視覺化 | ❌ | ✅ |
| 語言支援 | TS/JS | 多語言 |

### vs ESLint

| 特性 | agent-ide | ESLint |
|------|-----------|--------|
| 功能範圍 | 架構+品質 | 語法+風格 |
| 複雜度分析 | ✅ | ⚠️ 插件 |
| 死代碼檢測 | ✅ | ⚠️ 插件 |
| 依賴分析 | ✅ | ❌ |
| 自動修復 | ❌ | ✅ |

**建議**：
- 日常開發 → ESLint（語法檢查）
- 重構決策 → agent-ide（架構分析）
- 品質門檻 → 兩者結合

---

## 總結

Quality 功能提供：

✅ **全方位評估**：
- ShitScore 綜合評分
- 四大維度分析
- 具體改善建議

✅ **實用診斷**：
- 複雜度檢測
- 死代碼識別
- 重複代碼分析

✅ **易於整合**：
- JSON 輸出
- CI/CD 友善
- 門檻可設定

**建議使用時機**：
- 專案健康度檢查
- 重構優先級排序
- 技術債追蹤
- 程式碼審查輔助
