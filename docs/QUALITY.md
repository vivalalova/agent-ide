# Quality 功能說明

> 程式碼品質分析與 ShitScore 評分

## 概述

Quality 模組提供多維度程式碼品質分析，包含複雜度、可維護性、架構、QA 四大維度，並整合為 ShitScore 綜合評分（0-100，越高越糟）。

---

## ShitScore 評分系統

### 四大維度權重

1. **Complexity (30%)**：循環複雜度、函式長度、巢狀深度、參數數量
2. **Maintainability (30%)**：死代碼、超大檔案、重複代碼
3. **Architecture (30%)**：循環依賴、孤立檔案、耦合度
4. **QA (20%)**：型別安全、錯誤處理、命名規範、安全性

### 評級系統

| 等級 | 分數 | 評價 | 建議 |
|------|------|------|------|
| A | 0-29 | 優秀 | 維持現況 |
| B | 30-49 | 良好 | 小幅改善 |
| C | 50-69 | 需重構 | 重點改善 |
| D | 70-84 | 強烈建議重構 | 全面重構 |
| F | 85-100 | 建議重寫 | 考慮重寫 |

---

## CLI 使用

```bash
# 基本評分
agent-ide shit

# 詳細分析
agent-ide shit --detailed --format json

# 顯示前 N 個最糟項目
agent-ide shit --detailed --top=20

# CI/CD 門檻檢查
agent-ide shit --max-allowed=70

# 複雜度分析
agent-ide analyze complexity --format json

# 死代碼檢測
agent-ide analyze dead-code --format json

# 最佳實踐檢查
agent-ide analyze best-practices --format json
```

---

## 輸出格式

### 基本格式

```
ShitScore: 45.2 (B級 - 良好)

評分細項:
  Complexity:      38.5
  Maintainability: 42.3
  Architecture:    48.1
  QA:             52.6
```

### JSON 格式

```json
{
  "shitScore": 45.2,
  "grade": "B",
  "breakdown": {
    "complexity": {"score": 38.5, "weight": 0.3},
    "maintainability": {"score": 42.3, "weight": 0.3},
    "architecture": {"score": 48.1, "weight": 0.3},
    "qa": {"score": 52.6, "weight": 0.1}
  },
  "topShit": [...],
  "recommendations": [...]
}
```

---

## 各維度說明

### 1. Complexity（複雜度）

**指標**：
- 循環複雜度 > 10
- 函式長度 > 50 行
- 巢狀深度 > 4 層
- 參數數量 > 5 個

**改善方法**：
- 提取函式降低複雜度
- 拆分長函式
- 減少巢狀層級
- 使用物件參數

### 2. Maintainability（可維護性）

**指標**：
- 死代碼（未使用符號）
- 超大檔案 > 500 行
- 重複代碼

**改善方法**：
- 移除死代碼
- 拆分大檔案
- 抽取共用邏輯

### 3. Architecture（架構）

**指標**：
- 循環依賴
- 孤立檔案
- 高耦合度

**改善方法**：
- 重構循環依賴
- 整合或移除孤立檔案
- 降低耦合度

### 4. QA（品質保證）

**指標**：
- 型別安全（any 使用）
- 錯誤處理缺失
- 命名不規範
- 安全問題

**改善方法**：
- 替換 any 為具體型別
- 新增錯誤處理
- 改善命名
- 修復安全問題

---

## 最佳實踐

### 1. 定期監控

```bash
# 每週檢查
agent-ide shit --detailed --format json > quality-$(date +%Y%m%d).json

# 追蹤趨勢
for file in quality-*.json; do
  echo "$file: $(jq -r '.shitScore' $file)"
done
```

### 2. CI/CD 整合

```yaml
# .github/workflows/quality.yml
- name: Quality Check
  run: |
    npx agent-ide shit --max-allowed=70
    if [ $? -ne 0 ]; then
      echo "Quality threshold exceeded"
      exit 1
    fi
```

### 3. 改善策略

1. **優先處理 F/D 級項目**
2. **從簡單問題開始**（死代碼、命名）
3. **小步迭代，頻繁驗證**
4. **記錄改善成果**

---

## 相關文件

- [CLI 使用指南](cli-guide.md)
- [實戰指南](GUIDE.md)
- [返回首頁](index.md)
