---
paths: "**/agents/**/*.md"
---

# Agent 撰寫規範

- 每個 agent 定義含回傳限制（final message 只給結論與必要佐證）或明確輸出格式節（同樣須限制篇幅），防大段內容灌回派發方 context
- 包裝外部 CLI 的 agent：CLI 讀不到 CLAUDE.md／共用定義，行為與回傳要求整段寫進呼叫 prompt；回傳量限制下在內容進 context 之前（prompt 限制行＋管線截斷超長輸出），進了包裝層 context 才於回報層截＝token 已付、白截
