---
name: agent-ide
description: 程式碼重構與分析 CLI 工具。以下情境優先使用：重命名符號、移動檔案/成員（統一 move 命令，source 帶位置自動切換成員模式）、改參數、循環依賴檢測、影響分析、專案快照（支援增量快照）、符號引用搜尋、呼叫層次分析、dead code 檢測與刪除。優點：自動更新所有引用零遺漏、snapshot 節省 ~91% token、增量快照追蹤變更、deadcode 自動清理未使用程式碼、結構化 JSON 輸出。支援 TS/JS
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
| 移動檔案/成員 | `move` | 自動更新 import 路徑（支援檔案或成員移動） |
| 循環依賴檢測 | `cycles` | 即時檢測循環依賴 |
| 影響分析 | `impact` | 分析修改影響範圍 |
| 符號引用搜尋 | `find-references` | 精確找出定義和所有引用 |
| 呼叫層次分析 | `call-hierarchy` | 分析函數呼叫者和被呼叫者 |
| Dead code 檢測與刪除 | `deadcode` | 找出未使用的符號，支援 --autofix 自動刪除 |

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
- 用 `cycles` 檢查是否產生新的循環依賴

## 執行方式

Plugin 安裝後首次需 build：

```bash
# PLUGIN_ROOT = 此 skill 所在 repo 的根目錄（往上三層）
cd ${PLUGIN_ROOT} && pnpm install && pnpm build
```

之後可直接執行：

```bash
npx bun ${PLUGIN_ROOT}/bin/agent-ide.js <command>
```

## 命令索引

| 命令 | 說明 | 類型 |
|------|------|------|
| [rename](references/rename.md) | 符號重命名 | 變更類 |
| [change-signature](references/change-signature.md) | 函式簽章修改 | 變更類 |
| [move](references/move.md) | 檔案/成員移動 + import 更新 | 變更類 |
| [cycles](references/deps.md) | 循環依賴檢測 | 查詢類 |
| [impact](references/deps.md) | 影響分析 | 查詢類 |
| [snapshot](references/snapshot.md) | 模組/專案快照 | 查詢類 |
| [find-references](references/find-references.md) | 符號引用搜尋 | 查詢類 |
| [call-hierarchy](references/call-hierarchy.md) | 呼叫層次分析 | 查詢類 |
| [deadcode](references/deadcode.md) | Dead code 檢測（支援 --autofix 自動刪除） | 查詢/變更類 |

## 命令速查表

### 變更類命令

| 任務               | 命令                                                                      |
| ------------------ | ------------------------------------------------------------------------- |
| 重命名符號         | `agent-ide rename --path . --from X --to Y --dry-run`                     |
| 重命名（同名消歧） | `agent-ide rename --path . --from X --to Y --at src/file.ts:42`           |
| 改參數順序         | `agent-ide change-signature --file f.ts --function fn --reorder "b,a"`    |
| 加刪參數           | `agent-ide change-signature --file f.ts --function fn --add "c:string"`   |
| 移動檔案           | `agent-ide move src/old.ts src/new.ts --path . --dry-run`                 |
| 移動成員           | `agent-ide move src/a.ts:25 src/b.ts --path . --dry-run`                  |
| 移動成員（指定位置） | `agent-ide move src/a.ts:25 src/b.ts:10 --path . --dry-run`             |
| 刪除 Dead code     | `agent-ide deadcode --path .`                                             |

### 查詢類命令

| 任務           | 命令                                                               |
| -------------- | ------------------------------------------------------------------ |
| 循環依賴       | `agent-ide cycles --path . --format json`                          |
| 影響分析       | `agent-ide impact --file src/core.ts --path .`                     |
| 模組快照       | `agent-ide snapshot --path src/core/indexing --format json`        |
| 專案快照       | `agent-ide snapshot --path . --format json`                        |
| 增量快照       | `agent-ide snapshot --path . --since last --format json`           |
| 符號引用       | `agent-ide find-references processData --path . --format json`     |
| 呼叫層次       | `agent-ide call-hierarchy handleRequest --path . --direction both` |
| Dead code 預覽 | `agent-ide deadcode --path . --dry-run --format json`              |

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
- `--at <file:line:column>` - 指定符號位置（rename 專用，用於區分同名符號）

## 工作流程範例

### 重構流程

```bash
# 1. 預覽重命名影響
agent-ide rename --path . --from oldName --to newName --dry-run

# 2. 執行重命名
agent-ide rename --path . --from oldName --to newName

# 3. 檢查循環依賴
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

## 效能

- 增量索引（~1000 檔案/秒）
- 多層快取（查詢 <50ms）
- 記憶體優化（~100MB / 10k 檔案）
