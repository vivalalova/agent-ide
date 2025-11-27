# Agent IDE 完整指南

## 概述

agent-ide 是為 AI 代理設計的 CLI 工具集，提供搜尋、重構、依賴分析功能，讓 AI 能智能地理解和操作程式碼。

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

## 核心命令詳解

### 1. 符號重命名 (rename)

安全地跨專案重命名符號：

```bash
# 預覽變更
agent-ide rename --path . --from getUserData --to fetchUserProfile --dry-run

# 執行重命名
agent-ide rename --path . --from getUserData --to fetchUserProfile
```

### 2. 檔案移動 (move)

移動檔案並自動更新所有 import：

```bash
# 預覽影響
agent-ide move src/api/user.ts src/services/user.service.ts --path . --dry-run

# 執行移動
agent-ide move src/api/user.ts src/services/user.service.ts --path .
```

### 3. 程式碼搜尋 (search)

支援多種搜尋類型：

| 類型 | 說明 |
|------|------|
| `text` | 文字搜尋（預設） |
| `regex` | 正規表達式搜尋 |
| `fuzzy` | 模糊搜尋（容錯匹配） |
| `symbol` | 符號名稱搜尋 |
| `function/class/variable/enum` | 特定類型符號搜尋 |

```bash
# 文字搜尋
agent-ide search "UserService" --path . --format json

# 正規表達式搜尋
agent-ide search "function.*User" --path . -t regex --format json

# 模糊搜尋
agent-ide search "usrSvc" --path . -t fuzzy --format json

# 符號搜尋（支援萬用字元）
agent-ide search symbol --query "User*" --path . --format json

# 結構化搜尋（按類型過濾）
agent-ide search structural -t class --pattern "Service" --path . --format json
```

**進階過濾選項**：
```bash
# 過濾帶有特定屬性的符號
agent-ide search structural -t class --with-attribute "@Observable" --path .

# 過濾實作特定協定的類別
agent-ide search structural -t class --implements "Codable" --path .

# 過濾繼承特定類別的子類別
agent-ide search structural -t class --extends "BaseService" --path .
```

### 4. 依賴分析 (deps)

分析依賴關係，支援子命令：

| 子命令 | 說明 |
|--------|------|
| `graph` | 完整依賴圖 |
| `cycles` | 循環依賴分析 |
| `impact` | 影響分析 |
| `orphans` | 孤立檔案分析 |

```bash
# 基本分析（預設顯示循環依賴和孤立檔案）
agent-ide deps --path . --format json

# 完整依賴圖
agent-ide deps --path . --format json --all

# 使用子命令
agent-ide deps graph --path . --format json
agent-ide deps cycles --path . --format json
agent-ide deps orphans --path . --format json
```

### 5. 品質分析 (analyze)

分析程式碼品質，支援 5 種分析類型：

| 類型 | 說明 |
|------|------|
| `complexity` | 循環/認知複雜度（預設） |
| `dead-code` | 未使用的函式/變數 |
| `best-practices` | ES Module 等實踐檢查 |
| `patterns` | async/Promise/interface/enum 使用模式 |
| `quality` | 綜合評分（型別安全、錯誤處理、安全性、命名、測試覆蓋率） |

```bash
# 複雜度分析（預設）
agent-ide analyze --path . --format json

# 指定分析類型
agent-ide analyze dead-code --path . --format json
agent-ide analyze quality --path . --format json

# 顯示所有結果（不只問題項目）
agent-ide analyze --path . --format json --all
```

### 6. 程式碼移動 (shift)

在檔案內或跨檔案移動程式碼行：

```bash
# 同檔案內移動
agent-ide shift src/file.ts --from 2 --to 5 --position 10 --dry-run

# 移到新檔案
agent-ide shift src/old.ts --from 1 --to 3 --target src/new.ts --position 1
```

### 7. 重構 (refactor)

支援的動作：

| 動作 | 說明 |
|------|------|
| `extract-function` | 提取程式碼為函數（TS/JS） |
| `extract-closure` | 提取程式碼為閉包（Swift） |
| `inline-function` | 內聯函數呼叫 |

```bash
# 提取函數
agent-ide refactor extract-function --file src/file.ts --start-line 10 --end-line 20 --function-name newFn --dry-run

# 提取閉包（Swift）
agent-ide refactor extract-closure --file src/file.swift --start-line 10 --end-line 20 --function-name newClosure --dry-run

# 跨檔案提取（提取到新檔案並自動加入 import）
agent-ide refactor extract-function --file src/file.ts -s 10 -e 20 -n helper --target-file src/utils.ts --dry-run

# 內聯函數
agent-ide refactor inline-function --file src/file.ts --function-name helperFn --dry-run
```

## 工作流程範例

### 重構流程

```bash
# 1. 分析品質
agent-ide analyze --path . --format json

# 2. 預覽重命名影響
agent-ide rename --path . --from oldName --to newName --dry-run

# 3. 執行重命名
agent-ide rename --path . --from oldName --to newName

# 4. 檢查循環依賴
agent-ide deps cycles --path .
```

### 模組重組

```bash
# 1. 分析依賴
agent-ide deps --path . --format json

# 2. 預覽檔案移動
agent-ide move src/old.ts src/new-location.ts --path . --dry-run

# 3. 執行移動
agent-ide move src/old.ts src/new-location.ts --path .

# 4. 檢查新循環依賴
agent-ide deps cycles --path .
```

## 支援語言

- TypeScript
- JavaScript
- Swift

## 效能

- 增量索引（~1000 檔案/秒）
- 多層快取（查詢 <50ms）
- 記憶體優化（~100MB / 10k 檔案）
