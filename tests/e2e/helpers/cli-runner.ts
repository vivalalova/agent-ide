/**
 * CLI 測試工具類
 * 提供完整的 CLI 命令執行、輸出攔截和結果驗證功能
 */

import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { AgentIdeCLI } from '@interfaces/cli/cli';
import { ParserRegistry } from '@infrastructure/parser/registry';
import { registerTestParsers } from '../../test-utils/test-parsers';
import { reportMemoryUsage, withTimeout } from '../setup';

/**
 * CLI 執行結果介面
 */
export interface CLIResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  success: boolean;
  error?: Error;
}

/**
 * CLI 執行選項
 */
export interface CLIRunOptions {
  cwd?: string;
  input?: string;
  timeout?: number;
  env?: Record<string, string>;
  silent?: boolean;
}

/**
 * CLI 測試執行器
 * 提供完整的 CLI 測試功能，包括輸出攔截、環境隔離、記憶體監控
 */
export class CLIRunner {
  private tempDir: string = '';
  private testName: string = '';

  /**
   * 初始化 CLI 測試執行器
   */
  constructor(testName?: string) {
    this.testName = testName || 'cli-test';
  }

  /**
   * 設定測試環境
   */
  async setup(): Promise<void> {
    // 建立獨立的臨時目錄
    this.tempDir = await mkdtemp(join(tmpdir(), `agent-ide-cli-${this.testName}-`));

    // 重置 Parser 註冊表
    ParserRegistry.resetInstance();
    registerTestParsers();
  }

  /**
   * 清理測試環境
   */
  async cleanup(): Promise<void> {
    if (this.tempDir) {
      try {
        await rm(this.tempDir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`清理臨時目錄失敗: ${error}`);
      }
    }

    // 清理 Parser 註冊表
    try {
      const registry = ParserRegistry.getInstance();
      await registry.dispose();
    } catch (error) {
      // 忽略清理錯誤
    }
    ParserRegistry.resetInstance();
  }

  /**
   * 執行 CLI 命令並返回結果
   */
  async runCLI(args: string[], options: CLIRunOptions = {}): Promise<CLIResult> {
    const startTime = Date.now();
    const timeout = options.timeout || 30000; // 預設 30 秒超時

    const executeCommand = async (): Promise<CLIResult> => {
      let exitCode = 0;
      let stdout = '';
      let stderr = '';
      let error: Error | undefined;

      // 保存原始環境
      const originalEnv = { ...process.env };
      const originalNodeEnv = process.env.NODE_ENV;
      const originalLog = console.log;
      const originalError = console.error;
      const originalProcessExit = process.exit;
      const originalProcessCwd = process.cwd;
      const originalStdoutWrite = process.stdout.write;
      const originalStderrWrite = process.stderr.write;

      try {
        // 設定測試環境
        process.env.NODE_ENV = 'test';
        if (options.env) {
          Object.assign(process.env, options.env);
        }

        // 攔截輸出
        console.log = (...args) => {
          if (!options.silent) {
            stdout += args.join(' ') + '\n';
          }
        };

        console.error = (...args) => {
          if (!options.silent) {
            stderr += args.join(' ') + '\n';
          }
        };

        // 攔截 process 輸出流
        process.stdout.write = ((chunk: any) => {
          if (!options.silent) {
            if (typeof chunk === 'string') {
              stdout += chunk;
            } else if (Buffer.isBuffer(chunk)) {
              stdout += chunk.toString();
            }
          }
          return true;
        }) as any;

        process.stderr.write = ((chunk: any) => {
          if (!options.silent) {
            if (typeof chunk === 'string') {
              stderr += chunk;
            } else if (Buffer.isBuffer(chunk)) {
              stderr += chunk.toString();
            }
          }
          return true;
        }) as any;

        // 攔截 process.exit
        process.exit = ((code?: number) => {
          exitCode = code || 0;
          throw new Error('PROCESS_EXIT');
        }) as any;

        // 變更工作目錄
        if (options.cwd) {
          process.cwd = () => options.cwd!;
        }

        // 執行 CLI 命令
        const cli = new AgentIdeCLI();
        const fullArgv = ['node', 'agent-ide', ...args];

        await cli.run(fullArgv);

      } catch (err) {
        if ((err as Error).message === 'PROCESS_EXIT') {
          // 正常的 process.exit 調用
        } else {
          // 真正的錯誤
          error = err as Error;
          stderr += `錯誤: ${error.message}\n`;
          exitCode = 1;
        }
      } finally {
        // 恢復原始環境
        process.env = originalEnv;
        process.env.NODE_ENV = originalNodeEnv;
        console.log = originalLog;
        console.error = originalError;
        process.exit = originalProcessExit;
        process.cwd = originalProcessCwd;
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
      }

      const duration = Date.now() - startTime;

      return {
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        duration,
        success: exitCode === 0,
        error
      };
    };

    // 執行命令（帶超時控制）
    const result = await withTimeout(
      executeCommand(),
      timeout,
      `CLI-${this.testName}-${args.join('-')}`
    );

    // 報告記憶體使用情況
    reportMemoryUsage(`CLI ${this.testName}: ${args.join(' ')}`);

    return result;
  }

  /**
   * 執行命令並驗證成功
   */
  async runCLIExpectSuccess(
    args: string[],
    options: CLIRunOptions = {}
  ): Promise<CLIResult> {
    const result = await this.runCLI(args, options);

    if (!result.success) {
      throw new Error(
        'CLI 命令執行失敗:\n' +
        `命令: agent-ide ${args.join(' ')}\n` +
        `退出碼: ${result.exitCode}\n` +
        `標準輸出: ${result.stdout}\n` +
        `錯誤輸出: ${result.stderr}\n` +
        `錯誤: ${result.error?.message || '無'}`
      );
    }

    return result;
  }

  /**
   * 執行命令並驗證失敗
   */
  async runCLIExpectFailure(
    args: string[],
    expectedExitCode?: number,
    options: CLIRunOptions = {}
  ): Promise<CLIResult> {
    const result = await this.runCLI(args, options);

    if (result.success) {
      throw new Error(
        'CLI 命令預期失敗但成功了:\n' +
        `命令: agent-ide ${args.join(' ')}\n` +
        `標準輸出: ${result.stdout}`
      );
    }

    if (expectedExitCode !== undefined && result.exitCode !== expectedExitCode) {
      throw new Error(
        'CLI 命令退出碼不符預期:\n' +
        `命令: agent-ide ${args.join(' ')}\n` +
        `預期退出碼: ${expectedExitCode}\n` +
        `實際退出碼: ${result.exitCode}\n` +
        `錯誤輸出: ${result.stderr}`
      );
    }

    return result;
  }

  /**
   * 驗證 JSON 輸出格式
   */
  validateJSONOutput(result: CLIResult): any {
    if (!result.success) {
      throw new Error(`命令執行失敗，無法驗證 JSON 輸出: ${result.stderr}`);
    }

    try {
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(
        'JSON 輸出格式無效:\n' +
        `輸出: ${result.stdout}\n` +
        `錯誤: ${error}`
      );
    }
  }

  /**
   * 驗證 minimal 格式輸出
   */
  validateMinimalOutput(result: CLIResult): string[] {
    if (!result.success) {
      throw new Error(`命令執行失敗，無法驗證 minimal 輸出: ${result.stderr}`);
    }

    const lines = result.stdout.trim().split('\n').filter(line => line.trim());

    lines.forEach((line, index) => {
      // minimal 格式: 檔案:行:列:內容
      if (!line.match(/.*:\d+:\d+:.*/)) {
        throw new Error(
          `第 ${index + 1} 行的 minimal 格式無效:\n` +
          `行內容: ${line}\n` +
          '預期格式: 檔案:行:列:內容'
        );
      }
    });

    return lines;
  }

  /**
   * 驗證命令輸出包含預期內容
   */
  expectOutputContains(result: CLIResult, expectedText: string): void {
    const fullOutput = result.stdout + result.stderr;
    if (!fullOutput.includes(expectedText)) {
      throw new Error(
        '輸出不包含預期文字:\n' +
        `預期: ${expectedText}\n` +
        `實際輸出: ${fullOutput}`
      );
    }
  }

  /**
   * 驗證命令輸出匹配正則表達式
   */
  expectOutputMatches(result: CLIResult, pattern: RegExp): void {
    const fullOutput = result.stdout + result.stderr;
    if (!pattern.test(fullOutput)) {
      throw new Error(
        '輸出不匹配預期模式:\n' +
        `模式: ${pattern}\n` +
        `實際輸出: ${fullOutput}`
      );
    }
  }

  /**
   * 取得臨時目錄路徑
   */
  getTempDir(): string {
    return this.tempDir;
  }

  /**
   * 取得測試名稱
   */
  getTestName(): string {
    return this.testName;
  }

  /**
   * 執行命令（兼容性方法，E2E 測試使用的別名）
   */
  async runCommand(command: string | string[], options: CLIRunOptions = {}): Promise<CLIResult> {
    let args: string[];

    if (typeof command === 'string') {
      // 解析命令字串為參數陣列
      args = command.split(' ').filter(arg => arg.trim() !== '');
    } else {
      // 直接使用陣列
      args = command;
    }

    return this.runCLI(args, options);
  }
}