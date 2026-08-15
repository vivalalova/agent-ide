---
paths: "**/skills/**/SKILL.md"
---
# Skills 撰寫規範

SKILL.md 說概述、觸發時機、適用範圍、入口檔案，也可含技術選擇流程；複雜細節仍下沉 script 或 references。

## SKILL.md Frontmatter

`name` `description` `argument-hint` `allowed-tools` `disallowed-tools` `model` `effort` `context` `agent` `user-invocable` `disable-model-invocation` `mode` `hooks` `display-name` `default-enabled` `fallback` `metadata.*`（後四者 kebab/snake/camelCase 皆收）

- `description` 用 `中文主題 - English description`＋觸發詞；若 `disable-model-invocation: true`，中文主題即可
- `model`／`effort` 禁單獨使用：inline 切主對話 model 或 effort 皆令 prompt cache 不連貫
  - 機制：conversation history 前綴對新設定全額重讀、切回再補寫一份；僅 system prompt／tool definitions 快取不受影響；cache key 含 effort level
  - 替代方案：要換 model／effort 執行改 `context: fork` ＋ `agent`（model／effort 定義在 agent 檔、單一來源更明確，勝過 fork ＋ 額外 `model`/`effort` 組合）

## references/*.md

- 放架構原則、配置原則、checklist、必要檔案清單
- 不放完整設定檔、寫死版本號、硬編碼目錄樹

## references/scripts/*.sh

適合放固定流程；會變動的內容留給執行時查詢

## 編排型流程

- 互動 gate（`AskUserQuestion`、需確認步驟）與不可逆對外動作（發 issue/PR、推送）留互動主流程，禁丟進背景 workflow/並行子流程——detached 無法向用戶提問，gate 會靜默失效
- 主流程 ↔ 子流程的邊界在 skill/command 檔中明寫
