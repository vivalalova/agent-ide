/**
 * CLI 執行器
 * 執行 AgentIdeCLI 並捕獲輸出
 */

import { AgentIdeCLI } from '../../src/interfaces/cli/cli.js';
import type { MemFileSystem } from '../../src/infrastructure/storage/mem-file-system.js';

/** CLI 執行結果 */
export interface CLIResult {
  /** 退出碼（0 表示成功） */
  exitCode: number;
  /** 標準輸出 */
  stdout: string;
  /** 標準錯誤輸出 */
  stderr: string;
  /** 執行時間（毫秒） */
  duration: number;
}

/** CLI 執行選項 */
export interface ExecuteOptions {
  /** memfs 實例 */
  memfs: MemFileSystem;
  /** 工作目錄 */
  cwd?: string;
}

/**
 * 執行 CLI 命令
 * @param args - CLI 參數（不包含 node 和 agent-ide）
 * @param options - 執行選項
 */
export async function executeCLI(args: string[], options: ExecuteOptions): Promise<CLIResult> {
  const cli = new AgentIdeCLI(options.memfs);

  // 攔截 console.log 和 console.error
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...logArgs: unknown[]) => {
    stdout.push(logArgs.map(String).join(' '));
  };

  console.error = (...logArgs: unknown[]) => {
    stderr.push(logArgs.map(String).join(' '));
  };

  console.warn = (...logArgs: unknown[]) => {
    stderr.push(logArgs.map(String).join(' '));
  };

  const startTime = performance.now();
  let exitCode = 0;

  try {
    // 執行 CLI，模擬 node agent-ide <args>
    await cli.run(['node', 'agent-ide', ...args]);
  } catch (error) {
    exitCode = 1;
    if (error instanceof Error) {
      stderr.push(error.message);
    }
  } finally {
    // 還原 console
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }

  const duration = performance.now() - startTime;

  return {
    exitCode,
    stdout: stdout.join('\n'),
    stderr: stderr.join('\n'),
    duration,
  };
}

/**
 * 解析 JSON 輸出
 * @param result - CLI 執行結果
 */
export function parseJSONOutput<T>(result: CLIResult): T {
  if (result.exitCode !== 0) {
    throw new Error(`CLI failed with exit code ${result.exitCode}: ${result.stderr}`);
  }

  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(`Failed to parse JSON output: ${result.stdout}`);
  }
}

/**
 * 驗證 CLI 執行成功
 * @param result - CLI 執行結果
 */
export function expectSuccess(result: CLIResult): void {
  if (result.exitCode !== 0) {
    throw new Error(`Expected CLI to succeed, but got exit code ${result.exitCode}.\nStderr: ${result.stderr}`);
  }
}

/**
 * 驗證 CLI 執行失敗
 * @param result - CLI 執行結果
 */
export function expectFailure(result: CLIResult): void {
  if (result.exitCode === 0) {
    throw new Error(`Expected CLI to fail, but it succeeded.\nStdout: ${result.stdout}`);
  }
}
