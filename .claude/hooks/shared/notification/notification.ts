import { execSync } from 'child_process';

let input = '';
process.stdin.on('data', (chunk: Buffer) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input || '{}');
    const message = data.message || 'Awaiting your input';
    const title = 'Claude Code';

    if (process.platform === 'darwin') {
      const safe = message.replace(/'/g, '\\\'');
      execSync(`osascript -e 'display notification "${safe}" with title "${title}"'`);
    } else if (process.platform === 'linux') {
      try {
        execSync(`notify-send "${title}" "${message}"`);
      } catch {
        console.log(`[${title}] ${message}`);
      }
    } else {
      console.log(`[${title}] ${message}`);
    }
  } catch {
    // ignore parse errors
  }
  process.exit(0);
});
