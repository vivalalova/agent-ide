---
paths: "**/plugins-local/**/{plugin.json,hooks.json,hooks/**/*.mjs}"
---

# Plugin 開發規範

## 名稱對齊

三處名稱 + source 路徑須一致：folder = `plugin.json` `name` = `marketplace.json` `name`，且 `marketplace.json` `source: "./{name}"`。任一處不符 plugin 載入失敗。

## Hooks

- 路徑用 `${CLAUDE_PLUGIN_ROOT}`，禁 hardcode；禁 import user scope（`~/.claude/lib/*` 等）— 散佈到他人機器即壞
- `PreToolUse` 不攔 subagent → 需 prompt 指示 + code guard + validate 三層才完整防護
