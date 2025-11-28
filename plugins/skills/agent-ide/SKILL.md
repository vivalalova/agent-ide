---
name: agent-ide
description: 程式碼重構與分析 CLI 工具。符號重命名、檔案移動（自動更新 import）、循環依賴檢測、品質分析。支援 TS/JS/Swift。極大減少 AI 的 Token使用量
---

# Agent IDE

為 AI 代理設計的 CLI 工具集，提供搜尋、重構、依賴分析功能，讓 AI 能智能地理解和操作程式碼。

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
| move | 檔案移動 + import 更新 | 變更類 | [move.md](references/move.md) |
| search | 文字/正則/模糊/符號搜尋 | 查詢類 | [search.md](references/search.md) |
| deps | 依賴分析、循環檢測 | 查詢類 | [deps.md](references/deps.md) |
| analyze | 程式碼品質分析 | 查詢類 | [analyze.md](references/analyze.md) |
| shift | 程式碼行移動 | 變更類 | [shift.md](references/shift.md) |
| refactor | 提取/內聯函數 | 變更類 | [refactor.md](references/refactor.md) |
| snapshot | 模組/專案快照 | 查詢類 | [snapshot.md](references/snapshot.md) |

## 命令速查表

| 任務       | 命令                                                                            |
| ---------- | ------------------------------------------------------------------------------- |
| 重命名符號 | `agent-ide rename --path . --from X --to Y --dry-run`                           |
| 移動檔案   | `agent-ide move src/old.ts src/new.ts --path . --dry-run`                       |
| 文字搜尋   | `agent-ide search "pattern" --path .`                                           |
| 正規搜尋   | `agent-ide search "func.*" --path . -t regex`                                   |
| 模糊搜尋   | `agent-ide search "usr" --path . -t fuzzy`                                      |
| 符號搜尋   | `agent-ide search symbol --query "User*" --path .`                              |
| 結構化搜尋 | `agent-ide search structural -t class --pattern "Service"`                      |
| 複雜度分析 | `agent-ide analyze complexity --path .`                                         |
| 死代碼檢測 | `agent-ide analyze dead-code --path .`                                          |
| 最佳實踐   | `agent-ide analyze best-practices --path .`                                     |
| 模式分析   | `agent-ide analyze patterns --path .`                                           |
| 綜合品質   | `agent-ide analyze quality --path .`                                            |
| 依賴分析   | `agent-ide deps --path . --format json`                                         |
| 完整依賴圖 | `agent-ide deps --path . --all`                                                 |
| 依賴子命令 | `agent-ide deps graph\|cycles\|impact\|orphans --path .`                        |
| 行移動     | `agent-ide shift file.ts --from 1 --to 5 --position 10`                         |
| 提取函數   | `agent-ide refactor extract-function --file f.ts --start-line 1 --end-line 5`   |
| 提取閉包   | `agent-ide refactor extract-closure --file f.swift --start-line 1 --end-line 5` |
| 跨檔案提取 | `agent-ide refactor extract-function --file f.ts -s 1 -e 5 -t target.ts`        |
| 內聯函數   | `agent-ide refactor inline-function --file f.ts --function-name fn`             |
| 模組快照   | `agent-ide snapshot --path src/core/indexing --format json`                     |
| 專案快照   | `agent-ide snapshot --path . --format json`                                     |

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
