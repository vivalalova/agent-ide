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
      .option('--update-references', '自動更新引用（在來源檔案中添加 import）', true)
      .option('--no-update-references', '不更新引用')
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
      .option('-l, --limit <num>', '結果數量限制', '50')
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
      .option('-t, --top <num>', '顯示前 N 個最糟項目', '10')
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
    // 支援多種參數名稱
    const from = options.symbol || options.from;
    const to = options.newName || options.to;
    const isJsonFormat = options.format === 'json';

    if (!from || !to) {
      if (isJsonFormat) {
        console.error(JSON.stringify({ error: '必須指定符號名稱和新名稱' }));
      } else {
        console.error('❌ 必須指定符號名稱和新名稱');
        console.error('   使用方式: agent-ide rename --symbol <name> --new-name <name>');
      }
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      return;
    }

    if (!isJsonFormat) {
      console.log(`🔄 重新命名 ${from} → ${to}`);
    }

    try {
      let workspacePath = options.path || process.cwd();

      // 如果路徑指向檔案，取其所在目錄
      const stats = await fs.stat(workspacePath);
      if (stats.isFile()) {
        workspacePath = path.dirname(workspacePath);
        // 往上查找專案根目錄（包含 package.json、.git 等）
        let currentDir = workspacePath;
        while (currentDir !== path.dirname(currentDir)) {
          const hasPackageJson = await FileUtils.fileExists(path.join(currentDir, 'package.json'));
          const hasGit = await FileUtils.fileExists(path.join(currentDir, '.git'));
          const hasSwiftPackage = await FileUtils.fileExists(path.join(currentDir, 'Package.swift'));
          if (hasPackageJson || hasGit || hasSwiftPackage) {
            workspacePath = currentDir;
            break;
          }
          currentDir = path.dirname(currentDir);
        }
      }

      // 初始化索引引擎（每次都重新索引以確保資料是最新的）
      const config = createIndexConfig(workspacePath, {
        includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.swift'],
        excludePatterns: ['node_modules/**', '*.test.*']
      });
      this.indexEngine = new IndexEngine(config);
      await this.indexEngine.indexProject(workspacePath);

      // 初始化重新命名引擎
      if (!this.renameEngine) {
        this.renameEngine = new RenameEngine();
      }

      // 1. 查找符號
      if (!isJsonFormat) {
        console.log(`🔍 查找符號 "${from}"...`);
      }
      const searchResults = await this.indexEngine.findSymbol(from);

      if (searchResults.length === 0) {
        if (isJsonFormat) {
          console.error(JSON.stringify({ error: `找不到符號 "${from}"` }));
        } else {
          console.log(`❌ 找不到符號 "${from}"`);
        }
        process.exit(1);
      }

      if (searchResults.length > 1 && !isJsonFormat) {
        console.log('⚠️  找到多個符號，使用第一個:');
        searchResults.forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.symbol.name} 在 ${result.symbol.location.filePath}:${result.symbol.location.range.start.line}`);
        });
      }

      const targetSymbol = searchResults[0].symbol;

      // 2. 預覽變更
      if (options.preview) {
        if (!isJsonFormat) {
          console.log('🔍 預覽變更...');
        }
        try {
          // 取得所有專案檔案以進行跨檔案引用查找
          // 使用 workspacePath（已解析為目錄）而不是 options.path（可能是檔案）
          const allProjectFiles = await FileUtils.getAllProjectFiles(workspacePath);

          const preview = await this.renameEngine.previewRename({
            symbol: targetSymbol,
            newName: to,
            filePaths: allProjectFiles
          });

          if (isJsonFormat) {
            console.log(JSON.stringify({
              preview: true,
              affectedFiles: preview.affectedFiles.length,
              operations: preview.operations.length,
              conflicts: preview.conflicts
            }, null, 2));
          } else {
            console.log('📝 預計變更:');
            console.log(`   檔案數: ${preview.affectedFiles.length}`);
            console.log(`   操作數: ${preview.operations.length}`);

            if (preview.conflicts.length > 0) {
              console.log('⚠️  發現衝突:');
              preview.conflicts.forEach(conflict => {
                console.log(`   - ${conflict.message}`);
              });
            }

            preview.operations.forEach(op => {
              console.log(`   ${op.filePath}: "${op.oldText}" → "${op.newText}"`);
            });

            console.log('✅ 預覽完成');
          }
          return;
        } catch (previewError) {
          if (isJsonFormat) {
            console.error(JSON.stringify({ error: previewError instanceof Error ? previewError.message : String(previewError) }));
          } else {
            console.error('❌ 預覽失敗:', previewError instanceof Error ? previewError.message : previewError);
          }
          if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        }
      }

      // 3. 執行重新命名（處理跨檔案引用）
      if (!isJsonFormat) {
        console.log('✏️  執行重新命名...');
      }

      // 取得所有專案檔案（使用與 preview 相同的邏輯）
      // 使用 workspacePath（已解析為目錄）而不是 options.path（可能是檔案）
      const allProjectFiles = await FileUtils.getAllProjectFiles(workspacePath);

      // 使用 renameEngine 執行重新命名（與 preview 使用相同的引擎）
      const renameResult = await this.renameEngine.rename({
        symbol: targetSymbol,
        newName: to,
        filePaths: allProjectFiles
      });

      if (renameResult.success) {
        if (isJsonFormat) {
          console.log(JSON.stringify({
            success: true,
            affectedFiles: renameResult.affectedFiles.length,
            operations: renameResult.operations.length,
            files: renameResult.affectedFiles
          }, null, 2));
        } else {
          console.log('✅ 重新命名成功!');
          console.log(`📊 統計: ${renameResult.affectedFiles.length} 檔案, ${renameResult.operations.length} 變更`);

          renameResult.operations.forEach(operation => {
            console.log(`   ✓ ${operation.filePath}: "${operation.oldText}" → "${operation.newText}"`);
          });
        }
      } else {
        if (isJsonFormat) {
          console.error(JSON.stringify({
            success: false,
            errors: renameResult.errors || ['重新命名失敗']
          }));
        } else {
          console.error('❌ 重新命名失敗:');
          renameResult.errors?.forEach(error => {
            console.error(`   - ${error}`);
          });
        }
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      }

    } catch (error) {
      if (isJsonFormat) {
        console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      } else {
        console.error('❌ 重新命名失敗:', error instanceof Error ? error.message : error);
      }
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
  }

  private async handleRefactorCommand(action: string, options: any): Promise<void> {
    // 支援 --path 作為 --file 的別名
    const fileOption = options.file || options.path;

    if (!fileOption) {
      console.error('❌ 必須指定 --file 或 --path 參數');
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      return;
    }

    // 支援 --new-name 作為 --function-name 的別名
    const functionNameOption = options.functionName || options.newName;

    const isJsonFormat = options.format === 'json';

    if (!isJsonFormat) {
      console.log(`🔧 重構: ${action}`);
    }

    try {
      const filePath = path.resolve(fileOption);

      if (action === 'extract-function' || action === 'extract-closure') {
        if (!options.startLine || !options.endLine || !functionNameOption) {
          console.error(`❌ ${action} 缺少必要參數: --start-line, --end-line 和 --function-name (或 --new-name)`);
          process.exitCode = 1;
          if (process.env.NODE_ENV !== 'test') { process.exit(1); }
          return;
        }

        // 驗證行號範圍
        const startLine = parseInt(options.startLine);
        const endLine = parseInt(options.endLine);
        if (startLine > endLine) {
          console.error(`❌ 無效的行號範圍: 起始行號 (${startLine}) 大於結束行號 (${endLine})`);
          process.exitCode = 1;
          if (process.env.NODE_ENV !== 'test') { process.exit(1); }
          return;
        }

        // 讀取檔案內容
        const fs = await import('fs/promises');

        // 檢查檔案是否存在
        try {
          await fs.access(filePath);
        } catch {
          console.error(`❌ 找不到檔案: ${filePath}`);
          process.exitCode = 1;
          if (process.env.NODE_ENV !== 'test') { process.exit(1); }
          return;
        }

        const code = await fs.readFile(filePath, 'utf-8');

        // 建立範圍
        const range = {
          start: { line: startLine, column: 0 },
          end: { line: endLine, column: 0 }
        };

        // 檢測檔案類型
        const isSwift = filePath.endsWith('.swift');

        if (isSwift) {
          // 使用 Swift 提取器
          const { SwiftExtractor } = await import('../../core/refactor/swift-extractor.js');
          const extractor = new SwiftExtractor();

          const extractConfig = {
            functionName: functionNameOption,
            generateComments: true,
            preserveFormatting: true
          };

          const result = action === 'extract-closure'
            ? await extractor.extractClosure(code, range, extractConfig)
            : await extractor.extractFunction(code, range, extractConfig);

          if (result.success) {
            if (isJsonFormat) {
              console.log(JSON.stringify({
                success: true,
                extractedFunction: result.extractedFunction
              }, null, 2));
            } else {
              console.log('✅ 重構完成');
              console.log(`📝 提取的函式: ${result.extractedFunction.signature}`);
            }

            if (!options.preview) {
              await fs.writeFile(filePath, result.modifiedCode, 'utf-8');
              if (!isJsonFormat) {
                console.log(`✓ 已更新 ${filePath}`);
              }
            } else {
              if (!isJsonFormat) {
                console.log('預覽模式 - 未寫入檔案');
              }
            }
          } else {
            if (isJsonFormat) {
              console.error(JSON.stringify({ success: false, errors: result.errors }));
            } else {
              console.error('❌ 重構失敗:', result.errors.join(', '));
            }
            if (process.env.NODE_ENV !== 'test') { process.exit(1); }
          }
          return;
        }

        // TypeScript/JavaScript 提取器（原有邏輯）
        const { FunctionExtractor } = await import('../../core/refactor/extract-function.js');
        const extractor = new FunctionExtractor();

        // 執行提取
        const extractConfig = {
          functionName: functionNameOption,
          generateComments: true,
          preserveFormatting: true,
          validateExtraction: true,
          ...(options.targetFile ? {
            targetFile: path.resolve(options.targetFile),
            sourceFile: filePath
          } : {})
        };

        const result = await extractor.extract(code, range, extractConfig);

        if (result.success) {
          // 套用編輯（按正確順序）
          let modifiedCode = code;

          // 先處理所有 insert 類型（在檔案開頭插入函式定義）
          const insertEdits = result.edits.filter(e => e.type === 'insert');
          const replaceEdits = result.edits.filter(e => e.type === 'replace');

          // 先應用 replace（替換選取範圍為函式呼叫）
          for (const edit of replaceEdits) {
            modifiedCode = CodeEditUtils.applyEditCorrectly(modifiedCode, edit);
          }

          // 再應用 insert（插入函式定義）
          for (const edit of insertEdits) {
            modifiedCode = CodeEditUtils.applyEditCorrectly(modifiedCode, edit);
          }

          // 提取函式簽名（從修改後的程式碼中）
          const functionSignatureMatch = modifiedCode.match(new RegExp(`(async\\s+)?function\\s+${result.functionName}\\s*\\([^)]*\\)`));
          const functionSignature = functionSignatureMatch ? functionSignatureMatch[0] : `function ${result.functionName}`;

          console.log('✅ 重構完成');
          console.log(`📝 提取的函式: ${functionSignature}`);
          console.log(functionSignature);

          if (!options.preview) {
            // 寫入原始檔案
            await fs.writeFile(filePath, modifiedCode, 'utf-8');
            console.log(`✓ 已更新 ${filePath}`);

            // 如果是跨檔案提取，寫入目標檔案
            if (result.targetFileContent && options.targetFile) {
              const targetPath = path.resolve(options.targetFile);
              // 確保目標目錄存在
              const targetDir = path.dirname(targetPath);
              await fs.mkdir(targetDir, { recursive: true });
              // 寫入目標檔案
              await fs.writeFile(targetPath, result.targetFileContent, 'utf-8');
              console.log(`✓ 已建立/更新目標檔案 ${targetPath}`);
              if (result.importStatement) {
                console.log(`✓ 已加入 import: ${result.importStatement}`);
              }
            }
          } else {
            console.log('\n🔍 預覽模式 - 未寫入檔案');
            console.log(`📊 參數: ${result.parameters.map(p => p.name).join(', ')}`);
            if (result.targetFileContent && options.targetFile) {
              console.log(`📁 目標檔案: ${options.targetFile}`);
              console.log(`📥 Import: ${result.importStatement || '(無)'}`);
            }
          }
        } else {
          console.error('❌ 重構失敗:', result.errors.join(', '));
          process.exitCode = 1;
          if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        }

      } else if (action === 'inline-function') {
        console.error('❌ inline-function 尚未實作');
        process.exitCode = 1;
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      } else {
        console.error(`❌ 未知的重構操作: ${action}`);
        process.exitCode = 1;
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      }

    } catch (error) {
      console.error('❌ 重構失敗:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
  }

  private async handleMoveCommand(source: string, target: string, options: any): Promise<void> {
    const isJsonFormat = options.format === 'json';

    if (!isJsonFormat) {
      console.log(`📦 移動 ${source} → ${target}`);
    }

    try {
      // 檢查源檔案是否存在
      const sourceExists = await FileUtils.fileExists(source);
      if (!sourceExists) {
        const errorMsg = `源檔案找不到: ${source}`;
        if (isJsonFormat) {
          console.log(JSON.stringify({
            success: false,
            error: errorMsg
          }, null, 2));
        } else {
          console.log(`❌ 移動失敗: ${errorMsg}`);
        }
        process.exitCode = 1;
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        return;
      }

      // 檢查源和目標是否相同
      const normalizedSource = path.resolve(source);
      const normalizedTarget = path.resolve(target);
      if (normalizedSource === normalizedTarget) {
        // 源和目標相同時，視為 no-op，成功返回
        const message = 'Source and target are identical. No changes made.';
        if (isJsonFormat) {
          console.log(JSON.stringify({
            success: true,
            message,
            changes: []
          }, null, 2));
        } else {
          console.log(`✓ ${message}`);
        }
        return;
      }

      // 初始化移動服務
      if (!this.moveService) {
        // 讀取 tsconfig.json 路徑別名
        const pathAliases = await FileUtils.loadPathAliases(options.path || process.cwd());

        this.moveService = new MoveService({
          pathAliases,
          supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.vue', '.swift'],
          includeNodeModules: false
        });
      }

      const moveOperation = {
        source: normalizedSource,
        target: normalizedTarget,
        updateImports: options.updateImports
      };

      const moveOptions = {
        preview: options.preview,
        projectRoot: options.path || process.cwd()
      };

      // 執行移動操作
      const result = await this.moveService.moveFile(moveOperation, moveOptions);

      if (result.success) {
        if (isJsonFormat) {
          console.log(JSON.stringify({
            moved: result.moved,
            affectedFiles: result.pathUpdates.length,
            pathUpdates: result.pathUpdates
          }, null, 2));
        } else {
          if (options.preview) {
            console.log('🔍 預覽移動操作:');
          } else {
            console.log('✅ 移動成功!');
          }

          console.log(`📊 統計: ${result.pathUpdates.length} 個 import 需要更新`);

          if (result.pathUpdates.length > 0) {
            console.log('📝 影響的檔案:');
            const fileGroups = new Map<string, any[]>();

            result.pathUpdates.forEach(update => {
              if (!fileGroups.has(update.filePath)) {
                fileGroups.set(update.filePath, []);
              }
              fileGroups.get(update.filePath)!.push(update);
            });

            for (const [filePath, updates] of fileGroups) {
              console.log(`   📄 ${path.relative(process.cwd(), filePath)}:`);
              updates.forEach(update => {
                console.log(`      第 ${update.line} 行: "${path.basename(source)}" → "${path.basename(target)}"`);
              });
            }
          }
        }
      } else {
        if (isJsonFormat) {
          console.log(JSON.stringify({
            success: false,
            error: result.error
          }, null, 2));
        } else {
          console.error('❌ 移動失敗:', result.error);
        }
        process.exitCode = 1;
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (isJsonFormat) {
        console.log(JSON.stringify({
          success: false,
          error: errorMsg
        }, null, 2));
      } else {
        console.error('❌ 移動失敗:', errorMsg);
      }
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
  }

  private async handleShiftCommand(file: string, options: any): Promise<void> {
    const isJsonFormat = options.format === 'json';

    try {
      // 解析參數
      const fromLine = parseInt(options.from, 10);
      const toLine = parseInt(options.to, 10);
      const position = parseInt(options.position, 10);

      // 驗證參數
      if (isNaN(fromLine) || isNaN(toLine) || isNaN(position)) {
        const errorMsg = '行號和位置必須為有效數字';
        if (isJsonFormat) {
          console.log(JSON.stringify({ success: false, error: errorMsg }, null, 2));
        } else {
          console.error(`❌ ${errorMsg}`);
        }
        process.exitCode = 1;
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        return;
      }

      // 解析檔案路徑（支援相對路徑）
      const sourceFile = path.resolve(options.path || process.cwd(), file);
      const targetFile = options.target ? path.resolve(options.path || process.cwd(), options.target) : undefined;

      if (!isJsonFormat) {
        const targetDesc = targetFile ? ` → ${path.basename(targetFile)}` : '（同檔案內）';
        console.log(`✂️  移動行 ${fromLine}-${toLine} 到位置 ${position}${targetDesc}`);
      }

      // 初始化服務
      if (!this.shiftService) {
        this.shiftService = new ShiftService();
      }

      // 執行行移動操作
      const shiftOptions = {
        sourceFile,
        fromLine,
        toLine,
        targetFile,
        position,
        preview: options.preview,
        projectRoot: options.path || process.cwd(),
        updateReferences: options.updateReferences
      };

      const result = await this.shiftService.shift(shiftOptions);

      if (result.success) {
        if (isJsonFormat) {
          console.log(JSON.stringify({
            success: true,
            operationType: result.operationType,
            sourceFile: result.sourceFile,
            targetFile: result.targetFile,
            fromLine: result.fromLine,
            toLine: result.toLine,
            position: result.position,
            linesCount: result.linesCount,
            executed: result.executed,
            message: result.message,
            referencesUpdated: result.referencesUpdated,
            updatedReferences: result.updatedReferences
          }, null, 2));
        } else {
          if (options.preview) {
            console.log('🔍 預覽行移動操作:');
          } else {
            console.log('✅ 行移動成功!');
          }

          console.log(`📊 統計: 移動了 ${result.linesCount} 行`);
          console.log(`📝 來源檔案: ${path.relative(process.cwd(), result.sourceFile)}`);
          console.log(`📝 目標檔案: ${path.relative(process.cwd(), result.targetFile)}`);

          if (result.referencesUpdated && result.updatedReferences && result.updatedReferences.length > 0) {
            console.log(`🔗 已更新引用: ${result.updatedReferences.join(', ')}`);
          }

          if (options.preview && result.movedLines) {
            console.log('\n移動的內容:');
            result.movedLines.forEach((line, index) => {
              console.log(`  ${result.fromLine + index}: ${line}`);
            });
          }
        }
      } else {
        if (isJsonFormat) {
          console.log(JSON.stringify({ success: false, error: result.error }, null, 2));
        } else {
          console.error('❌ 行移動失敗:', result.error);
        }
        process.exitCode = 1;
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (isJsonFormat) {
        console.log(JSON.stringify({ success: false, error: errorMsg }, null, 2));
      } else {
        console.error('❌ 執行失敗:', errorMsg);
      }
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
  }

  private async handleSearchCommand(query: string, options: any): Promise<void> {
    const isMinimalOrJson = options.format === 'minimal' || options.format === 'json';

    if (!isMinimalOrJson) {
      console.log(`🔍 搜尋: "${query}"`);
    }

    try {
      // 初始化搜尋服務
      if (!this.searchService) {
        this.searchService = new SearchService();
      }

      // 建構搜尋選項
      const searchOptions = SearchUtils.buildSearchOptions(options);

      // 根據搜尋類型建立查詢
      const searchQuery = {
        type: 'text' as const,
        query,
        options: searchOptions
      };

      // 執行搜尋
      const startTime = Date.now();
      const result = await this.searchService.searchText(searchQuery);
      const searchTime = Date.now() - startTime;

      // 顯示結果
      if (result.matches.length === 0) {
        if (!isMinimalOrJson) {
          console.log('📝 沒有找到匹配結果');
        } else if (options.format === 'json') {
          // JSON 格式輸出空結果
          console.log(JSON.stringify({ results: [] }, null, 2));
        }
        return;
      }

      if (!isMinimalOrJson) {
        console.log(`✅ 找到 ${result.matches.length} 個結果 (${searchTime}ms)`);

        if (result.truncated) {
          console.log(`⚠️  結果已截斷，顯示前 ${options.limit} 個結果`);
        }
      }

      // 格式化輸出
      FormatUtils.formatSearchResults(result, options);

    } catch (error) {
      if (isMinimalOrJson) {
        // 對於 minimal 和 json 格式，輸出空結果或錯誤
        if (options.format === 'json') {
          console.log(JSON.stringify({ matches: [], error: error instanceof Error ? error.message : String(error) }));
        } else {
          console.error(`Error: ${error instanceof Error ? error.message : error}`);
        }
      } else {
        console.error('❌ 搜尋失敗:', error instanceof Error ? error.message : error);
      }
      // 測試環境不 exit
      if (process.env.NODE_ENV !== 'test') {
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      }
    }
  }

  /**
   * 處理文字搜尋命令
   */
  private async handleTextSearchCommand(options: any): Promise<void> {
    const query = options.query;

    if (!query) {
      console.error('❌ 文字搜尋需要指定 --query 參數');
      console.error('   使用方式: agent-ide search text --query <text>');
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      return;
    }

    // 使用既有的 handleSearchCommand 邏輯
    await this.handleSearchCommand(query, options);
  }

  /**
   * 處理結構化搜尋命令
   */
  private async handleStructuralSearchCommand(options: any): Promise<void> {
    const pattern = options.pattern;
    const type = options.type;

    if (!type) {
      console.error('❌ 結構化搜尋需要指定 --type 參數');
      console.error('   使用方式: agent-ide search structural --type <class|protocol|function|...> [--pattern <pattern>]');
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      return;
    }

    const isMinimalOrJson = options.format === 'minimal' || options.format === 'json';

    if (!isMinimalOrJson) {
      console.log(`🔍 結構化搜尋: ${type}${pattern ? ` (pattern: ${pattern})` : ''}`);
    }

    try {
      const searchPath = path.resolve(options.path || process.cwd());

      // 初始化索引引擎
      const config = createIndexConfig(searchPath, {
        includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.swift'],
        excludePatterns: ['node_modules/**', '*.test.*', 'dist/**']
      });
      this.indexEngine = new IndexEngine(config);

      // 建立索引
      if (!isMinimalOrJson) {
        console.log('📝 正在建立索引...');
      }
      await this.indexEngine.indexProject(searchPath);

      // 獲取所有符號
      const allSymbols = await this.indexEngine.getAllSymbols();

      // 過濾符號
      let filteredSymbols = allSymbols.filter(symbolResult => {
        const symbol = symbolResult.symbol;

        // 1. 過濾檔案模式
        if (options.filePattern) {
          const regex = new RegExp(options.filePattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
          if (!regex.test(symbol.location.filePath)) {
            return false;
          }
        }

        // 2. 過濾符號類型
        if (type) {
          if (symbol.type !== type) {
            return false;
          }
        }

        // 3. 過濾符號名稱模式
        if (pattern) {
          const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
          if (!regex.test(symbol.name)) {
            return false;
          }
        }

        // 4. 過濾屬性
        if (options.withAttribute) {
          if (!(symbol as any).attributes || !(symbol as any).attributes.includes(options.withAttribute)) {
            return false;
          }
        }

        // 5. 過濾修飾符
        if (options.withModifier) {
          if (!(symbol as any).modifiers || !(symbol as any).modifiers.includes(options.withModifier)) {
            return false;
          }
        }

        // 6. 過濾實作的協定
        if (options.implements) {
          if (!(symbol as any).implements || !(symbol as any).implements.includes(options.implements)) {
            return false;
          }
        }

        // 7. 過濾繼承的類別
        if (options.extends) {
          if ((symbol as any).superclass !== options.extends) {
            return false;
          }
        }

        return true;
      });

      // 應用 limit
      const limit = options.limit ? parseInt(options.limit) : 50;
      if (filteredSymbols.length > limit) {
        filteredSymbols = filteredSymbols.slice(0, limit);
      }

      if (filteredSymbols.length === 0) {
        if (options.format === 'json') {
          console.log(JSON.stringify({ results: [] }, null, 2));
        } else if (!isMinimalOrJson) {
          console.log('📝 沒有找到符合條件的符號');
        }
        return;
      }

      if (!isMinimalOrJson && options.format !== 'summary') {
        console.log(`✅ 找到 ${filteredSymbols.length} 個符號`);
      }

      // 格式化輸出
      FormatUtils.formatSymbolSearchResults(filteredSymbols, options);

    } catch (error) {
      if (isMinimalOrJson) {
        if (options.format === 'json') {
          console.log(JSON.stringify({
            results: [],
            error: error instanceof Error ? error.message : String(error)
          }));
        } else {
          console.error(`Error: ${error instanceof Error ? error.message : error}`);
        }
      } else {
        console.error('❌ 結構化搜尋失敗:', error instanceof Error ? error.message : error);
      }
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
  }

  /**
   * 處理符號搜尋命令
   */
  private async handleSymbolSearchCommand(options: any): Promise<void> {
    const symbolName = options.query;

    if (!symbolName) {
      console.error('❌ 符號搜尋需要指定 --query 參數');
      console.error('   使用方式: agent-ide search symbol --query <name>');
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      return;
    }

    const isMinimalOrJson = options.format === 'minimal' || options.format === 'json';

    if (!isMinimalOrJson) {
      console.log(`🔍 搜尋符號: "${symbolName}"`);
    }

    try {
      const searchPath = path.resolve(options.path || process.cwd());

      // 初始化索引引擎（每次都重新建立以確保索引是最新的）
      const config = createIndexConfig(searchPath, {
        includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.swift'],
        excludePatterns: ['node_modules/**', '*.test.*', 'dist/**']
      });
      this.indexEngine = new IndexEngine(config);

      // 建立索引
      if (!isMinimalOrJson) {
        console.log('📝 正在建立索引...');
      }
      await this.indexEngine.indexProject(searchPath);

      // 搜尋符號：如果包含 wildcard，使用模式搜尋
      let results: any[];
      if (symbolName.includes('*') || symbolName.includes('?')) {
        // Wildcard 模式搜尋
        const allSymbols = await this.indexEngine.getAllSymbols();
        const pattern = symbolName
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        const regex = new RegExp(`^${pattern}$`);

        results = allSymbols.filter(result => regex.test(result.symbol.name));

        // 應用 limit
        const limit = options.limit ? parseInt(options.limit) : 50;
        if (results.length > limit) {
          results = results.slice(0, limit);
        }
      } else {
        // 精確名稱搜尋
        results = await this.indexEngine.findSymbol(symbolName);
      }

      if (results.length === 0) {
        if (options.format === 'json') {
          console.log(JSON.stringify({ results: [] }, null, 2));
        } else if (!isMinimalOrJson) {
          console.log(`📝 找不到符號 "${symbolName}"`);
        }
        return;
      }

      if (!isMinimalOrJson) {
        console.log(`✅ 找到 ${results.length} 個符號`);
      }

      // 格式化輸出
      FormatUtils.formatSymbolSearchResults(results, options);

    } catch (error) {
      if (isMinimalOrJson) {
        if (options.format === 'json') {
          console.log(JSON.stringify({
            results: [],
            error: error instanceof Error ? error.message : String(error)
          }));
        } else {
          console.error(`Error: ${error instanceof Error ? error.message : error}`);
        }
      } else {
        console.error('❌ 符號搜尋失敗:', error instanceof Error ? error.message : error);
      }
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
  }

  private async handleAnalyzeCommand(type: string | undefined, options: any): Promise<void> {
    const analyzeType = type || 'complexity';

    if (options.format !== 'json') {
      console.log('📊 分析程式碼品質...');
    }

    try {
      const analyzePath = options.path || process.cwd();

      // 根據分析類型執行對應分析
      if (analyzeType === 'complexity') {
        // 使用 ParserPlugin 分析複雜度
        const registry = ParserRegistry.getInstance();
        const files = await FileUtils.getAllProjectFiles(analyzePath);
        const results: Array<{ file: string; complexity: any }> = [];

        for (const file of files) {
          try {
            const parser = registry.getParser(path.extname(file));
            if (!parser) {continue;}

            const content = await fs.readFile(file, 'utf-8');
            const ast = await parser.parse(content, file);
            const complexity = await parser.analyzeComplexity(content, ast);

            results.push({ file, complexity });
          } catch {
            // 忽略無法分析的檔案
          }
        }

        // 過濾高複雜度檔案（evaluation === 'high' 或 complexity > 10）
        const highComplexityFiles = results.filter(r =>
          r.complexity.evaluation === 'high' || r.complexity.cyclomaticComplexity > 10
        );

        // 計算統計資訊
        const complexities = results.map(r => r.complexity.cyclomaticComplexity);
        const averageComplexity = complexities.length > 0
          ? complexities.reduce((sum, c) => sum + c, 0) / complexities.length
          : 0;
        const maxComplexity = complexities.length > 0
          ? Math.max(...complexities)
          : 0;

        if (options.format === 'json') {
          const outputData: any = {
            summary: {
              totalScanned: results.length,
              issuesFound: highComplexityFiles.length,
              averageComplexity,
              maxComplexity
            },
            issues: highComplexityFiles.map(r => ({
              path: r.file,
              complexity: r.complexity.cyclomaticComplexity,
              cognitiveComplexity: r.complexity.cognitiveComplexity,
              evaluation: r.complexity.evaluation
            }))
          };

          if (options.all) {
            outputData.all = results.map(r => ({
              path: r.file,
              complexity: r.complexity.cyclomaticComplexity,
              cognitiveComplexity: r.complexity.cognitiveComplexity,
              evaluation: r.complexity.evaluation
            }));
          }

          console.log(JSON.stringify(outputData, null, 2));
        } else {
          console.log('✅ 複雜度分析完成!');
          console.log(`📊 統計: ${results.length} 個檔案，${highComplexityFiles.length} 個高複雜度檔案`);
          console.log(`   平均複雜度: ${averageComplexity.toFixed(2)}`);
          console.log(`   最高複雜度: ${maxComplexity}`);
          if (!options.all && highComplexityFiles.length > 0) {
            console.log('\n⚠️  高複雜度檔案:');
            highComplexityFiles.forEach(r => {
              console.log(`   - ${r.file}: ${r.complexity.cyclomaticComplexity}`);
            });
          }
        }
      } else if (analyzeType === 'dead-code') {
        // 使用 ParserPlugin 檢測死代碼
        const registry = ParserRegistry.getInstance();

        const files = await FileUtils.getAllProjectFiles(analyzePath);
        const results: Array<{ file: string; deadCode: any[] }> = [];

        for (const file of files) {
          try {
            const parser = registry.getParser(path.extname(file));
            if (!parser) {continue;}

            const content = await fs.readFile(file, 'utf-8');
            const ast = await parser.parse(content, file);
            const symbols = await parser.extractSymbols(ast);
            const deadCode = await parser.detectUnusedSymbols(ast, symbols);

            results.push({ file, deadCode });
          } catch {
            // 忽略無法分析的檔案
          }
        }

        // 過濾有 dead code 的檔案
        const filesWithDeadCode = results.filter(r => r.deadCode.length > 0);

        // 統計結果
        const allDeadCode = results.flatMap(r => r.deadCode);
        const deadFunctions = allDeadCode.filter(d => d.type === 'function');
        const deadVariables = allDeadCode.filter(d => d.type === 'variable');

        if (options.format === 'json') {
          const outputData: any = {
            summary: {
              totalScanned: results.length,
              filesWithIssues: filesWithDeadCode.length,
              totalDeadFunctions: deadFunctions.length,
              totalDeadVariables: deadVariables.length,
              totalDeadCode: allDeadCode.length
            },
            issues: filesWithDeadCode.map(r => ({
              path: r.file,
              deadCode: r.deadCode
            }))
          };

          if (options.all) {
            outputData.all = results.map(r => ({
              path: r.file,
              deadCode: r.deadCode
            }));
          }

          outputData.deadFunctions = deadFunctions;
          outputData.deadVariables = deadVariables;

          console.log(JSON.stringify(outputData, null, 2));
        } else {
          console.log('✅ 死代碼檢測完成!');
          console.log(`📊 統計: ${results.length} 個檔案，${filesWithDeadCode.length} 個有死代碼`);
          console.log('📊 發現:');
          console.log(`   未使用函式: ${deadFunctions.length} 個`);
          console.log(`   未使用變數: ${deadVariables.length} 個`);
          if (!options.all && filesWithDeadCode.length > 0) {
            console.log('\n⚠️  有死代碼的檔案:');
            filesWithDeadCode.forEach(r => {
              console.log(`   - ${r.file}: ${r.deadCode.length} 項`);
            });
          }
        }
      } else if (analyzeType === 'best-practices') {
        // 檢查最佳實踐
        const files = await FileUtils.getAllProjectFiles(analyzePath);
        const issues: any[] = [];
        const recommendations: any[] = [];

        // 檢查 ES Module 使用情況
        const hasEsmImports = files.some(async (file) => {
          const content = await fs.readFile(file, 'utf-8');
          return content.includes('import ') && content.includes('from ');
        });

        if (hasEsmImports) {
          recommendations.push({
            type: 'es-modules',
            status: 'good',
            message: '專案使用 ES Module'
          });
        }

        if (options.format === 'json') {
          console.log(JSON.stringify({
            issues,
            recommendations
          }, null, 2));
        } else {
          console.log('✅ 最佳實踐檢查完成!');
          console.log(`📊 建議數: ${recommendations.length}`);
        }
      } else if (analyzeType === 'patterns') {
        // 檢測程式碼模式
        const files = await FileUtils.getAllProjectFiles(analyzePath);
        const patterns: string[] = [];
        let asyncFunctionCount = 0;

        for (const file of files) {
          const content = await fs.readFile(file, 'utf-8');

          // 檢測 async 函式
          if (content.includes('async ')) {
            asyncFunctionCount++;
            if (!patterns.includes('async-functions')) {
              patterns.push('async-functions');
            }
          }

          // 檢測 Promise 使用
          if (content.includes('Promise') || content.includes('.then(')) {
            if (!patterns.includes('promise-usage')) {
              patterns.push('promise-usage');
            }
          }

          // TypeScript 特定模式
          if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            // 檢測 interface 使用
            if (content.includes('interface ') && !patterns.includes('interface-usage')) {
              patterns.push('interface-usage');
            }

            // 檢測泛型類型
            if (content.match(/<[A-Z]\w*(\s*extends\s+\w+)?>/g) && !patterns.includes('generic-types')) {
              patterns.push('generic-types');
            }

            // 檢測 enum 使用
            if (content.includes('enum ') && !patterns.includes('enum-usage')) {
              patterns.push('enum-usage');
            }
          }
        }

        if (options.format === 'json') {
          console.log(JSON.stringify({
            patterns,
            statistics: {
              asyncFunctions: asyncFunctionCount
            }
          }, null, 2));
        } else {
          console.log('✅ 模式檢測完成!');
          console.log(`📊 發現模式: ${patterns.join(', ')}`);
        }
      } else if (analyzeType === 'quality') {
        // 品質分析（整合多個維度）
        const registry = ParserRegistry.getInstance();
        const files = await FileUtils.getAllProjectFiles(analyzePath);

        // 檢查路徑是否存在或沒有找到檔案
        if (files.length === 0) {
          const pathExists = await FileUtils.fileExists(analyzePath);
          if (!pathExists) {
            throw new Error(`路徑不存在: ${analyzePath}`);
          }
          throw new Error(`在路徑 ${analyzePath} 中找不到支援的檔案`);
        }

        // 統計資料
        const summary = {
          totalScanned: files.length,
          totalIssues: 0,
          qualityScore: 0
        };

        // 各維度問題列表
        const allIssues: any[] = [];
        const recommendations: string[] = [];

        // 各維度分數（權重參考 ShitScore QA 維度）
        let typeSafetyScore = 100;
        let errorHandlingScore = 100;
        let securityScore = 100;
        let namingScore = 100;
        let testCoverageScore = 0;

        let testFileCount = 0;

        for (const file of files) {
          try {
            const parser = registry.getParser(path.extname(file));
            if (!parser) {continue;}

            const content = await fs.readFile(file, 'utf-8');
            const ast = await parser.parse(content, file);

            // 判斷是否為測試檔案
            if (parser.isTestFile && parser.isTestFile(file)) {
              testFileCount++;
              continue; // 跳過測試檔案
            }

            // 1. 型別安全檢測
            if (parser.checkTypeSafety) {
              const typeSafetyIssues = await parser.checkTypeSafety(content, ast);
              typeSafetyIssues.forEach((issue) => {
                allIssues.push({
                  type: 'type-safety',
                  severity: issue.severity === 'error' ? 'high' : 'medium',
                  message: issue.message,
                  filePath: issue.location.filePath,
                  line: issue.location.line
                });
                typeSafetyScore -= issue.severity === 'error' ? 10 : 5;
              });
            }

            // 2. 錯誤處理檢測
            if (parser.checkErrorHandling) {
              const errorHandlingIssues = await parser.checkErrorHandling(content, ast);
              errorHandlingIssues.forEach((issue) => {
                allIssues.push({
                  type: 'error-handling',
                  severity: issue.severity === 'error' ? 'high' : 'medium',
                  message: issue.message,
                  filePath: issue.location.filePath,
                  line: issue.location.line
                });
                errorHandlingScore -= issue.severity === 'error' ? 10 : 5;
              });
            }

            // 3. 安全性檢測
            if (parser.checkSecurity) {
              const securityIssues = await parser.checkSecurity(content, ast);
              securityIssues.forEach((issue) => {
                allIssues.push({
                  type: 'security',
                  severity: issue.severity === 'critical' ? 'high' : 'medium',
                  message: issue.message,
                  filePath: issue.location.filePath,
                  line: issue.location.line
                });
                securityScore -= issue.severity === 'critical' ? 15 : 10;
              });
            }

            // 4. 命名規範檢測
            if (parser.checkNamingConventions) {
              const symbols = await parser.extractSymbols(ast);
              const namingIssues = await parser.checkNamingConventions(symbols, file);
              namingIssues.forEach((issue) => {
                allIssues.push({
                  type: 'naming',
                  severity: 'low',
                  message: issue.message,
                  filePath: issue.location.filePath,
                  line: issue.location.line
                });
                namingScore -= 3;
              });
            }
          } catch {
            // 忽略無法分析的檔案
          }
        }

        // 5. 測試覆蓋率評估
        const testFileRatio = files.length > 0 ? testFileCount / files.length : 0;
        testCoverageScore = Math.min(100, testFileRatio * 200); // 50% 測試覆蓋率 = 100 分

        // 確保分數不低於 0
        typeSafetyScore = Math.max(0, typeSafetyScore);
        errorHandlingScore = Math.max(0, errorHandlingScore);
        securityScore = Math.max(0, securityScore);
        namingScore = Math.max(0, namingScore);

        // 計算整體品質評分（加權平均，參考 ShitScore QA 維度權重）
        const overallScore = Math.round(
          typeSafetyScore * 0.30 +      // Type Safety 30%
          testCoverageScore * 0.25 +    // Test Coverage 25%
          errorHandlingScore * 0.20 +   // Error Handling 20%
          namingScore * 0.15 +          // Naming 15%
          securityScore * 0.10          // Security 10%
        );

        summary.totalIssues = allIssues.length;
        summary.qualityScore = overallScore;

        // 產生改善建議
        if (typeSafetyScore < 80) {
          recommendations.push('型別安全：建議使用可選綁定（if let, guard let）代替強制解包');
        }
        if (errorHandlingScore < 80) {
          recommendations.push('錯誤處理：建議使用 do-catch 明確處理錯誤，避免空 catch 區塊');
        }
        if (securityScore < 80) {
          recommendations.push('安全性：建議使用 Keychain 或環境變數儲存敏感資訊');
        }
        if (namingScore < 80) {
          recommendations.push('命名規範：建議遵循 Swift API Design Guidelines 命名規範');
        }
        if (testCoverageScore < 50) {
          recommendations.push('測試覆蓋率：建議提升測試覆蓋率至 50% 以上');
        }

        if (options.format === 'json') {
          console.log(JSON.stringify({
            summary,
            issues: allIssues,
            complexity: {
              score: 100 // 預留位置（可選擇整合複雜度分析）
            },
            maintainability: {
              score: 100 // 預留位置（可選擇整合維護性分析）
            },
            typeSafety: {
              score: typeSafetyScore,
              issues: allIssues.filter((i) => i.type === 'type-safety')
            },
            errorHandling: {
              score: errorHandlingScore,
              issues: allIssues.filter((i) => i.type === 'error-handling')
            },
            security: {
              score: securityScore,
              issues: allIssues.filter((i) => i.type === 'security')
            },
            namingConventions: {
              score: namingScore,
              issues: allIssues.filter((i) => i.type === 'naming')
            },
            testCoverage: {
              score: testCoverageScore,
              testFileRatio,
              testFiles: testFileCount,
              totalFiles: files.length
            },
            overallScore,
            recommendations
          }, null, 2));
        } else {
          console.log('✅ 品質分析完成!');
          console.log(`📊 整體評分: ${overallScore}/100`);
          console.log(`   總問題數: ${summary.totalIssues}`);
          console.log('\n維度評分:');
          console.log(`   型別安全:     ${typeSafetyScore.toFixed(1)}/100`);
          console.log(`   錯誤處理:     ${errorHandlingScore.toFixed(1)}/100`);
          console.log(`   安全性:       ${securityScore.toFixed(1)}/100`);
          console.log(`   命名規範:     ${namingScore.toFixed(1)}/100`);
          console.log(`   測試覆蓋率:   ${testCoverageScore.toFixed(1)}/100 (${(testFileRatio * 100).toFixed(1)}%)`);

          if (recommendations.length > 0) {
            console.log('\n改善建議:');
            recommendations.forEach((rec, index) => {
              console.log(`   ${index + 1}. ${rec}`);
            });
          }
        }
      } else {
        throw new Error(`不支援的分析類型: ${analyzeType}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (options.format === 'json') {
        console.error(JSON.stringify({ error: errorMessage }));
      } else {
        console.error('❌ 分析失敗:', errorMessage);
      }
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
  }

  private async handleShitCommand(options: any): Promise<void> {
    if (options.format !== 'json') {
      console.log('💩 分析程式碼垃圾度...');
    }

    try {
      const analyzePath = options.path || process.cwd();
      const topCount = parseInt(options.top) || 10;
      const maxAllowed = options.maxAllowed ? parseFloat(options.maxAllowed) : undefined;

      const registry = ParserRegistry.getInstance();
      const analyzer = new ShitScoreAnalyzer(registry);
      const result = await analyzer.analyze(analyzePath, {
        detailed: options.detailed,
        topCount,
        maxAllowed,
        showFiles: options.showFiles
      });

      if (options.format === 'json') {
        const output = JSON.stringify(result, null, 2);
        if (options.output) {
          await fs.writeFile(options.output, output, 'utf-8');
          console.log(`✅ 結果已儲存至 ${options.output}`);
        } else {
          console.log(output);
        }
      } else {
        console.log('\n' + '='.repeat(50));
        console.log(`垃圾度評分報告 ${result.gradeInfo.emoji}`);
        console.log('='.repeat(50));
        console.log(`\n總分: ${result.shitScore} / 100  [${result.gradeInfo.emoji} ${result.grade}級]`);
        console.log(`評語: ${result.gradeInfo.message}\n`);

        console.log('維度分析:');
        console.log(`  複雜度垃圾:   ${result.dimensions.complexity.score.toFixed(1)} (${(result.dimensions.complexity.weight * 100).toFixed(0)}%) → 貢獻 ${result.dimensions.complexity.weightedScore.toFixed(1)} 分`);
        console.log(`  維護性垃圾:   ${result.dimensions.maintainability.score.toFixed(1)} (${(result.dimensions.maintainability.weight * 100).toFixed(0)}%) → 貢獻 ${result.dimensions.maintainability.weightedScore.toFixed(1)} 分`);
        console.log(`  架構垃圾:     ${result.dimensions.architecture.score.toFixed(1)} (${(result.dimensions.architecture.weight * 100).toFixed(0)}%) → 貢獻 ${result.dimensions.architecture.weightedScore.toFixed(1)} 分\n`);

        const criticalCount = result.topShit ? result.topShit.filter(s => s.severity === 'critical').length : 0;
        const highCount = result.topShit ? result.topShit.filter(s => s.severity === 'high').length : 0;
        const mediumCount = result.topShit ? result.topShit.filter(s => s.severity === 'medium').length : 0;
        const lowCount = result.topShit ? result.topShit.filter(s => s.severity === 'low').length : 0;

        console.log('問題統計:');
        console.log(`  🔴 嚴重問題:   ${criticalCount} 個`);
        console.log(`  🟠 高優先級:  ${highCount} 個`);
        console.log(`  🟡 中優先級:  ${mediumCount} 個`);
        console.log(`  🟢 低優先級:  ${lowCount} 個\n`);

        console.log(`掃描檔案: ${result.summary.analyzedFiles} 個（共 ${result.summary.totalFiles} 個）`);
        console.log(`總問題數: ${result.summary.totalShit} 個`);

        if (options.detailed && result.topShit && result.topShit.length > 0) {
          console.log('\n' + '='.repeat(50));
          console.log(`最糟的 ${result.topShit.length} 個項目:`);
          console.log('='.repeat(50));
          result.topShit.forEach((item, index) => {
            console.log(`\n${index + 1}. [${item.severity.toUpperCase()}] ${item.type}`);
            console.log(`   檔案: ${item.filePath}${item.location ? `:${item.location.line}` : ''}`);
            console.log(`   分數: ${item.score.toFixed(1)}`);
            console.log(`   描述: ${item.description}`);
          });

          if (result.recommendations && result.recommendations.length > 0) {
            console.log('\n' + '='.repeat(50));
            console.log('修復建議:');
            console.log('='.repeat(50));
            result.recommendations.forEach((rec, index) => {
              console.log(`\n${index + 1}. [優先級 ${rec.priority}] ${rec.category}`);
              console.log(`   建議: ${rec.suggestion}`);
              console.log(`   預期改善: ${rec.estimatedImpact.toFixed(1)} 分`);
              console.log(`   影響檔案: ${rec.affectedFiles.length} 個`);
            });
          }
        }

        console.log('\n' + '='.repeat(50));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (options.format === 'json') {
        console.error(JSON.stringify({ error: errorMessage }));
      } else {
        console.error('\n❌ 垃圾度分析失敗:', errorMessage);
      }

      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
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
    if (options.format !== 'json') {
      const titles: Record<string, string> = {
        'graph': '🕸️ 依賴圖分析...',
        'cycles': '🔄 循環依賴分析...',
        'impact': '💥 影響分析...',
        'orphans': '🏝️ 孤立檔案分析...'
      };
      console.log(titles[subcommand] || '🕸️ 分析依賴關係...');
    }

    try {
      const analyzePath = options.path || process.cwd();

      // 初始化依賴分析器
      if (!this.dependencyAnalyzer) {
        this.dependencyAnalyzer = new DependencyAnalyzer();
      }

      // 分析專案依賴
      const projectDeps = await this.dependencyAnalyzer.analyzeProject(analyzePath);

      // 獲取統計資訊
      const stats = this.dependencyAnalyzer.getStats();

      // 使用 CycleDetector 檢測循環依賴
      const cycleDetector = new (await import('../../core/dependency/cycle-detector.js')).CycleDetector();
      const graph = await DependencyUtils.buildGraphFromProjectDeps(projectDeps);
      const cycles = cycleDetector.detectCycles(graph);

      // 輸出結果
      if (options.format === 'json') {
        // 根據子命令決定輸出格式
        if (subcommand === 'graph') {
          // graph 子命令：輸出完整依賴圖（nodes, edges, summary）
          const allNodes = graph.getAllNodes();
          const allNodesSet = new Set(allNodes);

          // 計算每個節點的入度和出度
          const inDegreeMap = new Map<string, number>();
          const outDegreeMap = new Map<string, number>();

          for (const nodeId of allNodes) {
            const deps = graph.getDependencies(nodeId);
            outDegreeMap.set(nodeId, deps.length);

            for (const depId of deps) {
              if (allNodesSet.has(depId)) {
                inDegreeMap.set(depId, (inDegreeMap.get(depId) || 0) + 1);
              }
            }
          }

          const nodes = allNodes.map((nodeId: string) => ({
            id: nodeId,
            dependencies: graph.getDependencies(nodeId),
            inDegree: inDegreeMap.get(nodeId) || 0,
            outDegree: outDegreeMap.get(nodeId) || 0
          }));

          // 判斷是否為系統框架
          const isSystemFramework = (name: string): boolean => {
            const systemFrameworks = [
              'Foundation', 'UIKit', 'SwiftUI', 'Combine', 'CoreData',
              'CoreGraphics', 'CoreLocation', 'AVFoundation', 'MapKit',
              'WebKit', 'Security', 'PackageDescription'
            ];
            return systemFrameworks.includes(name);
          };

          const edges: Array<{source: string; target: string; type: string}> = [];
          for (const nodeId of allNodes) {
            for (const depId of graph.getDependencies(nodeId)) {
              // 系統框架一律標記為 external
              const isExternal = isSystemFramework(depId) || !allNodesSet.has(depId);
              edges.push({
                source: nodeId,
                target: depId,
                type: isExternal ? 'external' : 'internal'
              });
            }
          }

          // graph 子命令：保持原格式（nodes, edges, summary）
          console.log(JSON.stringify({
            nodes,
            edges,
            summary: {
              totalFiles: stats.totalFiles,
              totalDependencies: stats.totalDependencies,
              averageDependenciesPerFile: stats.averageDependenciesPerFile,
              maxDependenciesInFile: stats.maxDependenciesInFile
            }
          }, null, 2));
        } else if (subcommand === 'impact' && options.file) {
          // impact 子命令：分析檔案修改的影響範圍
          const targetFile = path.resolve(options.file);

          let actualTargetFile = targetFile;
          const directDependents = graph.getDependents(targetFile);

          // 如果找不到依賴關係，可能是路徑格式不匹配
          if (directDependents.length === 0) {
            // 嘗試在 graph 中找到匹配的路徑
            const allNodes = graph.getAllNodes();
            const matchingNode = allNodes.find((node: string) => node.endsWith(options.file) || options.file.endsWith(node));

            if (matchingNode) {
              // 找到匹配的節點，使用該路徑重新查詢
              actualTargetFile = matchingNode;
              const altDependents = graph.getDependents(matchingNode);
              directDependents.length = 0;
              directDependents.push(...altDependents);
            } else {
              // 檔案不在專案中或未被索引
              console.error(`❌ 錯誤：檔案不存在或未被索引: ${options.file}`);
              process.exit(1);
            }
          }

          // BFS 計算傳遞依賴
          const transitiveDependents: Set<string> = new Set();
          const visited = new Set<string>();
          const queue = [...directDependents];

          while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) {continue;}
            visited.add(current);
            transitiveDependents.add(current);

            const deps = graph.getDependents(current);
            for (const dep of deps) {
              if (!visited.has(dep)) {
                queue.push(dep);
              }
            }
          }

          // 計算影響等級
          const totalImpacted = transitiveDependents.size;
          let impactLevel: string;
          if (totalImpacted > 10) {impactLevel = 'high';}
          else if (totalImpacted > 3) {impactLevel = 'medium';}
          else {impactLevel = 'low';}

          // 計算影響評分 (0-100)
          const impactScore = Math.min(100, Math.round((totalImpacted / stats.totalFiles) * 100 * 2));

          console.log(JSON.stringify({
            file: options.file,
            impactLevel,
            impactScore,
            directDependents,
            transitiveDependents: Array.from(transitiveDependents),
            summary: {
              totalImpacted,
              directCount: directDependents.length,
              transitiveCount: transitiveDependents.size
            }
          }, null, 2));
        } else if (subcommand === 'orphans') {
          // orphans 子命令：檢測孤立檔案
          const allNodes = graph.getAllNodes();
          const orphans: Array<{filePath: string; reason: string}> = [];

          for (const node of allNodes) {
            const dependents = graph.getDependents(node);
            if (dependents.length === 0) {
              orphans.push({
                filePath: node,
                reason: 'No files depend on this file'
              });
            }
          }

          console.log(JSON.stringify({
            orphans,
            summary: {
              totalOrphans: orphans.length,
              totalFiles: stats.totalFiles,
              orphanPercentage: Math.round((orphans.length / stats.totalFiles) * 100)
            }
          }, null, 2));
        } else if (options.file) {
          // 單檔案依賴查詢模式
          const targetFile = path.resolve(options.file);
          const dependencies: Record<string, string[]> = {};
          dependencies[options.file] = graph.getDependencies(targetFile);

          console.log(JSON.stringify({
            dependencies
          }, null, 2));
        } else {
          // 其他子命令（cycles）或無子命令：輸出問題導向格式
          const outputData: any = {
            issues: {
              cycles: cycles.map(c => ({
                cycle: c.cycle,
                length: c.length,
                severity: c.severity
              })),
              circularDependencies: cycles.length,
              orphanedFiles: stats.orphanedFiles
            },
            summary: {
              totalFiles: stats.totalFiles,
              totalDependencies: stats.totalDependencies,
              averageDependenciesPerFile: stats.averageDependenciesPerFile,
              maxDependenciesInFile: stats.maxDependenciesInFile,
              cyclesFound: cycles.length,
              issuesFound: cycles.length + stats.orphanedFiles
            }
          };

          // 只有在 --all 時才輸出完整依賴圖
          if (options.all) {
            const nodes = graph.getAllNodes().map((nodeId: string) => ({
              id: nodeId,
              dependencies: graph.getDependencies(nodeId)
            }));

            const edges: Array<{source: string; target: string}> = [];
            for (const nodeId of graph.getAllNodes()) {
              for (const depId of graph.getDependencies(nodeId)) {
                edges.push({ source: nodeId, target: depId });
              }
            }

            outputData.all = {
              nodes,
              edges
            };
          }

          console.log(JSON.stringify(outputData, null, 2));
        }
      } else {
        const completeTitles: Record<string, string> = {
          'graph': '✅ 依賴圖分析',
          'cycles': '✅ 循環依賴分析',
          'impact': '✅ 影響分析',
          'orphans': '✅ 孤立檔案分析'
        };
        console.log(completeTitles[subcommand] || '✅ 依賴分析完成!');
        console.log('📊 統計:');
        console.log(`   總檔案數: ${stats.totalFiles}`);
        console.log(`   總依賴數: ${stats.totalDependencies}`);
        console.log(`   平均依賴數: ${stats.averageDependenciesPerFile.toFixed(2)}`);
        console.log(`   最大依賴數: ${stats.maxDependenciesInFile}`);

        if (cycles.length > 0) {
          console.log(`⚠️  發現 ${cycles.length} 個循環依賴:`);
          cycles.forEach((cycle, index) => {
            console.log(`   ${index + 1}. ${cycle.cycle.join(' → ')} (長度: ${cycle.length}, 嚴重性: ${cycle.severity})`);
          });
        } else {
          console.log('✓ 無循環依賴');
        }

        if (stats.orphanedFiles > 0) {
          console.log(`⚠️  發現 ${stats.orphanedFiles} 個孤立檔案`);
        }
      }
    } catch (error) {
      if (options.format === 'json') {
        console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      } else {
        console.error('❌ 依賴分析失敗:', error instanceof Error ? error.message : error);
      }
      if (process.env.NODE_ENV !== 'test') {
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      }
    }
  }

  /**
   * 從專案依賴資訊建立依賴圖
   */
  private async handlePluginsListCommand(options: any): Promise<void> {
    console.log('🔌 插件列表:');

    const registry = ParserRegistry.getInstance();

    // 確保 registry 存在且有 listParsers 方法
    if (!registry || typeof registry.listParsers !== 'function') {
      console.log('📝 插件系統尚未初始化');
      return;
    }

    const parsers = registry.listParsers();

    if (!parsers || parsers.length === 0) {
      console.log('📝 未找到已註冊的插件');
      return;
    }

    console.table(parsers.map(p => ({
      名稱: p.name,
      版本: p.version,
      支援副檔名: p.supportedExtensions.join(', '),
      支援語言: p.supportedLanguages.join(', '),
      註冊時間: p.registeredAt.toLocaleString()
    })));
  }

  private async handlePluginInfoCommand(pluginName: string): Promise<void> {
    const registry = ParserRegistry.getInstance();

    // 確保 registry 存在且有 getParserByName 方法
    if (!registry || typeof registry.getParserByName !== 'function') {
      console.error('❌ 插件系統尚未初始化');
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }

    const plugin = registry.getParserByName(pluginName);

    if (!plugin) {
      console.error(`❌ 找不到插件: ${pluginName}`);
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }

    console.log(`🔌 插件資訊: ${pluginName}`);
    // TODO: 顯示詳細插件資訊
  }

}