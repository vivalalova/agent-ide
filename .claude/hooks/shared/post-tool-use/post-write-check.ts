// PostToolUse hook (Write|Edit): 品質檢查 + 標記需驗證
import { existsSync, readFileSync, writeFileSync } from 'fs';

let input = '';
process.stdin.on('data', (chunk: Buffer) => { input += chunk; });
process.stdin.on('end', () => {
  const data = JSON.parse(input || '{}');
  const filePath: string = data.tool_input?.file_path ?? '';
  const sessionId: string = data.session_id ?? '';

  if (!filePath || !existsSync(filePath)) process.exit(0);

  const messages: string[] = [];
  const content = readFileSync(filePath, 'utf8');

  // Check 1: 檔案超 800 行
  const lines = content.split('\n').length;
  if (lines > 800) {
    messages.push(`⚠️ ${filePath} 已達 ${lines} 行，超過 800 行上限。應拆分檔案。`);
  }

  // Check 2: 非測試檔含 mock data
  if (!/[/\\](test|spec|mock|fixture|seed|__tests__|__mocks__)/i.test(filePath)) {
    if (/\b(mockData|dummyData|faker\.|seedData|testData)\b/.test(content)) {
      messages.push(`⚠️ ${filePath} 疑似含 mock data（非測試檔禁 mock data）`);
    }
  }

  // Check 3: 標記需要驗證
  if (sessionId) {
    try { writeFileSync(`/tmp/claude-${sessionId}-needs-verify`, ''); } catch { /* ignore */ }
  }

  if (messages.length > 0) console.log(messages.join('\n'));
  process.exit(0);
});
