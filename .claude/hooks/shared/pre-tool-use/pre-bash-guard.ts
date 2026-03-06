// PreToolUse hook (Bash): rm → trash + 禁 background 驗證

let input = '';
process.stdin.on('data', (chunk: Buffer) => { input += chunk; });
process.stdin.on('end', () => {
  const data = JSON.parse(input || '{}');
  const command: string = data.tool_input?.command ?? '';
  const bg: boolean = data.tool_input?.run_in_background === true;

  // Guard 1: rm → trash
  if (/^\s*rm\s/.test(command)) {
    // 允許 rm -rf ~/.claude/* 快取清理
    if (/rm\s+-rf\s+~\/\.claude\//.test(command)) {
      process.exit(0);
    }
    console.log(JSON.stringify({
      decision: 'block',
      reason: '刪檔用 trash 禁 rm（CLAUDE.md 規範）。例外：rm -rf ~/.claude/* 快取清理',
    }));
    process.exit(0);
  }

  // Guard 2: 禁 background 驗證
  if (bg && /\b(test|build|typecheck|tsc|lint|eslint|jest|vitest|pytest|swift test|xcodebuild test)\b/i.test(command)) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: '禁止 run_in_background 執行驗證指令（CLAUDE.md：Test/Build 禁止併發）',
    }));
    process.exit(0);
  }

  process.exit(0);
});
