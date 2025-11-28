---
name: agent-ide
description: 程式碼重構與分析 CLI 工具。符號重命名、檔案移動（自動更新 import）、循環依賴檢測、品質分析。支援 TS/JS/Swift。極大減少 AI 的 Token使用量
---

# Agent IDE 快速參考

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

- `--format json` - 機器可讀（AI 建議使用）
- `--format summary` - 人類可讀
- `--format diff` - 程式碼差異（變更類命令）

## 常用參數

- `--dry-run` - 預覽變更，不執行
- `--all` - 顯示所有結果（不只問題）

## 最佳實踐

1. 執行前先用 `--dry-run` 預覽變更
2. 移動或重命名前檢查依賴
3. 重構後用測試驗證

詳細說明請參考 `references/guide.md`
