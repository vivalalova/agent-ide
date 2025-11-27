# Analyze 功能說明

> 程式碼品質分析、複雜度評估、死代碼檢測

## 概述

Analyze 模組提供多維度程式碼品質分析，包含複雜度分析、死代碼檢測、最佳實踐檢查、模式識別、綜合品質評估。

---

## 基本用法

```bash
# 複雜度分析（預設）
agent-ide analyze

# 指定分析類型
agent-ide analyze complexity
agent-ide analyze dead-code
agent-ide analyze best-practices
agent-ide analyze patterns
agent-ide analyze quality

# JSON 輸出
agent-ide analyze --format json

# 顯示所有結果（包含無問題項目）
agent-ide analyze --format json --all

# 指定路徑
agent-ide analyze --path src/services
```

---

## 分析類型

### 1. complexity - 複雜度分析

評估程式碼的循環複雜度（Cyclomatic Complexity）與認知複雜度（Cognitive Complexity）。

```bash
agent-ide analyze complexity --format json
```

**指標**：
- 循環複雜度：分支數量（if/switch/loop）
- 認知複雜度：人類理解難度
- 評估等級：low / medium / high

**閾值**：
- 循環複雜度 > 10：標記為問題
- 循環複雜度 > 20：高嚴重性

### 2. dead-code - 死代碼檢測

檢測未使用的函式和變數。

```bash
agent-ide analyze dead-code --format json
```

**檢測範圍**：
- 未使用的函式
- 未使用的變數
- 未使用的 export

### 3. best-practices - 最佳實踐檢查

檢查專案是否遵循最佳實踐。

```bash
agent-ide analyze best-practices --format json
```

**檢查項目**：
- ES Module 使用
- TypeScript 配置
- 專案結構

### 4. patterns - 模式識別

識別程式碼中使用的模式和風格。

```bash
agent-ide analyze patterns --format json
```

**識別模式**：
- async-functions：非同步函式
- promise-usage：Promise 使用
- interface-usage：介面定義
- generic-types：泛型型別
- enum-usage：列舉使用

### 5. quality - 綜合品質評估

綜合評估程式碼品質，輸出 0-100 分數。

```bash
agent-ide analyze quality --format json
```

**評分維度**（權重）：
- 型別安全（30%）
- 測試覆蓋率（25%）
- 錯誤處理（20%）
- 命名規範（15%）
- 安全性（10%）

---

## 輸出格式

### Summary 格式

```
🔍 分析程式碼品質...

複雜度分析報告

統計資訊:
  掃描檔案數: 45
  問題檔案數: 3
  平均複雜度: 4.2
  最高複雜度: 18

問題清單:
  ⚠️ src/services/user.ts - 複雜度 18，認知複雜度 12
  ⚠️ src/controllers/api.ts - 複雜度 15，認知複雜度 9
```

### JSON 格式

```json
{
  "command": "analyze",
  "success": true,
  "analyzeType": "complexity",
  "summary": {
    "totalScanned": 45,
    "issuesFound": 3,
    "averageComplexity": 4.2,
    "maxComplexity": 18
  },
  "issues": [
    {
      "type": "complexity",
      "severity": "medium",
      "message": "複雜度 18，認知複雜度 12",
      "filePath": "src/services/user.ts",
      "score": 18
    }
  ]
}
```

---

## 使用場景

### 1. 識別高複雜度程式碼

```bash
# 找出需要重構的檔案
agent-ide analyze complexity --format json | jq '.issues[] | select(.score > 15)'
```

### 2. 清理死代碼

```bash
# 列出所有未使用的函式
agent-ide analyze dead-code --format json | jq '.issues[] | select(.type == "dead-code")'
```

### 3. 品質評估

```bash
# 取得專案品質分數
agent-ide analyze quality --format json | jq '.metrics.overallScore'
```

### 4. CI/CD 整合

```yaml
- name: Check Code Quality
  run: |
    score=$(agent-ide analyze quality --format json | jq '.metrics.overallScore')
    if [ "$score" -lt 70 ]; then
      echo "Quality score $score is below threshold (70)"
      exit 1
    fi
```

---

## 與其他命令搭配

### analyze + shit

```bash
# analyze 提供細項分析，shit 提供整體評分
agent-ide analyze quality --format json  # 品質維度分數
agent-ide shit --format json             # 綜合垃圾度評分
```

### analyze + deps

```bash
# 結合複雜度和依賴分析
agent-ide analyze complexity --format json > complexity.json
agent-ide deps --format json > deps.json
```

---

## 相關文件

- [ShitScore](SHIT-SCORE.md) - 綜合程式碼品質評分
- [Dependencies](DEPS.md) - 依賴關係分析
- [CLI 使用指南](cli-guide.md)
- [返回首頁](index.md)
