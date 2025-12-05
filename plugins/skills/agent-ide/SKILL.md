---
name: agent-ide
description: 🚨 重構/重命名/移動/搜尋/依賴分析必用 - 當用戶要求 rename/refactor/move/搜尋程式碼/分析依賴/檢查循環/了解專案結構時，必須使用此工具。自動更新所有引用，節省 ~91% token。支援 TS/JS/Swift/Python
---

# Agent IDE

為 AI 代理設計的 CLI 工具集，提供搜尋、重構、依賴分析功能，讓 AI 能智能地理解和操作程式碼。

## 🚨 優先使用原則

**只要任務屬於以下範圍，必須優先使用 agent-ide 而非手動操作：**

| 任務類型 | 使用命令 | 為何優先 |
|----------|----------|----------|
| 了解專案/模組結構 | `snapshot` | 節省 ~91% token，無需逐檔讀取 |
| 重命名變數/函數/類別 | `rename` | 自動更新所有引用，零遺漏 |
| 修改函式參數 | `change-signature` | 自動更新所有呼叫點 |
| 移動/重組檔案 | `move` | 自動更新 import 路徑 |
| 移動方法/函式/類別 | `move-member` | 語義級移動，自動更新引用 |
| 符號搜尋 | `symbol` | 精準符號定位，比 grep 精準 |
| 結構化搜尋 | `structural` | 按類型搜尋（class/function 等） |
| 循環依賴檢測 | `cycles` | 即時檢測循環依賴 |
| 影響分析 | `impact` | 分析修改影響範圍 |
| 複雜度分析 | `complexity` | 程式碼品質評估 |
| 死代碼檢測 | `deadcode` | 找出未使用的代碼 |
| 移動程式碼區塊 | `shift` | 保持語法正確性 |

## 🚀 為什麼使用 Agent IDE？

| 優勢 | 說明 |
|------|------|
| **節省 Token** | 使用 `snapshot` 產生精簡 API 摘要，比讀取原始碼節省 ~91% token |
| **提升效率** | 批次重命名、移動檔案自動更新 import，一次完成原本需多步的操作 |
| **減少錯誤** | 自動處理依賴關係、循環檢測，避免手動修改遺漏 |
| **結構化輸出** | JSON 格式輸出，AI 可直接解析處理，無需額外文字處理 |

**最佳實踐**：
- 開始任務前先用 `snapshot` 了解專案結構，避免反覆讀檔
- 重構時用 `--dry-run` 預覽，確認無誤再執行
- 用 `deps cycles` 檢查是否產生新的循環依賴

## 執行方式

Plugin 安裝後首次需 build：

```bash
# PLUGIN_ROOT = 此 skill 所在 repo 的根目錄（往上三層）
cd ${PLUGIN_ROOT} && pnpm install && pnpm build
```

之後可直接執行：

```bash
node ${PLUGIN_ROOT}/bin/agent-ide.js <command>
```

## 命令索引

| 命令 | 說明 | 類型 |
|------|------|------|
| rename | 符號重命名 | 變更類 |
| change-signature | 函式簽章修改 | 變更類 |
| move | 檔案移動 + import 更新 | 變更類 |
| move-member | 成員移動（方法/類別等） | 變更類 |
| shift | 程式碼行移動 | 變更類 |
| symbol | 符號搜尋 | 查詢類 |
| structural | 結構化搜尋（按類型） | 查詢類 |
| complexity | 複雜度分析 | 查詢類 |
| deadcode | 死代碼分析 | 查詢類 |
| cycles | 循環依賴檢測 | 查詢類 |
| impact | 影響分析 | 查詢類 |
| snapshot | 模組/專案快照 | 查詢類 |

## 命令速查表

### 變更類命令

| 任務       | 命令                                                                      |
| ---------- | ------------------------------------------------------------------------- |
| 重命名符號 | `agent-ide rename --path . --from X --to Y --dry-run`                     |
| 改參數順序 | `agent-ide change-signature --file f.ts --function fn --reorder "b,a"`    |
| 加刪參數   | `agent-ide change-signature --file f.ts --function fn --add "c:string"`   |
| 移動檔案   | `agent-ide move src/old.ts src/new.ts --path . --dry-run`                 |
| 移動成員   | `agent-ide move-member src/a.ts fn --target-file src/b.ts --dry-run`      |
| 行移動     | `agent-ide shift file.ts --from 1 --to 5 --position 10`                   |

### 查詢類命令

| 任務       | 命令                                                        |
| ---------- | ----------------------------------------------------------- |
| 符號搜尋   | `agent-ide symbol --query "User*" --path .`                 |
| 結構化搜尋 | `agent-ide structural --type class --path .`                |
| 複雜度分析 | `agent-ide complexity --path .`                             |
| 死代碼檢測 | `agent-ide deadcode --path .`                               |
| 循環依賴   | `agent-ide cycles --path . --format json`                   |
| 影響分析   | `agent-ide impact --file src/core.ts --path .`              |
| 模組快照   | `agent-ide snapshot --path src/core/indexing --format json` |
| 專案快照   | `agent-ide snapshot --path . --format json`                 |

## 輸出格式

所有命令支援 `--format` 參數：

| 格式 | 說明 | 適用命令 |
|------|------|---------|
| `json` | 機器可讀 JSON（AI 建議使用） | 所有命令 |
| `summary` | 人類可讀摘要 | 所有命令 |
| `diff` | 程式碼差異 | 變更類命令 |

## 常用參數

- `--dry-run` - 預覽變更，不執行
- `--all` - 顯示所有結果（不只問題）

## 工作流程範例

### 重構流程

```bash
# 1. 分析品質
agent-ide complexity --path . --format json

# 2. 預覽重命名影響
agent-ide rename --path . --from oldName --to newName --dry-run

# 3. 執行重命名
agent-ide rename --path . --from oldName --to newName

# 4. 檢查循環依賴
agent-ide cycles --path .
```

### 模組重組

```bash
# 1. 分析循環依賴
agent-ide cycles --path . --format json

# 2. 預覽檔案移動
agent-ide move src/old.ts src/new-location.ts --path . --dry-run

# 3. 執行移動
agent-ide move src/old.ts src/new-location.ts --path .

# 4. 檢查新循環依賴
agent-ide cycles --path .
```

## 支援語言

- TypeScript
- JavaScript
- Swift
- Python

## 效能

- 增量索引（~1000 檔案/秒）
- 多層快取（查詢 <50ms）
- 記憶體優化（~100MB / 10k 檔案）
