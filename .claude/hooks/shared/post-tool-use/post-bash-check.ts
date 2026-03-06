// PostToolUse hook (Bash): mv 後提醒更新引用 + 驗證後清除 needs-verify
import { existsSync, unlinkSync } from 'fs';

let input = '';
process.stdin.on('data', (chunk: Buffer) => { input += chunk; });
process.stdin.on('end', () => {
  const data = JSON.parse(input || '{}');
  const command: string = data.tool_input?.command ?? '';
  const sessionId: string = data.session_id ?? '';

  // Check 1: rename/move 提醒搜尋更新引用
  if (/^\s*(mv|git mv)\s/.test(command)) {
    console.log('⚠️ rename/move 後記得搜尋更新所有引用（CLAUDE.md/.claude/CLAUDE.md 規範）');
  }

  // Check 2: 驗證指令執行 → 清除 needs-verify 標記
  if (sessionId && /\b(lint|typecheck|tsc|build|test|jest|vitest|pytest|swift test|xcodebuild)\b/i.test(command)) {
    const flagFile = `/tmp/claude-${sessionId}-needs-verify`;
    if (existsSync(flagFile)) {
      try { unlinkSync(flagFile); } catch { /* ignore */ }
    }
  }

  process.exit(0);
});
