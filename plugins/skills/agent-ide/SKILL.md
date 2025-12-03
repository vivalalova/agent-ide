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
| 搜尋程式碼 | `search` | 支援符號/結構化搜尋，比 grep 精準 |
| 檢查依賴關係 | `deps` | 循環檢測、影響分析 |
| 程式碼品質分析 | `analyze` | 複雜度、死代碼分析 |
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

| 命令 | 說明 | 類型 | 詳細文件 |
|------|------|------|---------|
| rename | 符號重命名 | 變更類 | [rename.md](references/rename.md) |
| change-signature | 函式簽章修改 | 變更類 | [change-signature.md](references/change-signature.md) |
| move | 檔案移動 + import 更新 | 變更類 | [move.md](references/move.md) |
| move-member | 成員移動（方法/類別等） | 變更類 | [move-member.md](references/move-member.md) |
| search | 符號/結構化搜尋 | 查詢類 | [search.md](references/search.md) |
| deps | 依賴分析、循環檢測 | 查詢類 | [deps.md](references/deps.md) |
| analyze | 複雜度、死代碼分析 | 查詢類 | [analyze.md](references/analyze.md) |
| shift | 程式碼行移動 | 變更類 | [shift.md](references/shift.md) |
| snapshot | 模組/專案快照 | 查詢類 | [snapshot.md](references/snapshot.md) |

## 命令速查表

### Transform 命令

| 任務       | 命令                                                                              |
| ---------- | --------------------------------------------------------------------------------- |
| 重命名符號 | `agent-ide transform rename --path . --from X --to Y --dry-run`                   |
| 改參數順序 | `agent-ide transform change-signature --file f.ts --function fn --reorder "b,a"`  |
| 加刪參數   | `agent-ide transform change-signature --file f.ts --function fn --add "c:string"` |
| 移動檔案   | `agent-ide transform move src/old.ts src/new.ts --path . --dry-run`               |
| 移動成員   | `agent-ide transform move-member src/a.ts fn --target-file src/b.ts --dry-run`    |
| 行移動     | `agent-ide transform shift file.ts --from 1 --to 5 --position 10`                 |

### Query 命令（扁平式）

| 任務       | 命令                                                        |
| ---------- | ----------------------------------------------------------- |
| 符號搜尋   | `agent-ide search symbol --query "User*" --path .`          |
| 結構化搜尋 | `agent-ide search structural --type class --path .`         |
| 複雜度分析 | `agent-ide analyze complexity --path .`                     |
| 死代碼檢測 | `agent-ide analyze dead-code --path .`                      |
| 循環依賴   | `agent-ide deps cycles --path . --format json`              |
| 影響分析   | `agent-ide deps impact --path . --file src/core.ts`         |
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
agent-ide analyze --path . --format json

# 2. 預覽重命名影響
agent-ide transform rename --path . --from oldName --to newName --dry-run

# 3. 執行重命名
agent-ide transform rename --path . --from oldName --to newName

# 4. 檢查循環依賴
agent-ide deps cycles --path .
```

### 模組重組

```bash
# 1. 分析循環依賴
agent-ide deps cycles --path . --format json

# 2. 預覽檔案移動
agent-ide transform move src/old.ts src/new-location.ts --path . --dry-run

# 3. 執行移動
agent-ide transform move src/old.ts src/new-location.ts --path .

# 4. 檢查新循環依賴
agent-ide deps cycles --path .
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
