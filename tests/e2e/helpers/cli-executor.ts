/**
 * CLI 執行器
 * 提供執行 agent-ide CLI 命令的工具函式
 */

import { spawn } from 'child_process';
import * as path from 'path';

export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CLIExecutorOptions {
  cwd?: string;
  timeout?: number;
}

/**
 * 執行 CLI 命令
 */
export async function executeCLI(
  args: string[],
  options: CLIExecutorOptions = {}
): Promise<CLIResult> {
  const { cwd = process.cwd(), timeout = 30000 } = options;

  // 使用編譯後的 CLI 入口點
  const cliPath = path.join(process.cwd(), 'bin', 'agent-ide.js');

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timeoutId: NodeJS.Timeout | undefined;

    const proc = spawn('node', [cliPath, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    // 設定超時
    timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`CLI 執行超時 (${timeout}ms)`));
    }, timeout);

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1
      });
    });

    proc.on('error', (error) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(error);
    });
  });
}

/**
 * 執行 index 命令
 */
export async function indexProject(
  projectPath: string,
  options: CLIExecutorOptions = {}
): Promise<CLIResult> {
  return executeCLI(['index', '--path', projectPath], options);
}

/**
 * 執行 search 命令
 */
export async function searchCode(
  projectPath: string,
  query: string,
  options: CLIExecutorOptions = {}
): Promise<CLIResult> {
  return executeCLI(['search', query, '--path', projectPath], options);
}

/**
 * 執行 rename 命令
 */
export async function renameSymbol(
  filePath: string,
  line: number,
  column: number,
  newName: string,
  options: CLIExecutorOptions = {}
): Promise<CLIResult> {
  return executeCLI(
    ['rename', filePath, `${line}:${column}`, newName],
    options
  );
}

/**
 * 執行 move 命令
 */
export async function moveFile(
  sourcePath: string,
  targetPath: string,
  options: CLIExecutorOptions = {}
): Promise<CLIResult> {
  return executeCLI(['move', sourcePath, targetPath], options);
}

/**
 * 執行 analyze 命令
 */
export async function analyzeCode(
  filePath: string,
  options: CLIExecutorOptions = {}
): Promise<CLIResult> {
  return executeCLI(['analyze', filePath], options);
}

/**
 * 執行 deps 命令
 */
export async function analyzeDependencies(
  projectPath: string,
  options: CLIExecutorOptions = {}
): Promise<CLIResult> {
  return executeCLI(['deps', projectPath], options);
}
