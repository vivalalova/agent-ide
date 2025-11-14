# Indexing 功能說明

> 高效能程式碼索引引擎

## 概述

索引是 agent-ide 核心基礎設施，為所有功能（搜尋、重構、依賴分析）提供資料。

**核心特性**：
- 增量索引（只重新索引變更檔案）
- 多層快取（L1 記憶體、L2 檔案、L3 壓縮）
- 並行處理（多執行緒）
- 語言插件（TypeScript、JavaScript、Swift）

**效能指標**：
- 索引速度：~1000 檔案/秒
- 查詢延遲：<50ms
- 記憶體：~100MB / 10k 檔案
- 快取命中率：>90%

---

## 基本用法

```bash
# 基本索引
agent-ide index --path /path/to/project

# 增量更新
agent-ide index --path /path/to/project --incremental

# 強制重建
agent-ide index --path /path/to/project --force

# 查看狀態
agent-ide index --path /path/to/project --status
```

---

## 索引內容

### 符號索引

記錄所有符號（class、function、variable 等）的名稱、類型、位置、作用域、修飾符、引用位置。

**符號類型**：Class、Interface、Type、Function、Method、Constructor、Variable、Constant、Parameter、Property、Enum、Module

### 依賴索引

記錄檔案間依賴關係：imports、exports、dependencies、dependents。

### 語法索引

記錄 AST、圈複雜度、程式碼行數、Token 數量。

---

## 工作流程

### 初始索引

1. 掃描檔案
2. 過濾檔案（排除 node_modules、.git）
3. 並行解析（Worker Pool）
4. 提取符號
5. 建立索引
6. 寫入快取

### 增量更新

1. 檢測變更（檔案 mtime）
2. 載入快取
3. 只重新解析變更檔案
4. 更新索引
5. 寫入快取

---

## 快取機制

### L1 快取（記憶體）

- 速度：<1ms
- 儲存：最近使用的索引
- 淘汰：LRU
- 大小：預設 50MB

### L2 快取（檔案）

- 速度：<10ms
- 儲存：持久化
- 位置：`.agent-ide/index/`、`.agent-ide/cache/files/`

### L3 快取（壓縮）

- 壓縮率：~70%
- 延遲解壓
- 策略：AST 去重、字串共用池、Delta 編碼、Gzip

---

## 效能優化

### 並行處理

```bash
# 增加並行度
WORKER_COUNT=8 agent-ide index

# 減少並行度（節省記憶體）
WORKER_COUNT=2 agent-ide index
```

**優先級**：Entry points → 高依賴檔案 → 最近修改 → 其他

### 增量索引

只重新索引變更檔案，使用檔案 mtime 快速判斷。

---

## 使用建議

### 何時建立索引

✅ **建議**：
- 專案初始化
- 切換分支後
- 大量檔案變更後
- 重構前

❌ **無需手動**：
- 使用 search 命令（自動索引）
- 單一檔案修改

### 索引維護

```bash
# 清理過期快取（>30天）
agent-ide index --clean --days 30

# 清理所有快取
agent-ide index --clean --all

# 索引統計
agent-ide index --status --detailed
```

---

## 疑難排解

### 索引速度慢

```bash
# 排除不必要目錄
echo "node_modules/\ndist/\n.git/" > .agent-ide-ignore

# 增加 Worker
WORKER_COUNT=8 agent-ide index

# 使用 SSD 存放快取
export AGENT_IDE_CACHE=/path/to/ssd/.agent-ide
```

### 記憶體不足

```bash
# 減少快取
export AGENT_IDE_CACHE_SIZE=20MB

# 減少 Worker
WORKER_COUNT=2 agent-ide index

# 流式索引
agent-ide index --stream
```

### 索引不準確

```bash
# 強制重建
agent-ide index --force

# 清除快取後重建
rm -rf .agent-ide/cache
agent-ide index
```

---

## 進階功能

### 自訂排除規則

**`.agent-ide-ignore`**：

```gitignore
# 測試檔案
**/*.test.ts
**/*.spec.ts

# 建置產物
dist/
build/

# 第三方程式碼
node_modules/
vendor/
```

### 語言插件設定

**`.agent-ide.json`**：

```json
{
  "indexing": {
    "parallel": true,
    "maxWorkers": 4,
    "cacheSize": "50MB",
    "exclude": ["**/*.test.ts"]
  },
  "parsers": {
    "typescript": {
      "strictMode": true,
      "includeDeclarations": true
    },
    "javascript": {
      "jsx": true,
      "flow": false
    }
  }
}
```

---

## 最佳實踐

### 持續維護

```bash
# Git hooks 自動更新索引
# .git/hooks/post-checkout
#!/bin/bash
agent-ide index --incremental
```

### CI/CD 整合

```yaml
- name: Build Index
  run: |
    npm install -g agent-ide
    agent-ide index --path . --force
- name: Check Index Health
  run: |
    agent-ide index --status --format json > index-status.json
```

---

## 相關文件

- [CLI 使用指南](cli-guide.md)
- [返回首頁](index.md)
