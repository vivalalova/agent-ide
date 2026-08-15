---
paths: "**/rules{,-specific}/**/*.md"
---
# Rules 撰寫規範

一檔一主題，路徑用 `rules-specific/{category}/{topic}.md`（如 `claude/skill.md`）。

- 語言檔只放該語言特有約束
- 可客觀驗證的項目才寫 checklist

## Path 條件

```yaml
---
paths: "**/*.{ts,tsx}"
---
```

- `paths` 用 glob；無 `paths` 視為全域
