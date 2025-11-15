/**
 * CLI 介面實作
 * 提供命令列介面來操作 Agent IDE 功能
 */

import { Command } from 'commander';
import { IndexEngine } from '../../core/indexing/index-engine.js';
import { DependencyAnalyzer } from '../../core/dependency/dependency-analyzer.js';
import { RenameEngine } from '../../core/rename/rename-engine.js';
import { ImportResolver, MoveService } from '../../core/move/index.js';
import { SearchService } from '../../core/search/service.js';
import { ShiftService } from '../../core/shift/index.js';
import { createIndexConfig } from '../../core/indexing/types.js';
import { ParserRegistry } from '../../infrastructure/parser/registry.js';
import { TypeScriptParser } from '../../plugins/typescript/parser.js';
import { JavaScriptParser } from '../../plugins/javascript/parser.js';
import { SwiftParser } from '../../plugins/swift/parser.js';
import { ShitScoreAnalyzer } from '../../core/shit-score/shit-score-analyzer.js';
import { SnapshotEngine, SnapshotDiffer, ConfigManager, CompressionLevel } from '../../core/snapshot/index.js';
import type { SnapshotOptions } from '../../core/snapshot/index.js';
import { OutputFormatter, OutputFormat } from './output-formatter.js';
import * as fs from 'fs/promises';
import { readFileSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as FormatUtils from './utils/format-utils.js';
import * as CodeEditUtils from './utils/code-edit-utils.js';
import * as FileUtils from './utils/file-utils.js';
import * as SearchUtils from './utils/search-utils.js';
import * as DependencyUtils from './utils/dependency-utils.js';
import * as SnapshotHandler from './utils/snapshot-handler.js';
import * as PluginsHandler from './handlers/plugins-handler.js';
import * as DepsHandler from './handlers/deps-handler.js';
import * as AnalyzeHandler from './handlers/analyze-handler.js';
import * as SearchHandler from './handlers/search-handler.js';
import * as RenameHandler from './handlers/rename-handler.js';
import * as RefactorHandler from './handlers/refactor-handler.js';
import * as MoveHandler from './handlers/move-handler.js';
import * as ShiftHandler from './handlers/shift-handler.js';
import * as ShitHandler from './handlers/shit-handler.js';
import { DEFAULT_VALUES } from './constants.js';

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
  private indexEngine?: IndexEngine;
  private dependencyAnalyzer?: DependencyAnalyzer;
  private renameEngine?: RenameEngine;
  private importResolver?: ImportResolver;
  private moveService?: MoveService;
  private searchService?: SearchService;
  private shiftService?: ShiftService;

  constructor() {
    this.program = new Command();
    this.setupCommands();
    this.initializeParsers();
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

    this.setupRenameCommand();
    this.setupRefactorCommand();
    this.setupMoveCommand();
    this.setupShiftCommand();
    this.setupSearchCommand();
    this.setupAnalyzeCommand();
    this.setupDepsCommand();
    this.setupShitCommand();
    this.setupSnapshotCommand();
    this.setupPluginsCommand();
  }

  private setupRenameCommand(): void {
    this.program
      .command('rename')
      .description('重新命名程式碼元素')
      .option('-t, --type <type>', '符號類型 (variable|function|class|interface)', 'variable')
      .option('-s, --symbol <name>', '要重新命名的符號')
      .option('-f, --from <name>', '原始名稱（--symbol 的別名）')
      .option('-n, --new-name <name>', '新名稱')
      .option('-o, --to <name>', '新名稱（--new-name 的別名）')
      .option('-p, --path <path>', '檔案或目錄路徑', '.')
      .option('--preview', '預覽變更而不執行')
      .option('--format <format>', '輸出格式 (markdown|plain|json|minimal)', 'plain')
      .action(async (options) => {
        await this.handleRenameCommand(options);
      });
  }

  private setupRefactorCommand(): void {
    this.program
      .command('refactor <action>')
      .description('重構程式碼 (extract-function | extract-closure | inline-function)')
      .option('-f, --file <file>', '檔案路徑')
      .option('--path <path>', '檔案路徑（--file 的別名）')
      .option('-s, --start-line <line>', '起始行號')
      .option('-e, --end-line <line>', '結束行號')
      .option('-n, --function-name <name>', '函式名稱')
      .option('--new-name <name>', '新名稱（--function-name 的別名）')
      .option('-t, --target-file <file>', '目標檔案路徑（跨檔案提取）')
      .option('--preview', '預覽變更而不執行')
      .option('--format <format>', '輸出格式 (markdown|plain|json|minimal)', 'plain')
      .action(async (action, options) => {
        await this.handleRefactorCommand(action, options);
      });
  }

  private setupMoveCommand(): void {
    this.program
      .command('move [source] [target]')
      .description('移動檔案或目錄')
      .option('-s, --source <path>', '來源路徑')
      .option('-t, --target <path>', '目標路徑')
      .option('-p, --path <path>', '專案根目錄路徑', process.cwd())
      .option('--update-imports', '自動更新 import 路徑', true)
      .option('--preview', '預覽變更而不執行')
      .option('--format <format>', '輸出格式 (markdown|plain|json|minimal)', 'plain')
      .action(async (sourceArg, targetArg, options) => {
        // 支援兩種語法：
        // 1. move <source> <target> (位置參數)
        // 2. move --source <source> --target <target> (選項參數)
        const source = sourceArg || options.source;
        const target = targetArg || options.target;

        if (!source || !target) {
          console.error('❌ 必須指定來源和目標路徑');
          console.error('   使用方式: agent-ide move <source> <target>');
          console.error('   或: agent-ide move --source <source> --target <target>');
          if (process.env.NODE_ENV !== 'test') { process.exit(1); }
          return;
        }

        await this.handleMoveCommand(source, target, options);
      });
  }

  private setupShiftCommand(): void {
    this.program
      .command('shift <file>')
      .description('移動檔案中的指定行到目標位置')
      .requiredOption('--from <number>', '起始行號（1-based，包含）')
      .requiredOption('--to <number>', '結束行號（1-based，包含）')
      .requiredOption('--position <number>', '目標位置行號（1-based，插入到此行之前）')
      .option('--target <file>', '目標檔案路徑（必須包含副檔名，例如：newfile.ts）')
      .option('-p, --path <path>', '專案根目錄路徑', process.cwd())
      .option('--no-update-references', '禁用自動更新引用')
      .option('--preview', '預覽變更而不執行')
      .option('--format <format>', '輸出格式 (json|plain)', 'plain')
      .action(async (file, options) => {
        await this.handleShiftCommand(file, options);
      });
  }

  private setupSearchCommand(): void {
    this.program
      .command('search')
      .description('搜尋程式碼')
      .argument('[query]', '搜尋查詢字串（簡化語法，等同於 text 搜尋）')
      .option('-t, --type <type>', '搜尋類型 (text|regex|fuzzy|symbol|function|class|protocol|variable|enum)', 'text')
      .option('-p, --path <path>', '搜尋路徑', '.')
      .option('-e, --extensions <exts>', '檔案副檔名', '.ts,.js,.tsx,.jsx,.swift')
      .option('-l, --limit <num>', '結果數量限制', String(DEFAULT_VALUES.SEARCH_LIMIT))
      .option('-c, --context <lines>', '上下文行數', '2')
      .option('--case-sensitive', '大小寫敏感')
      .option('--case-insensitive', '大小寫不敏感')
      .option('--whole-word', '全字匹配')
      .option('--multiline', '多行匹配')
      .option('--include <patterns>', '包含模式')
      .option('--exclude <patterns>', '排除模式', 'node_modules/**,*.test.*')
      .option('--format <format>', '輸出格式 (list|json|minimal|summary)', 'list')
      .option('-q, --query <name>', '搜尋查詢字串')
      .option('--pattern <pattern>', '符號名稱模式（用於 structural 搜尋）')
      .option('--regex', '使用正則表達式')
      .option('--file-pattern <pattern>', '檔案模式過濾')
      .option('--with-attribute <attr>', '過濾帶有特定屬性的符號')
      .option('--with-modifier <mod>', '過濾帶有特定修飾符的符號')
      .option('--implements <protocol>', '過濾實作特定協定的類別')
      .option('--extends <class>', '過濾繼承特定類別的子類別')
      .action(async (queryOrSubcommand, options) => {
        // 支援三種語法：
        // 1. search <query> --path <path>  (簡化語法，預設為 text 搜尋)
        // 2. search text --query <query> --path <path>
        // 3. search symbol --query <query> --path <path>
        // 4. search structural --type <type> --path <path>

        // 檢查空字串或未提供
        if (!queryOrSubcommand || queryOrSubcommand.trim() === '') {
          console.error('❌ 請提供搜尋查詢或子命令');
          console.error('   使用方式: agent-ide search <query>');
          console.error('   或: agent-ide search text --query <query>');
          console.error('   或: agent-ide search symbol --query <query>');
          process.exitCode = 1;
          if (process.env.NODE_ENV !== 'test') { process.exit(1); }
          return;
        }

        // 判斷是子命令還是查詢字串
        const knownSubcommands = ['text', 'symbol', 'structural'];
        const isSubcommand = knownSubcommands.includes(queryOrSubcommand);

        if (isSubcommand) {
          // 使用子命令語法
          if (queryOrSubcommand === 'symbol') {
            await this.handleSymbolSearchCommand(options);
          } else if (queryOrSubcommand === 'text') {
            await this.handleTextSearchCommand(options);
          } else if (queryOrSubcommand === 'structural') {
            await this.handleStructuralSearchCommand(options);
          }
        } else {
          // 簡化語法：直接使用查詢字串
          await this.handleSearchCommand(queryOrSubcommand, options);
        }
      });
  }

  private setupAnalyzeCommand(): void {
    this.program
      .command('analyze [type]')
      .description('分析程式碼品質')
      .option('-p, --path <path>', '分析路徑', '.')
      .option('--pattern <pattern>', '分析模式')
      .option('--format <format>', '輸出格式 (json|table|summary)', 'summary')
      .option('--all', '顯示所有掃描結果（預設只顯示有問題的項目）', false)
      .action(async (type, options) => {
        await this.handleAnalyzeCommand(type, options);
      });
  }

  private setupDepsCommand(): void {
    this.program
      .command('deps [subcommand]')
      .description('分析依賴關係 (subcommand: graph|cycles|impact|orphans)')
      .option('-p, --path <path>', '分析路徑', '.')
      .option('-f, --file <file>', '特定檔案分析')
      .option('--format <format>', '輸出格式 (json|dot|summary)', 'summary')
      .option('--all', '顯示完整依賴圖（預設只顯示循環依賴和孤立檔案）', false)
      .action(async (subcommand, options) => {
        await this.handleDepsCommand(subcommand, options);
      });
  }

  private setupShitCommand(): void {
    this.program
      .command('shit')
      .description('分析程式碼垃圾度（分數越高越糟糕）')
      .option('-p, --path <path>', '分析路徑', '.')
      .option('-d, --detailed', '顯示詳細資訊（topShit + recommendations）', false)
      .option('-t, --top <num>', '顯示前 N 個最糟項目', String(DEFAULT_VALUES.TOP_SHIT_COUNT))
      .option('-m, --max-allowed <score>', '最大允許分數（超過則 exit 1）')
      .option('--format <format>', '輸出格式 (json|summary)', 'summary')
      .option('--show-files', '顯示問題檔案列表（detailedFiles）', false)
      .option('-o, --output <file>', '輸出到檔案')
      .action(async (options) => {
        await this.handleShitCommand(options);
      });
  }

  private setupPluginsCommand(): void {
    const pluginsCmd = this.program
      .command('plugins')
      .description('管理 Parser 插件');

    pluginsCmd
      .command('list')
      .option('--enabled', '只顯示啟用的插件')
      .option('--disabled', '只顯示停用的插件')
      .description('列出所有插件')
      .action(async (options) => {
        await this.handlePluginsListCommand(options);
      });

    pluginsCmd
      .command('info <plugin>')
      .description('顯示插件資訊')
      .action(async (pluginName) => {
        await this.handlePluginInfoCommand(pluginName);
      });
  }

  private setupSnapshotCommand(): void {
    this.program
      .command('snapshot [action]')
      .description('生成或管理程式碼快照')
      .option('-p, --path <path>', '專案路徑', process.cwd())
      .option('-o, --output <path>', '輸出檔案路徑')
      .option('-i, --incremental', '增量更新', false)
      .option('-l, --level <level>', '壓縮層級 (minimal|medium|full)', 'full')
      .option('--multi-level', '生成多層級快照', false)
      .option('--output-dir <dir>', '多層級輸出目錄', './snapshots')
      .option('--format <format>', '輸出格式 (json|summary)', 'summary')
      .option('--include-tests', '包含測試檔案', false)
      .action(async (action, options) => {
        await this.handleSnapshotCommand(action || 'generate', options);
      });
  }

  // Command handlers
  private async handleRenameCommand(options: any): Promise<void> {
    await RenameHandler.handleRenameCommand(options, this.renameEngine, this.indexEngine);
  }

  private async handleRefactorCommand(action: string, options: any): Promise<void> {
    await RefactorHandler.handleRefactorCommand(action, options);
  }

  private async handleMoveCommand(source: string, target: string, options: any): Promise<void> {
    // 初始化移動服務（如果尚未初始化）
    if (!this.moveService) {
      const pathAliases = await FileUtils.loadPathAliases(options.path || process.cwd());
      this.moveService = new MoveService({
        pathAliases,
        supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.vue', '.swift'],
        includeNodeModules: false
      });
    }
    await MoveHandler.handleMoveCommand(source, target, options, this.moveService);
  }

  private async handleShiftCommand(file: string, options: any): Promise<void> {
    // 初始化服務（如果尚未初始化）
    if (!this.shiftService) {
      this.shiftService = new ShiftService();
    }
    await ShiftHandler.handleShiftCommand(file, options, this.shiftService);
  }

  private async handleSearchCommand(query: string, options: any): Promise<void> {
    // 初始化搜尋服務
    if (!this.searchService) {
      this.searchService = new SearchService();
    }
    await SearchHandler.handleSearchCommand(query, options, this.searchService);
  }

  /**
   * 處理文字搜尋命令
   */
  private async handleTextSearchCommand(options: any): Promise<void> {
    // 初始化搜尋服務
    if (!this.searchService) {
      this.searchService = new SearchService();
    }
    await SearchHandler.handleTextSearchCommand(options, this.searchService);
  }

  /**
   * 處理結構化搜尋命令
   */
  private async handleStructuralSearchCommand(options: any): Promise<void> {
    await SearchHandler.handleStructuralSearchCommand(options);
  }

  /**
   * 處理符號搜尋命令
   */
  private async handleSymbolSearchCommand(options: any): Promise<void> {
    await SearchHandler.handleSymbolSearchCommand(options);
  }

  private async handleAnalyzeCommand(type: string | undefined, options: any): Promise<void> {
    await AnalyzeHandler.handleAnalyzeCommand(type, options);
  }

  private async handleShitCommand(options: any): Promise<void> {
    await ShitHandler.handleShitCommand(options);
  }

  private async handleSnapshotCommand(action: string, options: any): Promise<void> {
    const isJsonFormat = options.format === 'json';

    try {
      const projectPath = options.path || process.cwd();
      const configManager = new ConfigManager();

      // 讀取配置檔
      const projectConfig = await configManager.loadConfig(projectPath);

      // 合併選項
      const snapshotOptions: Partial<SnapshotOptions> = {
        projectPath,
        outputPath: options.output,
        incremental: options.incremental,
        level: options.level as CompressionLevel,
        includeTests: options.includeTests,
        multiLevel: options.multiLevel,
        outputDir: options.outputDir,
        silent: isJsonFormat
      };

      const finalOptions = configManager.mergeOptions(projectPath, snapshotOptions, projectConfig);

      // 如果沒有指定輸出路徑，使用預設值
      if (!finalOptions.outputPath) {
        finalOptions.outputPath = path.join(projectPath, '.agent-ide', 'snapshot.json');
      }

      const engine = new SnapshotEngine();

      switch (action) {
        case 'generate':
          await SnapshotHandler.handleSnapshotGenerate(engine, finalOptions, isJsonFormat);
          break;

        case 'info':
          await SnapshotHandler.handleSnapshotInfo(finalOptions, isJsonFormat);
          break;

        case 'diff':
          await SnapshotHandler.handleSnapshotDiff(options, isJsonFormat);
          break;

        case 'init':
          await SnapshotHandler.handleSnapshotInit(configManager, projectPath, isJsonFormat);
          break;

        default:
          // 預設執行生成
          await SnapshotHandler.handleSnapshotGenerate(engine, finalOptions, isJsonFormat);
          break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (isJsonFormat) {
        console.error(JSON.stringify({ error: errorMessage }));
      } else {
        console.error('\n❌ 快照操作失敗:', errorMessage);
      }

      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
  }

  private async handleDepsCommand(subcommand: string, options: any): Promise<void> {
    await DepsHandler.handleDepsCommand(subcommand, options, this.dependencyAnalyzer);
  }

  private async handlePluginsListCommand(options: any): Promise<void> {
    await PluginsHandler.handlePluginsListCommand(options);
  }

  private async handlePluginInfoCommand(pluginName: string): Promise<void> {
    await PluginsHandler.handlePluginInfoCommand(pluginName);
  }

}