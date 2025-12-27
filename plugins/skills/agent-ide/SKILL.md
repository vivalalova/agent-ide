---
name: agent-ide
description: |
  TS/JS 程式碼智能重構工具。執行以下操作時自動選用：
  - 重命名符號 → rename（取代逐一 Edit）
  - 移動/重組檔案 → move（取代 Write+Delete）
  - 理解專案架構 → snapshot（取代逐檔 Read）
  - 清理未使用程式碼 → deadcode
  - 修改函式參數 → change-signature
  - 檢測循環依賴 → cycles
  - 分析變更影響 → impact
  - 查找符號引用 → find-references
  - 追蹤呼叫層次 → call-hierarchy
  優勢：自動更新所有引用、一次完成、零遺漏
---

# Agent IDE

為 AI 代理設計的 CLI 工具集，提供搜尋、重構、依賴分析功能，讓 AI 能智能地理解和操作程式碼。

## 功能優勢

| 優勢           | 說明                                                           |
| -------------- | -------------------------------------------------------------- |
| **節省 Token** | 使用 `snapshot` 產生精簡 API 摘要，比讀取原始碼節省 ~91% token |
| **提升效率**   | 批次重命名、移動檔案自動更新 import，一次完成原本需多步的操作  |
| **減少錯誤**   | 自動處理依賴關係、循環檢測，避免手動修改遺漏                   |
| **結構化輸出** | JSON 格式輸出，AI 可直接解析處理，無需額外文字處理             |

**最佳實踐**：
- 開始任務前先用 `snapshot` 了解專案結構，避免反覆讀檔
- 重構時用 `--dry-run` 預覽，確認無誤再執行
- 用 `cycles` 檢查是否產生新的循環依賴

## 命令速查表

### 變更類命令

| 任務                 | 命令                                                                            |
| -------------------- | ------------------------------------------------------------------------------- |
| 重命名符號           | `npx agent-ide rename --path . --from X --to Y --dry-run`                       |
| 重命名（同名消歧）   | `npx agent-ide rename --path . --from X --to Y --at src/file.ts:42`             |
| 改參數順序           | `npx agent-ide change-signature --file f.ts --function fn --reorder "b,a"`      |
| 加刪參數             | `npx agent-ide change-signature --file f.ts --function fn --add "c:string"`     |
| 移動檔案             | `npx agent-ide move src/old.ts src/new.ts --path . --dry-run`                   |
| 移動多檔案（glob）   | `npx agent-ide move "src/utils/*.ts" src/lib/ --path . --dry-run`               |
| 移動成員             | `npx agent-ide move src/a.ts:25 src/b.ts --path . --dry-run`                    |
| 移動成員（指定位置） | `npx agent-ide move src/a.ts:25 src/b.ts:10 --path . --dry-run`                 |
| 刪除 Dead code       | `npx agent-ide deadcode --path .`                                               |

> ⚠️ **目錄移動**：遵循 `mv` 行為，目標已存在時會嵌套（`move a b` → `b/a/`）
> ⚠️ **Glob 移動**：支援 `*.ts`、`**/*.ts` 等模式，多檔案時目標必須是目錄（以 `/` 結尾或已存在的目錄）

### 查詢類命令

| 任務           | 命令                                                                       |
| -------------- | -------------------------------------------------------------------------- |
| 循環依賴       | `npx agent-ide cycles --path . --format json`                              |
| 影響分析       | `npx agent-ide impact --file src/core.ts --path .`                         |
| 模組快照       | `npx agent-ide snapshot --path src/core/indexing --format json`            |
| 專案快照       | `npx agent-ide snapshot --path . --format json`                            |
| 增量快照       | `npx agent-ide snapshot --path . --since last --format json`               |
| 符號引用       | `npx agent-ide find-references processData --path . --format json`         |
| 呼叫層次       | `npx agent-ide call-hierarchy handleRequest --path . --direction both`     |
| Dead code 預覽 | `npx agent-ide deadcode --path . --dry-run --format json`                  |

## 輸出格式

所有命令支援 `--format` 參數：

| 格式      | 說明                         | 適用命令   |
| --------- | ---------------------------- | ---------- |
| `json`    | 機器可讀 JSON（AI 建議使用） | 所有命令   |
| `summary` | 人類可讀摘要                 | 所有命令   |
| `diff`    | 程式碼差異                   | 變更類命令 |

## 常用參數

- `--dry-run` - 預覽變更，不執行
- `--all` - 顯示所有結果（不只問題）
- `--at <file:line:column>` - 指定符號位置（rename 專用，用於區分同名符號）

## 工作流程範例

### 重構流程

```bash
# 1. 預覽重命名影響
npx agent-ide rename --path . --from oldName --to newName --dry-run

# 2. 執行重命名
npx agent-ide rename --path . --from oldName --to newName

# 3. 檢查循環依賴
npx agent-ide cycles --path .
```

### 模組重組

```bash
# 1. 分析循環依賴
npx agent-ide cycles --path . --format json

# 2. 預覽檔案移動
npx agent-ide move src/old.ts src/new-location.ts --path . --dry-run

# 3. 執行移動
npx agent-ide move src/old.ts src/new-location.ts --path .

# 4. 檢查新循環依賴
npx agent-ide cycles --path .
```

## 支援語言

- TypeScript
- JavaScript

## 效能

- 增量索引（~1000 檔案/秒）
- 多層快取（查詢 <50ms）
- 記憶體優化（~100MB / 10k 檔案）
