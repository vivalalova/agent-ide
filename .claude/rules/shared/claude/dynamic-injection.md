---
paths: "**/{skills,commands}/**/*.md"
---

# `!` 動態指令

`!` 用來在預處理階段把本地狀態注入 prompt：`` !`command` ``。

- 可用：`$1`、`$2`、`${CLAUDE_PLUGIN_ROOT}`
- 適合：專案狀態、檔案清單、環境資訊
- 不適合：最新 API、外部文件知識
- 輸出要短，避免白白吃 token
