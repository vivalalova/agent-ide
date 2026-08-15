---
paths: "**/commands/**/*.md"
---

# Command 撰寫規範

`!` 動態注入規範見 `claude/dynamic-injection.md`；command 內容只保留流程與判斷依據。

## Frontmatter

```yaml
---
description: 簡明扼要的中文描述
argument-hint: [參數提示] # 選填
allowed-tools: Read, Bash, ... # 選填
---
```

- `description` 只說用途，不補關鍵字清單
- 內容順序：動態注入區塊 → `---` → 編號步驟
- AskUserQuestion 的選項文案留佔位，不寫死專案資料
- command 支援與 skill 相同的完整 frontmatter；`model` 禁單獨使用等規範同 `claude/skill.md`
- 編排型 command 的互動 gate 與主↔子流程邊界規範同 `claude/skill.md`「編排型流程」
