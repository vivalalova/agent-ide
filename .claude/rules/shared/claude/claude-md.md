---
paths: "**/CLAUDE.md"
---

# 專案 CLAUDE.md 維護規範

只寫會改變行為的專案資訊，其他交給現有規則、動態掃描或原始文件。

- 保留：`build/test/lint/dev` 指令、非預設風格、測試入口、git 約定、架構陷阱
- 不保留：語言常識、API 細節、長篇範例、常變動清單
- Skills 表：用實際已安裝 skills 生成，不手寫清單
- 複雜細節移到 `rules/` 或 `docs/`，CLAUDE.md 只放摘要與入口
