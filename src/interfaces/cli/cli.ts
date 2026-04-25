/**
 * CLI 介面實作
 * 提供命令列介面來操作 Agent IDE 功能
 */

import { Command } from 'commander';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { TypeScriptParser } from '@plugins/typescript/parser.js';
import { JavaScriptParser } from '@plugins/javascript/parser.js';
import { FileSystem, type IFileSystem } from '@infrastructure/storage/index.js';
import { logger, LogLevel } from '@infrastructure/logging/index.js';
import {
  setupMoveCommand,
  setupRenameCommand,
  setupChangeSignatureCommand,
  setupCyclesCommand,
  setupImpactCommand,
  setupSnapshotCommand,
  setupFindReferencesCommand,
  setupCallHierarchyCommand,
  setupDeadCodeCommand,
  setupSearchCommand,
  type CommandContext
} from '@interfaces/cli/commands/index.js';
import { readFileSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 讀取 package.json 版本
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.resolve(__dirname, '../../../package.json');

export function readPackageVersion(targetPath: string = packageJsonPath): string {
  let packageJson: { version?: unknown };
  try {
    packageJson = JSON.parse(readFileSync(targetPath, 'utf-8')) as { version?: unknown };
  } catch (error) {
    throw new Error(`Cannot read package version from ${targetPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (typeof packageJson.version !== 'string' || packageJson.version.trim().length === 0) {
    throw new Error(`Invalid package version in ${targetPath}`);
  }

  return packageJson.version;
}

const packageVersion = readPackageVersion();

export class AgentIdeCLI {
  private program: Command;
  private fileSystem: IFileSystem;

  /**
   * 建立 CLI 實例
   * @param fileSystem - 檔案系統實例（可選，預設使用真實檔案系統）
   */
  constructor(fileSystem?: IFileSystem) {
    this.program = new Command();
    // eslint-disable-next-line custom/no-default-instance-in-constructor -- CLI 入口點需要預設 FileSystem
    this.fileSystem = fileSystem ?? new FileSystem();
    this.setupCommands();
    this.initializeParsers();
  }

  /**
   * 建立測試用 CLI 實例
   */
  static createForTesting(fileSystem: IFileSystem): AgentIdeCLI {
    return new AgentIdeCLI(fileSystem);
  }

  /**
   * 執行 CLI 程式
   */
  async run(argv: string[]): Promise<void> {
    await this.program.parseAsync(argv);
  }

  private initializeParsers(): void {
    try {
      const registry = ParserRegistry.getInstance();

      // 檢查 registry 是否可用
      if (!registry) {
        logger.verbose('parser', 'Parser registry not available');
        return;
      }

      // 在測試環境中，檢查是否已經有測試 Parser 註冊
      if (process.env.NODE_ENV === 'test') {
        // 如果所有測試 Parser 都已經註冊，就不需要重複註冊
        const tsParser = registry.getParserByName('typescript');
        const jsParser = registry.getParserByName('javascript');
        if (tsParser && jsParser) {
          return;
        }
      }

      // 嘗試註冊內建的 TypeScript Parser
      try {
        const tsParser = new TypeScriptParser();
        if (!registry.getParserByName('typescript')) {
          registry.register(tsParser);
        }
      } catch (tsError) {
        logger.verbose('parser', `TypeScript parser loading failed: ${tsError}`);
      }

      // 嘗試註冊內建的 JavaScript Parser
      try {
        const jsParser = new JavaScriptParser();
        if (!registry.getParserByName('javascript')) {
          registry.register(jsParser);
        }
      } catch (jsError) {
        logger.verbose('parser', `JavaScript parser loading failed: ${jsError}`);
      }

    } catch (error) {
      logger.verbose('parser', `Parser initialization warning: ${error}`);
    }
  }

  private setupCommands(): void {
    this.program
      .name('agent-ide')
      .description('程式碼智能工具集 for AI Agents')
      .version(packageVersion)
      .option('--no-cache', '停用索引快取')
      .option('--verbose', '顯示詳細處理資訊');

    this.program.hook('preAction', (thisCommand) => {
      const opts = thisCommand.optsWithGlobals() as { verbose?: boolean };
      logger.setLevel(opts.verbose ? LogLevel.Verbose : LogLevel.Normal);
    });

    const context = this.createCommandContext();

    // Transform 命令
    setupRenameCommand(this.program, context);
    setupChangeSignatureCommand(this.program, context);
    setupMoveCommand(this.program, context);

    // Query 命令
    setupCyclesCommand(this.program, context);
    setupImpactCommand(this.program, context);
    setupSnapshotCommand(this.program, context);
    setupFindReferencesCommand(this.program, context);
    setupCallHierarchyCommand(this.program, context);
    setupDeadCodeCommand(this.program, context);
    setupSearchCommand(this.program, context);
  }

  /**
   * 建立命令共用 Context
   */
  private createCommandContext(): CommandContext {
    return {
      fileSystem: this.fileSystem
    };
  }
}
