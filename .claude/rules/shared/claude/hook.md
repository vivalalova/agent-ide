---
paths: "hooks/**/*.mjs"
---

# User Scope Hook 規範

所有 `~/.claude/hooks/*.mjs` 第一行 `import { projectGuard } from '../lib/project-guard.mjs'`，第二行 `projectGuard(import.meta.url)`，再讀 stdin。

- 專案若有同名 `.mjs` hook（`.claude/hooks/shared/{event}/{name}.mjs`），全域版本直接讓位
- 從 stdin 讀 JSON：`for await (const chunk of process.stdin)` 收集後 `JSON.parse`
- 攔截：`process.stderr.write(msg)` + `process.exit(2)`；放行：`process.exit(0)`
- 有狀態流轉的 hook 用 Mermaid 或 ASCII 補圖，線性流程維持文字即可
- 攔 Bash 命令的判定用命令位置（剝 heredoc/引號、切段看首 token 家族），禁全文關鍵字掃描——路徑（`tests/x.test.mjs`）、heredoc/引號內文、`test -f` 內建必誤攔

## Harness 機制（實證）

- Hook `if` 條件：
  - 位置：寫在 `hooks[]` 陣列內**個別 command 物件**上；寫在 group 層（與 `matcher` 同層）會被靜默忽略、hook 退化成無條件觸發，且無任何啟動警告
  - 同時濾 tool 名與參數：`Edit(*.md*)` 只對 Edit 生效，同路徑的 Write 不觸發
  - Bash pattern：前綴 `Bash(mv *)`（純命令、`&& mv` 不匹配）、子串 `Bash(*test*)`
  - 檔案工具（Read/Edit/Write）路徑 pattern 為 glob、分兩模式：含 `/` 走路徑錨定——`*` 不跨路徑分隔、`**` 跨（`Write(src/*.md)` 不配 `src/a/b.md`，`Write(src/**)` 配）；不含 `/` 則任意層級匹配（`Write(*.md*)` 配 `note.md` 也配 `src/a/b.md`）。匹配對象是工具收到的原始 `file_path`（相對就以相對比對）
  - `|` 非 OR、不支援陣列——OR／多 pattern 需求拆多條 entry
  - 安全守衛不加 `if`（要 catch all）
- Hook prompt 必明確禁越權：每個 injection 寫「做完 X 立即結束回合，禁自行做 Y」，否則 Claude 會好心做下一步跳過 hook chain
- PostToolUse 只在工具**成功**時觸發；失敗（非零 exit、timeout、中斷）走 PostToolUseFailure，二擇一（實測 exit 1 的 Bash 不觸發 PostToolUse）；兩事件 payload 同構（`session_id`／`tool_input` 同位，差異在 `tool_response` vs `error`/`is_interrupt`）；Stop 於用戶中斷不觸發。故 hook 維護的跨呼叫狀態須多層清理：PostToolUse＋PostToolUseFailure 雙註冊、Stop 兜底、TTL 過期壓底
- Stop hook 純 stdout 只進 debug log、不回灌 Claude；要 Claude 看到的輸出方式見 `hooks/README.md`
