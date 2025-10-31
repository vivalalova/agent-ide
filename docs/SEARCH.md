# Search 功能詳細說明

> 強大的程式碼搜尋引擎，支援文字、符號、語義三種搜尋模式

---

## 概述

Search 功能提供快速、精準的程式碼搜尋能力，遠超傳統的 grep 工具。透過索引和語法分析，能在毫秒級返回結構化的搜尋結果。

### 三種搜尋模式

| 模式 | 用途 | 速度 | 精準度 |
|------|------|------|--------|
| **文字搜尋** | 搜尋字串、註解 | ⚡⚡⚡ | ⭐⭐ |
| **符號搜尋** | 搜尋類別、函數、變數 | ⚡⚡ | ⭐⭐⭐ |
| **語義搜尋** | 理解程式碼意圖 | ⚡ | ⭐⭐⭐⭐ |

---

## 使用方式

### CLI 命令

```bash
# 文字搜尋（預設）
agent-ide search "UserService"

# 符號搜尋
agent-ide search "UserService" --type symbol

# 正規表達式
agent-ide search "function.*User" --type regex

# 限制檔案類型
agent-ide search "interface" --file-type ts

# 限制結果數量
agent-ide search "import" --limit 10

# JSON 輸出
agent-ide search "class" --format json
```

---

## 文字搜尋

### 基本文字搜尋

最快速的搜尋方式，直接匹配字串：

```bash
# 搜尋字串
agent-ide search "TODO"

# 結果範例：
# src/api/user.ts:45
#   // TODO: Add validation
#
# src/utils/helper.ts:123
#   // TODO: Refactor this function
```

### 正規表達式搜尋

支援完整的正規表達式語法：

```bash
# 搜尋函數定義
agent-ide search "function\s+\w+\(" --type regex

# 搜尋 import 語句
agent-ide search "import\s+.*\s+from\s+['\"].*['\"]" --type regex

# 搜尋特定模式
agent-ide search "export\s+(default\s+)?(class|function|const)" --type regex
```

**常用正規表達式**：

| 模式 | 正規表達式 | 說明 |
|------|------------|------|
| 函數定義 | `function\s+\w+` | 匹配函數名稱 |
| 類別定義 | `class\s+\w+` | 匹配類別名稱 |
| Import 語句 | `import.*from\s+['"](.*)['"]` | 擷取 import 路徑 |
| 註解 | `//\s*(.*)` | 擷取單行註解 |
| 變數宣告 | `(const|let|var)\s+\w+` | 匹配變數宣告 |

---

## 符號搜尋

### 基本符號搜尋

搜尋特定類型的符號：

```bash
# 搜尋所有類別
agent-ide search "User" --type symbol --symbol-kind class

# 搜尋所有函數
agent-ide search "get" --type symbol --symbol-kind function

# 搜尋所有介面
agent-ide search ".*Service" --type symbol --symbol-kind interface
```

### 符號類型

支援的符號類型：

| SymbolKind | 說明 | 範例 |
|------------|------|------|
| `class` | 類別 | `class UserService` |
| `interface` | 介面 | `interface IUser` |
| `type` | 型別別名 | `type UserId = string` |
| `function` | 函數 | `function getData()` |
| `method` | 方法 | `getUserById()` |
| `variable` | 變數 | `const config` |
| `constant` | 常數 | `const MAX_SIZE` |
| `property` | 屬性 | `class { name: string }` |
| `enum` | 列舉 | `enum Status` |

### 修飾符過濾

根據修飾符過濾結果：

```bash
# 搜尋 public 方法
agent-ide search "get" \
  --type symbol \
  --symbol-kind method \
  --modifier public

# 搜尋 static 方法
agent-ide search "create" \
  --type symbol \
  --symbol-kind method \
  --modifier static

# 搜尋 async 函數
agent-ide search "fetch" \
  --type symbol \
  --symbol-kind function \
  --modifier async
```

**支援的修飾符**：
- `public`, `private`, `protected`
- `static`, `abstract`
- `async`, `readonly`
- `export`, `default`

---

## 語義搜尋

### 概念

語義搜尋理解程式碼的**意圖**而非字面文字，能找到功能相似但命名不同的程式碼。

### 使用方式

```bash
# 搜尋「取得使用者資料」的相關程式碼
agent-ide search "get user data" --type semantic

# 可能找到：
# - getUserById()
# - fetchUserInfo()
# - loadUserData()
# - retrieveUserDetails()
```

### 適用場景

✅ **推薦使用**：
- 尋找功能相似的程式碼
- 重複邏輯檢測
- API 使用範例查找
- 重構候選項識別

❌ **不推薦使用**：
- 精確符號查找（用符號搜尋）
- 字串匹配（用文字搜尋）
- 大量結果場景（速度較慢）

---

## 進階過濾

### 檔案類型過濾

```bash
# 只搜尋 TypeScript 檔案
agent-ide search "interface" --file-type ts

# 只搜尋 JavaScript 檔案
agent-ide search "export" --file-type js

# 搜尋測試檔案
agent-ide search "describe" --file-pattern "**/*.test.ts"

# 排除測試檔案
agent-ide search "class" --exclude "**/*.test.ts"
```

### 路徑過濾

```bash
# 只搜尋特定目錄
agent-ide search "Service" --path src/api

# 排除特定目錄
agent-ide search "TODO" --exclude node_modules --exclude dist

# 使用 glob 模式
agent-ide search "interface" --pattern "src/**/*.ts"
```

### 範圍過濾

```bash
# 只搜尋匯出的符號
agent-ide search "User" --exported-only

# 只搜尋特定作用域
agent-ide search "config" --scope global

# 搜尋特定模組內的符號
agent-ide search "helper" --module utils
```

---

## 搜尋結果格式

### 文字格式（預設）

```
src/api/user.ts:45:12
  class UserService {

src/services/auth.ts:23:8
  export class UserService extends BaseService {
```

**格式說明**：
- 第一行：`檔案路徑:行號:列號`
- 第二行：匹配的程式碼片段
- 空行分隔不同結果

### JSON 格式

```json
{
  "query": "UserService",
  "type": "symbol",
  "results": [
    {
      "file": "src/api/user.ts",
      "location": {
        "line": 45,
        "column": 12
      },
      "symbol": {
        "name": "UserService",
        "kind": "class",
        "modifiers": ["export"],
        "documentation": "User management service"
      },
      "context": "export class UserService extends BaseService {"
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

### 使用索引加速

搜尋會自動使用索引，但可以手動控制：

```bash
# 強制使用索引（更快但需先建立索引）
agent-ide search "User" --use-index

# 強制不使用索引（適合一次性搜尋）
agent-ide search "User" --no-index

# 自動選擇（預設）
agent-ide search "User"
```

### 限制結果數量

```bash
# 限制 10 個結果（更快）
agent-ide search "function" --limit 10

# 快速預覽（只返回檔案列表）
agent-ide search "import" --files-only

# 只統計數量（最快）
agent-ide search "TODO" --count-only
```

### 並行搜尋

```bash
# 增加並行度（適合大型專案）
WORKER_COUNT=8 agent-ide search "class"

# 減少並行度（節省記憶體）
WORKER_COUNT=2 agent-ide search "interface"
```

---

## 實用範例

### 1. 尋找未使用的匯出

```bash
# 找出所有匯出的符號
agent-ide search "export" --type symbol > exported.txt

# 找出所有 import 語句
agent-ide search "import.*from" --type regex > imports.txt

# 比較兩個列表找出未使用的匯出
```

### 2. 重構前的影響分析

```bash
# 搜尋所有使用 oldFunction 的地方
agent-ide search "oldFunction" --format json > usage.json

# 分析結果統計
cat usage.json | jq '.summary.total'  # 總使用次數
cat usage.json | jq '.summary.files'  # 影響檔案數
```

### 3. API 使用範例查找

```bash
# 找出 fetch API 的所有使用範例
agent-ide search "fetch(" --type regex --context 5

# 找出特定 Hook 的使用
agent-ide search "useEffect" --type symbol --context 10
```

### 4. 程式碼品質檢查

```bash
# 找出所有 any 型別
agent-ide search ": any" --type regex

# 找出所有 console.log
agent-ide search "console\\." --type regex

# 找出所有 TODO/FIXME
agent-ide search "(TODO|FIXME)" --type regex
```

### 5. 依賴分析

```bash
# 找出所有 import React
agent-ide search "import.*from ['\"]react['\"]" --type regex

# 找出所有外部依賴
agent-ide search "import.*from ['\"][^.]" --type regex

# 找出所有相對引用
agent-ide search "import.*from ['\"]\\." --type regex
```

---

## 與其他工具比較

### vs grep

| 特性 | agent-ide search | grep |
|------|------------------|------|
| 速度 | ⚡⚡⚡（有索引） | ⚡⚡ |
| 符號理解 | ✅ | ❌ |
| 型別感知 | ✅ | ❌ |
| 結構化輸出 | ✅ | ❌ |
| 語義搜尋 | ✅ | ❌ |

### vs ripgrep (rg)

| 特性 | agent-ide search | ripgrep |
|------|------------------|---------|
| 速度 | ⚡⚡⚡ | ⚡⚡⚡⚡ |
| 語法理解 | ✅ | ❌ |
| 符號過濾 | ✅ | ❌ |
| 快取機制 | ✅ | ❌ |
| 依賴追蹤 | ✅ | ❌ |

**建議**：
- 簡單文字搜尋 → 使用 ripgrep
- 符號、型別、語義搜尋 → 使用 agent-ide
- 需要結構化輸出 → 使用 agent-ide

---

## 疑難排解

### 搜尋結果不準確

**問題**：找不到明明存在的符號

**解決方法**：
```bash
# 1. 重建索引
agent-ide index --force

# 2. 清除快取
rm -rf .agent-ide/cache

# 3. 使用文字搜尋驗證
agent-ide search "SymbolName" --type text
```

### 搜尋速度慢

**問題**：搜尋耗時過長

**解決方法**：
```bash
# 1. 建立索引
agent-ide index

# 2. 限制搜尋範圍
agent-ide search "keyword" --path src/

# 3. 減少結果數量
agent-ide search "keyword" --limit 50

# 4. 使用檔案過濾
agent-ide search "keyword" --file-type ts
```

### 記憶體不足

**問題**：大型專案搜尋時記憶體不足

**解決方法**：
```bash
# 1. 使用流式搜尋
agent-ide search "keyword" --stream

# 2. 減少並行度
WORKER_COUNT=1 agent-ide search "keyword"

# 3. 分批搜尋
agent-ide search "keyword" --path src/api
agent-ide search "keyword" --path src/services
```

---

## 最佳實踐

### 1. 選擇合適的搜尋模式

```bash
# ✅ 精確符號查找
agent-ide search "UserService" --type symbol --symbol-kind class

# ❌ 使用文字搜尋查找符號（可能有誤判）
agent-ide search "UserService"
```

### 2. 善用過濾器減少結果

```bash
# ✅ 精確過濾
agent-ide search "getData" \
  --type symbol \
  --symbol-kind method \
  --modifier public \
  --path src/api

# ❌ 無過濾（結果太多）
agent-ide search "getData"
```

### 3. 使用 JSON 格式便於處理

```bash
# ✅ 結構化輸出便於解析
agent-ide search "interface" --format json | jq '.results | length'

# ✅ 提取特定資訊
agent-ide search "class" --format json | jq '.results[].symbol.name'
```

### 4. 建立常用搜尋腳本

```bash
# find-unused-exports.sh
#!/bin/bash
EXPORTS=$(agent-ide search "export" --type symbol --format json)
IMPORTS=$(agent-ide search "import" --type regex --format json)
# 比較並輸出未使用的 export
```

---

## 總結

Search 功能提供：

✅ **三種搜尋模式**：
- 文字搜尋：最快速
- 符號搜尋：最精準
- 語義搜尋：最智能

✅ **強大過濾**：
- 符號類型過濾
- 修飾符過濾
- 檔案路徑過濾
- 作用域過濾

✅ **高效能**：
- 索引加速
- 並行處理
- 結果快取
- 流式輸出

**建議使用場景**：
- 重構前的影響分析
- API 使用範例查找
- 程式碼品質檢查
- 依賴關係分析
