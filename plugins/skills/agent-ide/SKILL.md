---
name: agent-ide
description: 程式碼重構與分析 CLI 工具。符號重命名、檔案移動（自動更新 import）、循環依賴檢測、品質分析。支援 TS/JS/Swift。
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

| 任務 | 命令 |
|------|------|
| 重命名符號 | `agent-ide rename --path . --from X --to Y --dry-run` |
| 移動檔案 | `agent-ide move src/old.ts src/new.ts --path . --dry-run` |
| 文字搜尋 | `agent-ide search "pattern" --path . --format json` |
| 正規搜尋 | `agent-ide search "func.*" --path . -t regex` |
| 品質分析 | `agent-ide analyze --path . --format json` |
| 依賴分析 | `agent-ide deps --path . --format json` |
| 循環依賴 | `agent-ide deps --path . --check-cycles` |
| 行移動 | `agent-ide shift file.ts --from 1 --to 5 --position 10` |
| 提取函數 | `agent-ide refactor extract-function --file f.ts --start-line 1 --end-line 5` |

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
