// PreToolUse hook: Plan agent 強制用 opus

let input = '';
process.stdin.on('data', (chunk: Buffer) => { input += chunk; });
process.stdin.on('end', () => {
  const data = JSON.parse(input || '{}');
  const subagentType: string = data.tool_input?.subagent_type ?? '';
  const model: string = data.tool_input?.model ?? '';

  if (subagentType === 'Plan' && model !== 'opus') {
    console.log(JSON.stringify({
      decision: 'block',
      reason: 'Plan agent 必須使用 model: opus。請加上 model: opus 重試。',
    }));
  }

  process.exit(0);
});
