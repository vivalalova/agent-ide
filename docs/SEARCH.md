# Search 功能說明

> 程式碼搜尋引擎：文字、符號、語義三種模式

## 概述

快速精準搜尋，毫秒級返回結構化結果。

**搜尋模式**：
- **文字**：字串/註解搜尋（最快）
- **符號**：類別/函數/變數（最精準）
- **語義**：理解程式碼意圖（最智能）

---

## 基本用法

```bash
# 文字搜尋
agent-ide search "UserService"

# 符號搜尋
agent-ide search "UserService" --type symbol

# 正則表達式
agent-ide search "function.*User" --type regex

# 限制檔案類型
agent-ide search "interface" --file-type ts

# JSON 輸出
agent-ide search "class" --format json
```

---

## 文字搜尋

```bash
# 搜尋字串
agent-ide search "TODO"

# 正則表達式
agent-ide search "function\s+\w+\(" --type regex

# 搜尋 import
agent-ide search "import.*from" --type regex
```

**常用模式**：
- 函數定義：`function\s+\w+`
- 類別定義：`class\s+\w+`
- Import 語句：`import.*from\s+['"](.*)['"]`

---

## 符號搜尋

```bash
# 搜尋類別
agent-ide search "User" --type symbol --symbol-kind class

# 搜尋函數
agent-ide search "get" --type symbol --symbol-kind function

# 搜尋 public 方法
agent-ide search "get" \
  --type symbol \
  --symbol-kind method \
  --modifier public
```

**符號類型**：class、interface、type、function、method、variable、constant、property、enum

**修飾符**：public、private、protected、static、abstract、async、readonly、export

---

## 語義搜尋

理解程式碼意圖，找出功能相似但命名不同的程式碼。

```bash
# 搜尋「取得使用者資料」
agent-ide search "get user data" --type semantic

# 可能找到：
# - getUserById()
# - fetchUserInfo()
# - loadUserData()
```

**適用場景**：
- ✅ 尋找功能相似程式碼
- ✅ 重複邏輯檢測
- ✅ API 使用範例查找
- ❌ 精確符號查找（用符號搜尋）
- ❌ 字串匹配（用文字搜尋）

---

## 進階過濾

```bash
# 檔案類型
agent-ide search "interface" --file-type ts

# 路徑過濾
agent-ide search "Service" --path src/api

# 排除目錄
agent-ide search "TODO" --exclude node_modules

# 只搜尋匯出的符號
agent-ide search "User" --exported-only
```

---

## 輸出格式

### 文字格式（預設）

```
src/api/user.ts:45:12
  class UserService {
```

格式：`檔案路徑:行號:列號` + 程式碼片段

### JSON 格式

```json
{
  "query": "UserService",
  "results": [
    {
      "file": "src/api/user.ts",
      "location": {"line": 45, "column": 12},
      "symbol": {
        "name": "UserService",
        "kind": "class",
        "modifiers": ["export"]
      }
    }
  ],
  "summary": {
    "total": 1,
    "files": 1,
    "duration": "23ms"
  }
}
```

---

## 效能優化

```bash
# 限制結果數量
agent-ide search "function" --limit 10

# 只返回檔案列表
agent-ide search "import" --files-only

# 只統計數量
agent-ide search "TODO" --count-only

# 並行搜尋
WORKER_COUNT=8 agent-ide search "class"
```

---

## 實用範例

### 重構前影響分析

```bash
agent-ide search "oldFunction" --format json > usage.json
cat usage.json | jq '.summary.total'  # 總使用次數
```

### 程式碼品質檢查

```bash
# 找出 any 型別
agent-ide search ": any" --type regex

# 找出 console.log
agent-ide search "console\\." --type regex

# 找出 TODO/FIXME
agent-ide search "(TODO|FIXME)" --type regex
```

### 依賴分析

```bash
# 外部依賴
agent-ide search "import.*from ['\"][^.]" --type regex

# 相對引用
agent-ide search "import.*from ['\"]\\." --type regex
```

---

## 疑難排解

### 搜尋結果不準確

```bash
# 重建索引
agent-ide index --force

# 清除快取
rm -rf .agent-ide/cache

# 文字搜尋驗證
agent-ide search "SymbolName" --type text
```

### 搜尋速度慢

```bash
# 建立索引
agent-ide index

# 限制範圍
agent-ide search "keyword" --path src/

# 減少結果
agent-ide search "keyword" --limit 50
```

---

## 最佳實踐

```bash
# ✅ 精確符號查找
agent-ide search "UserService" --type symbol --symbol-kind class

# ✅ 精確過濾
agent-ide search "getData" \
  --type symbol \
  --symbol-kind method \
  --path src/api

# ✅ 結構化輸出
agent-ide search "interface" --format json | jq '.results | length'

# ❌ 避免過於廣泛搜尋
agent-ide search "user"  # 結果太多
```

---

## 相關文件

- [CLI 使用指南](cli-guide.md)
- [返回首頁](index.md)
