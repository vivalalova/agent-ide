---
event: SessionStart
match_files:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---

## TS/JS 重構工具提醒

執行以下操作時，請使用 agent-ide skill 而非手動操作：

| 操作 | 命令 | 取代 |
|-----|------|------|
| 重命名符號 | `agent-ide rename` | 逐一 Edit |
| 移動檔案 | `agent-ide move` | Write + Delete |
| 理解專案 | `agent-ide snapshot` | 逐檔 Read |
| 清理 dead code | `agent-ide deadcode` | 手動刪除 |
| 修改函式參數 | `agent-ide change-signature` | 手動改 |

優勢：自動更新所有引用、一次完成、零遺漏
