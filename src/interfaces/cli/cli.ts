/**
 * CLI 介面實作
 * 提供命令列介面來操作 Agent IDE 功能
 */

import { Command } from 'commander';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { TypeScriptParser } from '@plugins/typescript/parser.js';
import { JavaScriptParser } from '@plugins/javascript/parser.js';
import { SwiftParser } from '@plugins/swift/parser.js';
import { PythonParser } from '@plugins/python/parser.js';
import { FileSystem, type IFileSystem } from '@infrastructure/storage/index.js';
import {
  setupMoveCommand,
  setupMoveMemberCommand,
  setupRenameCommand,
  setupChangeSignatureCommand,
  setupCyclesCommand,
  setupImpactCommand,
  setupSnapshotCommand,
  type CommandContext
} from '@interfaces/cli/commands/index.js';
import { readFileSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 讀取 package.json 版本
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.resolve(__dirname, '../../../package.json');
let packageVersion = '0.1.0'; // fallback

try {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  packageVersion = packageJson.version;
} catch {
  // 使用 fallback 版本
}

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
        console.debug('Parser registry not available');
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
        // 如果 TypeScript Parser 載入失敗，記錄錯誤
        console.debug('TypeScript parser loading failed:', tsError);
        console.debug('TypeScript Parser initialization warning:', tsError);
      }

      // 嘗試註冊內建的 JavaScript Parser
      try {
        const jsParser = new JavaScriptParser();
        if (!registry.getParserByName('javascript')) {
          registry.register(jsParser);
        }
      } catch (jsError) {
        // 如果 JavaScript Parser 載入失敗，記錄錯誤
        console.debug('JavaScript parser loading failed:', jsError);
        console.debug('JavaScript Parser initialization warning:', jsError);
      }

      // 嘗試註冊內建的 Swift Parser
      try {
        // 解析 Swift CLI Bridge 路徑
        const swiftBridgePath = path.resolve(__dirname, '../../plugins/swift/swift-bridge/swift-parser');
        const swiftParser = new SwiftParser(swiftBridgePath);
        if (!registry.getParserByName('swift')) {
          registry.register(swiftParser);
        }
      } catch (swiftError) {
        // 如果 Swift Parser 載入失敗，記錄錯誤
        console.debug('Swift parser loading failed:', swiftError);
        console.debug('Swift Parser initialization warning:', swiftError);
      }

      // 嘗試註冊內建的 Python Parser
      try {
        const pythonParser = new PythonParser();
        if (!registry.getParserByName('python')) {
          registry.register(pythonParser);
        }
      } catch (pythonError) {
        // 如果 Python Parser 載入失敗，記錄錯誤
        console.debug('Python parser loading failed:', pythonError);
        console.debug('Python Parser initialization warning:', pythonError);
      }
    } catch (error) {
      // 靜默處理初始化錯誤，避免影響 CLI 啟動
      console.debug('Parser initialization warning:', error);
    }
  }

  private setupCommands(): void {
    this.program
      .name('agent-ide')
      .description('程式碼智能工具集 for AI Agents')
      .version(packageVersion);

    const context = this.createCommandContext();

    // Transform 命令
    setupRenameCommand(this.program, context);
    setupChangeSignatureCommand(this.program, context);
    setupMoveCommand(this.program, context);
    setupMoveMemberCommand(this.program, context);

    // Query 命令
    setupCyclesCommand(this.program, context);
    setupImpactCommand(this.program, context);
    setupSnapshotCommand(this.program, context);
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