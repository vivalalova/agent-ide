---
paths: "**/plugins-local/**/commands/*.md"
---

# Plugin Command 規範

引用名稱必須直接對應實際檔名；有數字前綴時也要帶上。

- `1.plan.md` → `/plugin:1.plan`
- 新增、刪除、改名後，同步更新同 plugin 的 `SKILL.md` 與 `README.md`

## 修改後檢查

```bash
cd plugins-local/<plugin>/commands
grep -rn "/<plugin>:" --include="*.md" | grep -v "<plugin>:[0-9]" | grep -v "<plugin>:\*"
```
