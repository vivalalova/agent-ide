# Agent IDE 完整指南

## 概述

agent-ide 是為 AI 代理設計的 CLI 工具集，提供搜尋、重構、依賴分析和品質評分功能，讓 AI 能智能地理解和操作程式碼。

> **執行方式**：以下 `agent-ide` 指 `node ${PLUGIN_ROOT}/bin/agent-ide.js`
> （PLUGIN_ROOT = 此 skill 所在 repo 根目錄，往上三層）

## 核心命令詳解

### 1. 程式碼品質分析 (shit)

評估程式碼品質，ShitScore 0-100 分（越高越糟）：

```bash
# 基本評分
agent-ide shit --path . --format json

# 詳細分析（含建議）
agent-ide shit --path . --detailed --format json

# CI/CD 門檻（超過則 exit 1）
agent-ide shit --path . --max-allowed 70
```

**輸出內容：**
- 整體 ShitScore（0-100）
- 等級（A-F）
- 四維度：複雜度、可維護性、架構、品質保證
- 最糟檔案清單（topShit）
- 改善建議

### 2. 專案快照 (snapshot)

生成壓縮的專案概覽供 AI 理解：

```bash
# 基本快照
agent-ide snapshot --path . --format json

# 排除特定檔案
agent-ide snapshot --path . -e "**/*.test.ts" -e "**/node_modules/**"

# 壓縮層級：minimal、medium、full
agent-ide snapshot --path . -l medium --format json
```

### 3. 符號重命名 (rename)

安全地跨專案重命名符號：

```bash
# 預覽變更
agent-ide rename --path . --from getUserData --to fetchUserProfile --dry-run

# 執行重命名
agent-ide rename --path . --from getUserData --to fetchUserProfile
```

### 4. 檔案移動 (move)

移動檔案並自動更新所有 import：

```bash
# 預覽影響
agent-ide move src/api/user.ts src/services/user.service.ts --path . --dry-run

# 執行移動
agent-ide move src/api/user.ts src/services/user.service.ts --path .
```

### 5. 程式碼搜尋 (search)

搜尋文字、正規表達式或結構化元素：

```bash
# 文字搜尋
agent-ide search "UserService" --path . --format json

# 正規表達式搜尋
agent-ide search "function.*User" --path . -t regex --format json

# 符號搜尋（function、class、variable、enum）
agent-ide search "User" --path . -t class --format json
```

### 6. 依賴分析 (deps)

分析依賴關係與檢測循環依賴：

```bash
# 完整依賴圖
agent-ide deps --path . --format json --all

# 只檢查循環依賴
agent-ide deps --path . --check-cycles --format json
```

### 7. 程式碼移動 (shift)

在檔案內或跨檔案移動程式碼行：

```bash
# 同檔案內移動
agent-ide shift src/file.ts --from 2 --to 5 --position 10 --dry-run

# 移到新檔案
agent-ide shift src/old.ts --from 1 --to 3 --target src/new.ts --position 1
```

### 8. 函數提取 (refactor)

提取或內聯函數：

```bash
# 提取函數
agent-ide refactor extract-function --file src/file.ts --start-line 10 --end-line 20 --dry-run

# 內聯函數
agent-ide refactor inline-function --file src/file.ts --function-name helperFn --dry-run
```

## 工作流程範例

### 重構流程

```bash
# 1. 評估現況
agent-ide shit --path . --detailed --format json

# 2. 找出問題區域
agent-ide analyze --path . --format json

# 3. 預覽重命名影響
agent-ide rename --path . --from oldName --to newName --dry-run

# 4. 執行重命名
agent-ide rename --path . --from oldName --to newName

# 5. 驗證改善
agent-ide shit --path . --format json
```

### 模組重組

```bash
# 1. 變更前快照
agent-ide snapshot --path . --format json > before.json

# 2. 分析依賴
agent-ide deps --path . --format json

# 3. 預覽檔案移動
agent-ide move src/old.ts src/new-location.ts --path . --dry-run

# 4. 執行移動
agent-ide move src/old.ts src/new-location.ts --path .

# 5. 檢查新循環依賴
agent-ide deps --path . --check-cycles
```

## 支援語言

- TypeScript
- JavaScript
- Swift

## 效能

- 增量索引（~1000 檔案/秒）
- 多層快取（查詢 <50ms）
- 記憶體優化（~100MB / 10k 檔案）
