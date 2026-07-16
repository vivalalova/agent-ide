/**
 * CLI rename 缺陷 regression（先紅後綠）
 *
 * getAllProjectFiles()（src/interfaces/cli/commands/rename.command.ts 的 walkDir，
 * 約 366-392 行）在遞迴走訪子目錄時，對 `context.fileSystem.readDirectory(dir)`
 * 拋出的錯誤（例如權限不足導致 EACCES）僅 `catch { /* 靜默跳過 * / }`，
 * 不記錄、不往外拋。該子目錄底下所有檔案因此完全被排除在
 * `allProjectFiles`（餵給 RenameEngine.generateChangeset 的 filePaths）之外，
 * 即使 IndexEngine（走 fileSystem.glob，不受影響）已正確索引到該目錄內的符號
 * 引用。結果：rename 對此引用是「靜默漏改」，且 CLI 仍回報 success，
 * 對使用者呈現「已完成」的假象，實際留下不一致的程式碼。
 *
 * 本測試建構一個 `readDirectory` 對特定子目錄拋錯的 IFileSystem（模擬權限被拒），
 * 驗證正確行為：該子目錄內對重新命名符號的引用，仍應被找到並更新
 * （或至少 CLI 應回報失敗，而非靜默宣告成功）。目前兩者皆不成立。
 */

import { describe, expect, it } from 'vitest';
import { AgentIdeCLI } from '@interfaces/cli/cli.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { Logger } from '@infrastructure/logging/index.js';
import type { IFileSystem, DirectoryEntry } from '@infrastructure/storage/file-system.interface.js';

/**
 * 包裝一個 MemFileSystem，讓對指定目錄的 readDirectory 拋出錯誤，
 * 模擬真實檔案系統中該子目錄權限被拒（EACCES）的情況。
 * 其餘方法（含 glob，IndexEngine 走的路徑）完全透明轉發給底層 MemFileSystem。
 */
function createPermissionDeniedFileSystem(inner: MemFileSystem, blockedDir: string): IFileSystem {
  const wrapped = Object.create(inner) as MemFileSystem;
  wrapped.readDirectory = async (dirPath: string): Promise<DirectoryEntry[]> => {
    if (dirPath === blockedDir) {
      throw new Error(`EACCES: permission denied, scandir '${dirPath}'`);
    }
    return inner.readDirectory(dirPath);
  };
  return wrapped as unknown as IFileSystem;
}

async function runCLI(fileSystem: IFileSystem, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const cli = new AgentIdeCLI(fileSystem);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  console.log = (...logArgs: unknown[]) => { stdout.push(logArgs.map(String).join(' ')); };
  console.error = (...logArgs: unknown[]) => { stderr.push(logArgs.map(String).join(' ')); };
  console.warn = (...logArgs: unknown[]) => { stderr.push(logArgs.map(String).join(' ')); };

  let exitCode = 0;
  try {
    await cli.run(['node', 'agent-ide', ...args]);
    if (process.exitCode !== undefined && process.exitCode !== 0) {
      exitCode = process.exitCode;
    }
  } catch (error) {
    exitCode = 1;
    if (error instanceof Error) {
      stderr.push(error.message);
    }
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exitCode = originalExitCode;
    Logger.resetInstance();
  }

  return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

describe('CLI rename 缺陷 regression（目錄走訪 readDirectory 拋錯被靜默吞掉）', () => {
  it('子目錄 readDirectory 拋錯時，該目錄內的引用不應被靜默漏改（目前靜默漏改且仍回報 success）', async () => {
    const memfs = new MemFileSystem();
    await memfs.fromJSON({
      '/project/package.json': JSON.stringify({ name: 'tmp-proj', version: '1.0.0' }),
      '/project/src/target.ts': [
        'export function targetFn(): string {',
        '  return \'data\';',
        '}',
        ''
      ].join('\n'),
      '/project/src/normal/user.ts': [
        'import { targetFn } from \'../target.js\';',
        '',
        'export function run(): string {',
        '  return targetFn();',
        '}',
        ''
      ].join('\n'),
      '/project/src/locked/user2.ts': [
        'import { targetFn } from \'../target.js\';',
        '',
        'export function run2(): string {',
        '  return targetFn();',
        '}',
        ''
      ].join('\n'),
    });

    const fileSystem = createPermissionDeniedFileSystem(memfs, '/project/src/locked');

    const result = await runCLI(fileSystem, [
      'rename', '--path', '/project',
      '--from', 'targetFn', '--to', 'loadedFn',
      '--format', 'json'
    ]);

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const normalContent = await memfs.readFile('/project/src/normal/user.ts', 'utf-8') as string;
    const lockedContent = await memfs.readFile('/project/src/locked/user2.ts', 'utf-8') as string;

    // 可讀目錄內的引用有被正確改到（證明重新命名機制本身正常運作）
    expect(normalContent).toContain('loadedFn');
    expect(normalContent).not.toContain('targetFn');

    // 正確行為：readDirectory 對某子目錄拋錯不應導致該目錄內容被整個排除在
    // rename 掃描範圍外——引用應仍被找到並更新。
    // 目前：locked/user2.ts 完全沒被納入 allProjectFiles，這裡的引用被靜默漏改，
    // 但 CLI 仍對外回報 success:true，此斷言目前會失敗，證明缺陷存在。
    expect(lockedContent).toContain('loadedFn');
    expect(lockedContent).not.toContain('targetFn');
  });
});
