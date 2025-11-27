# Dependencies 功能說明

> 依賴關係分析、循環檢測、影響範圍評估

## 概述

Dependencies 模組分析程式碼檔案間的依賴關係，建立依賴圖、檢測循環依賴、評估變更影響範圍。

---

## 基本用法

```bash
# 完整依賴分析
agent-ide deps

# 依賴圖分析
agent-ide deps -t graph

# 循環依賴檢測
agent-ide deps cycles

# 影響範圍分析
agent-ide deps -t impact -f src/services/user.ts

# JSON 輸出
agent-ide deps --format json

# 顯示完整依賴圖
agent-ide deps --format json --all

# DOT 格式（可視化）
agent-ide deps -t graph --format dot > deps.dot
```

---

## 功能說明

### 1. 依賴圖分析

建立完整的檔案依賴關係圖。

**輸出**：
- Nodes：所有檔案
- Edges：依賴關係
- 統計：總檔案數、總依賴數、平均依賴數

### 2. 循環依賴檢測

使用 Tarjan 演算法檢測強連通分量。

**範例**：
```
循環依賴:
  src/services/user.ts
  → src/services/auth.ts
  → src/services/user.ts
```

### 3. 影響範圍分析

使用 BFS 計算變更影響範圍。

**指標**：
- 直接影響：直接依賴此檔案的數量
- 間接影響：間接依賴的數量
- 影響分數：0-10（越高影響越大）

---

## 輸出格式

### Summary 格式

```
依賴關係分析報告

統計資訊:
  總檔案數: 234
  總依賴數: 456
  平均依賴數: 1.95
  最大依賴數: 15 (src/app.ts)

循環依賴: 3 個
孤立檔案: 2 個
```

### JSON 格式

```json
{
  "summary": {
    "totalFiles": 234,
    "totalDependencies": 456,
    "avgDependencies": 1.95
  },
  "cycles": [...],
  "orphans": [...],
  "nodes": [...],
  "edges": [...]
}
```

---

## 使用場景

### 1. 檢測循環依賴

```bash
agent-ide deps cycles --format json
```

### 2. 評估重構影響

```bash
# 移動檔案前評估影響
agent-ide deps -t impact -f src/old.ts
```

### 3. 可視化依賴圖

```bash
# 生成 DOT 檔案
agent-ide deps -t graph --format dot > deps.dot

# 轉換為 PNG（需安裝 graphviz）
dot -Tpng deps.dot -o deps.png
```

### 4. CI/CD 整合

```yaml
- name: Check Circular Dependencies
  run: |
    result=$(agent-ide deps cycles --format json)
    cycles=$(echo "$result" | jq '.cycles | length')
    if [ "$cycles" -gt 0 ]; then
      echo "Found $cycles circular dependencies"
      exit 1
    fi
```

---

## 最佳實踐

### 1. 定期檢查

```bash
# 每週檢查循環依賴
agent-ide deps cycles > cycles-report.txt
```

### 2. 重構前評估

```bash
# 評估影響範圍
agent-ide deps -t impact -f target-file.ts --format json
```

### 3. 追蹤耦合度

```bash
# 記錄耦合度變化
agent-ide deps --format json | jq '.coupling' > coupling-$(date +%Y%m%d).json
```

---

## 相關文件

- [CLI 使用指南](cli-guide.md)
- [實戰指南](GUIDE.md)
- [返回首頁](index.md)
