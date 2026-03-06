// PostToolUse hook (Write|Edit): 依副檔名自動格式化
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { extname, dirname } from 'path';
import { homedir } from 'os';

let input = '';
process.stdin.on('data', (chunk: Buffer) => { input += chunk; });
process.stdin.on('end', () => {
  const data = JSON.parse(input || '{}');
  const filePath: string = data.tool_input?.file_path ?? '';

  if (!filePath || !existsSync(filePath)) process.exit(0);

  // 跳過 ~/.claude/ 目錄（含 shell glob patterns，formatter 會誤處理）
  if (filePath.startsWith(homedir() + '/.claude/')) process.exit(0);

  const ext = extname(filePath).slice(1);

  let projRoot = '';
  try {
    projRoot = execSync('git rev-parse --show-toplevel', {
      cwd: dirname(filePath),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch { /* not a git repo */ }

  const hasConfig = (...files: string[]): boolean => {
    if (!projRoot) return false;
    return files.some(f => existsSync(`${projRoot}/${f}`));
  };

  try {
    if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
      if (hasConfig('eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml')) {
        execSync(`npx eslint --fix "${filePath}"`, { stdio: 'ignore' });
      }
    } else if (['css', 'scss', 'sass', 'less'].includes(ext)) {
      if (hasConfig('.stylelintrc', '.stylelintrc.js', '.stylelintrc.json', 'stylelint.config.js', 'stylelint.config.mjs')) {
        execSync(`npx stylelint --fix "${filePath}"`, { stdio: 'ignore' });
      }
    } else if (ext === 'py') {
      execSync(`uvx ruff format "${filePath}"`, { stdio: 'ignore' });
      execSync(`uvx ruff check --fix "${filePath}"`, { stdio: 'ignore' });
    } else if (ext === 'md') {
      if (hasConfig('.prettierrc', '.prettierrc.js', '.prettierrc.json', '.prettierrc.yml', 'prettier.config.js', 'prettier.config.mjs')) {
        execSync(`npx prettier --write "${filePath}"`, { stdio: 'ignore' });
      }
      if (hasConfig('.markdownlint.json', '.markdownlint.jsonc', '.markdownlint.yml', '.markdownlint-cli2.jsonc')) {
        execSync(`npx markdownlint-cli2 --fix "${filePath}"`, { stdio: 'ignore' });
      }
    } else if (ext === 'sql') {
      execSync(`npx sql-formatter -l postgresql -u "${filePath}"`, { stdio: 'ignore' });
    }
  } catch { /* ignore formatter errors */ }

  process.exit(0);
});
