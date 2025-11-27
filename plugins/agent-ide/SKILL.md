---
name: agent-ide
description: 使用 agent-ide CLI 的程式碼重構與分析工具集。適用於：(1) 透過快照分析專案結構與品質，(2) 跨檔案重命名符號（類別、函數、變數），(3) 移動檔案並自動更新所有 import，(4) 檢測循環依賴與分析依賴關係，(5) 計算 ShitScore 識別程式碼品質問題，(6) 重構複雜程式碼（提取函數、降低複雜度）。支援 TypeScript 和 JavaScript 專案。關鍵字：重構、重命名、移動、分析、品質、依賴、快照、重組、程式碼異味、技術債。
---

# Agent IDE 快速參考

## 安裝

```bash
npm install -g agent-ide
```

## 命令速查表

| 任務 | 命令 |
|------|------|
| 品質評分 | `agent-ide shit --path . --format json` |
| 詳細分析 | `agent-ide shit --path . --detailed --format json` |
| 專案快照 | `agent-ide snapshot --path . --format json` |
| 重命名符號 | `agent-ide rename --path . --from X --to Y --dry-run` |
| 移動檔案 | `agent-ide move src/old.ts src/new.ts --path . --dry-run` |
| 文字搜尋 | `agent-ide search "pattern" --path . --format json` |
| 正規搜尋 | `agent-ide search "func.*" --path . -t regex` |
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
- `--detailed` - 包含改善建議
- `--max-allowed N` - CI 門檻值

## ShitScore 等級

| 分數 | 等級 | 狀態 |
|------|------|------|
| 0-20 | A | 優秀 |
| 21-40 | B | 良好 |
| 41-60 | C | 尚可 |
| 61-80 | D | 差 |
| 81-100 | F | 危險 |

## 四大品質維度

1. **複雜度** (30%) - 循環複雜度、嵌套深度
2. **可維護性** (30%) - 檔案大小、函數長度
3. **架構** (20%) - 依賴深度、循環依賴
4. **品質保證** (20%) - 型別安全、錯誤處理、命名

## 最佳實踐

1. 執行前先用 `--dry-run` 預覽變更
2. 移動或重命名前檢查依賴
3. 重構後用測試驗證
4. 追蹤 ShitScore 變更前後對比

詳細說明請參考 `references/guide.md`
