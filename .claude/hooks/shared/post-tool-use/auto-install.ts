// PostToolUse hook (Write|Edit): 套件管理檔變更後自動安裝
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { basename, dirname } from 'path';

let input = '';
process.stdin.on('data', (chunk: Buffer) => { input += chunk; });
process.stdin.on('end', () => {
  const data = JSON.parse(input || '{}');
  const filePath: string = data.tool_input?.file_path ?? '';

  if (!filePath) process.exit(0);

  const base = basename(filePath);
  const dir = dirname(filePath);

  try {
    if (base === 'package.json') {
      if (existsSync(`${dir}/pnpm-lock.yaml`)) {
        try {
          execSync('pnpm install --frozen-lockfile', { cwd: dir, stdio: 'ignore' });
        } catch {
          execSync('pnpm install', { cwd: dir, stdio: 'ignore' });
        }
      } else if (existsSync(`${dir}/package-lock.json`)) {
        execSync('npm install', { cwd: dir, stdio: 'ignore' });
      }
    } else if (base === 'Package.swift') {
      execSync('swift build', { cwd: dir, stdio: 'ignore' });
    } else if (base === 'Project.swift') {
      execSync('tuist generate', { cwd: dir, stdio: 'ignore' });
    }
  } catch { /* ignore errors */ }

  process.exit(0);
});
