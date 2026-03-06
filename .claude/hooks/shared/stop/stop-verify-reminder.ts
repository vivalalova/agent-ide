// Stop hook: session 結束前若有未驗證的程式碼變更則提醒
import { existsSync, unlinkSync } from 'fs';

let input = '';
process.stdin.on('data', (chunk: Buffer) => { input += chunk; });
process.stdin.on('end', () => {
  const data = JSON.parse(input || '{}');
  const sessionId: string = data.session_id ?? '';

  if (sessionId) {
    const flagFile = `/tmp/claude-${sessionId}-needs-verify`;
    if (existsSync(flagFile)) {
      try { unlinkSync(flagFile); } catch { /* ignore */ }
      console.log('⚠️ 本次 session 有程式碼變更但未執行驗證（lint/typecheck/build/test）。建議先驗證再結束。');
    }
  }

  process.exit(0);
});
