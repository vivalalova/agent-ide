/**
 * CLI rename 缺陷單元測試（reproduction，先紅後綠）
 *
 * N1：rename.command.ts 的 workspacePath 直接採用 `options.path` 原始字串，
 *     未經 path.resolve 正規化。當使用者傳入的 `--path` 是相對路徑時，
 *     IndexEngine 索引出的符號位置（透過 glob 取得，會被底層 glob 實作正規化
 *     為絕對路徑）與 rename.command.ts 自行走訪 `getAllProjectFiles()` 取得的
 *     檔案清單（單純 `path.join(dirPath, entry.name)`，保留原始相對字串）
 *     格式不一致，導致 language-service.ts / reference-updater.ts /
 *     symbol-finder.ts 的裸字串路徑比對全部失效，rename 靜默回報 0 changes。
 *
 * N2-a：上述路徑格式不一致的連帶後果之一——當專案含多檔案時，符號定義所在的
 *       檔案本身可能因路徑字串形式不吻合被排除在變更範圍外，導致「定義端漏改」
 *       （即使其他檔案的引用端仍可能被更新，見 N2-b regression：
 *       tests/e2e/commands/typescript/cli-rename-alias-path-bugs.e2e.test.ts）。
 *
 * 兩者僅在 workspacePath 為相對路徑時重現；絕對路徑（含 memfs E2E 固定使用的
 * `/test-workspace` 虛擬絕對根目錄）下不受影響，故本檔改用真實檔案系統
 * （`AgentIdeCLI` 預設的 `FileSystem`）+ 真實暫存目錄重現，非走 memfs E2E。
 */

import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentIdeCLI } from '@interfaces/cli/cli.js';
import { Logger } from '@infrastructure/logging/index.js';

/**
 * 以真實 FileSystem 執行 CLI，捕獲輸出（複製 tests/helpers/cli-executor.ts 的
 * console 攔截邏輯；該共用 helper 的 ExecuteOptions 型別限定 MemFileSystem，
 * 本檔需要真實 FileSystem 走真實磁碟路徑正規化行為，故不共用）。
 */
async function runCLIOnRealFs(args: string[]): Promise<{ exitCode: number; stdout: string }> {
  const cli = new AgentIdeCLI();
  const stdout: string[] = [];
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  console.log = (...logArgs: unknown[]) => {
    stdout.push(logArgs.map(String).join(' '));
  };

  let exitCode = 0;
  try {
    await cli.run(['node', 'agent-ide', ...args]);
    if (process.exitCode !== undefined && process.exitCode !== 0) {
      exitCode = process.exitCode;
    }
  } finally {
    console.log = originalLog;
    process.exitCode = originalExitCode;
    Logger.resetInstance();
  }

  return { exitCode, stdout: stdout.join('\n') };
}

describe('CLI rename 缺陷 regression（N1 / N2-a：相對 workspacePath）', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createTempProject(): string {
    const dir = mkdtempSync(join(tmpdir(), 'agent-ide-rename-relpath-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'tmp-proj', version: '1.0.0' }), 'utf-8');
    mkdirSync(join(dir, 'src'), { recursive: true });
    return dir;
  }

  it('N1：--path 為相對路徑時，單檔內定義與呼叫點都應被重新命名（目前靜默 0 changes）', async () => {
    const projectDir = createTempProject();
    const targetFile = join(projectDir, 'src', 'target2.ts');
    writeFileSync(targetFile, [
      'export function fetchLocal(): string {',
      '  return \'data\';',
      '}',
      '',
      'export function wrapper(): string {',
      '  return fetchLocal();',
      '}'
    ].join('\n') + '\n', 'utf-8');

    // 刻意傳入相對路徑（相對於目前 process.cwd()，非以 chdir 改變全域狀態）
    const relativeProjectPath = relative(process.cwd(), projectDir);

    const result = await runCLIOnRealFs([
      'rename', '--path', relativeProjectPath,
      '--from', 'fetchLocal', '--to', 'loadLocal',
      '--format', 'json'
    ]);

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const updated = readFileSync(targetFile, 'utf-8');
    expect(updated).toContain('export function loadLocal(): string {');
    expect(updated).toContain('return loadLocal();');
    expect(updated).not.toContain('fetchLocal');
  });

  it('N2-a：--path 為相對路徑時，符號定義所在檔案本身也應被重新命名（目前定義端漏改）', async () => {
    const projectDir = createTempProject();
    const targetFile = join(projectDir, 'src', 'n2-target.ts');
    const useFile = join(projectDir, 'src', 'n2-use.ts');

    writeFileSync(targetFile, [
      'export function fetchData(): string {',
      '  return \'data\';',
      '}'
    ].join('\n') + '\n', 'utf-8');

    writeFileSync(useFile, [
      'import { fetchData as fd } from \'./n2-target.js\';',
      '',
      'export function run(): string {',
      '  return fd();',
      '}'
    ].join('\n') + '\n', 'utf-8');

    const relativeProjectPath = relative(process.cwd(), projectDir);

    const result = await runCLIOnRealFs([
      'rename', '--path', relativeProjectPath,
      '--from', 'fetchData', '--to', 'loadData',
      '--format', 'json'
    ]);

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const updatedTarget = readFileSync(targetFile, 'utf-8');
    expect(updatedTarget).toContain('export function loadData(): string {');
    expect(updatedTarget).not.toContain('fetchData');
  });
});
