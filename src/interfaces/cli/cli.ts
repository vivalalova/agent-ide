/**
 * CLI 介面實作
 * 提供命令列介面來操作 Agent IDE 功能
 */

import { Command } from 'commander';
import { IndexEngine } from '../../core/indexing/index-engine.js';
import { DependencyAnalyzer } from '../../core/dependency/dependency-analyzer.js';
import { RenameEngine } from '../../core/rename/rename-engine.js';
import { ReferenceUpdater } from '../../core/rename/reference-updater.js';
import { ImportResolver, MoveService } from '../../core/move/index.js';
import { SearchService } from '../../core/search/service.js';
import { createIndexConfig } from '../../core/indexing/types.js';
import { ParserRegistry } from '../../infrastructure/parser/registry.js';
import { TypeScriptParser } from '../../plugins/typescript/parser.js';
import { JavaScriptParser } from '../../plugins/javascript/parser.js';
import { ComplexityAnalyzer } from '../../core/analysis/complexity-analyzer.js';
import { DeadCodeDetector } from '../../core/analysis/dead-code-detector.js';
import * as fs from 'fs/promises';
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
  private indexEngine?: IndexEngine;
  private dependencyAnalyzer?: DependencyAnalyzer;
  private renameEngine?: RenameEngine;
  private importResolver?: ImportResolver;
  private moveService?: MoveService;
  private searchService?: SearchService;

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

    this.setupIndexCommand();
    this.setupRenameCommand();
    this.setupRefactorCommand();
    this.setupMoveCommand();
    this.setupSearchCommand();
    this.setupAnalyzeCommand();
    this.setupDepsCommand();
    this.setupPluginsCommand();
  }

  private setupIndexCommand(): void {
    this.program
      .command('index')
      .description('建立或更新程式碼索引')
      .option('-p, --path <path>', '專案路徑', process.cwd())
      .option('-u, --update', '增量更新索引')
      .option('-e, --extensions <exts>', '包含的檔案副檔名', '.ts,.js,.tsx,.jsx')
      .option('-x, --exclude <patterns>', '排除模式', 'node_modules/**,*.test.*')
      .action(async (options) => {
        await this.handleIndexCommand(options);
      });
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
      .action(async (options) => {
        await this.handleRenameCommand(options);
      });
  }

  private setupRefactorCommand(): void {
    this.program
      .command('refactor <action>')
      .description('重構程式碼 (extract-function | inline-function)')
      .option('-f, --file <file>', '檔案路徑')
      .option('-s, --start-line <line>', '起始行號')
      .option('-e, --end-line <line>', '結束行號')
      .option('-n, --function-name <name>', '函式名稱')
      .option('-p, --path <path>', '專案路徑', '.')
      .option('--preview', '預覽變更而不執行')
      .action(async (action, options) => {
        await this.handleRefactorCommand(action, options);
      });
  }

  private setupMoveCommand(): void {
    this.program
      .command('move')
      .description('移動檔案或目錄')
      .argument('<source>', '來源路徑')
      .argument('<target>', '目標路徑')
      .option('--update-imports', '自動更新 import 路徑', true)
      .option('--preview', '預覽變更而不執行')
      .action(async (source, target, options) => {
        await this.handleMoveCommand(source, target, options);
      });
  }

  private setupSearchCommand(): void {
    this.program
      .command('search')
      .description('搜尋程式碼')
      .argument('<query>', '搜尋查詢')
      .option('-t, --type <type>', '搜尋類型 (text|regex|fuzzy)', 'text')
      .option('-p, --path <path>', '搜尋路徑', '.')
      .option('-e, --extensions <exts>', '檔案副檔名', '.ts,.js,.tsx,.jsx')
      .option('-l, --limit <num>', '結果數量限制', '50')
      .option('-c, --context <lines>', '上下文行數', '2')
      .option('--case-sensitive', '大小寫敏感')
      .option('--whole-word', '全字匹配')
      .option('--multiline', '多行匹配')
      .option('--include <patterns>', '包含模式')
      .option('--exclude <patterns>', '排除模式', 'node_modules/**,*.test.*')
      .option('--format <format>', '輸出格式 (list|json|minimal)', 'list')
      .action(async (query, options) => {
        await this.handleSearchCommand(query, options);
      });
  }

  private setupAnalyzeCommand(): void {
    this.program
      .command('analyze [type]')
      .description('分析程式碼品質')
      .option('-p, --path <path>', '分析路徑', '.')
      .option('--pattern <pattern>', '分析模式')
      .option('--format <format>', '輸出格式 (json|table|summary)', 'summary')
      .action(async (type, options) => {
        await this.handleAnalyzeCommand(type, options);
      });
  }

  private setupDepsCommand(): void {
    this.program
      .command('deps')
      .description('分析依賴關係')
      .option('-p, --path <path>', '分析路徑', '.')
      .option('-t, --type <type>', '分析類型 (graph|cycles|impact)')
      .option('-f, --file <file>', '特定檔案分析')
      .option('--format <format>', '輸出格式 (json|dot|summary)', 'summary')
      .action(async (options) => {
        await this.handleDepsCommand(options);
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

  // Command handlers
  private async handleIndexCommand(options: any): Promise<void> {
    console.log('🔍 開始建立程式碼索引...');

    try {
      const config = createIndexConfig(options.path, {
        includeExtensions: options.extensions.split(','),
        excludePatterns: options.exclude.split(',')
      });

      this.indexEngine = new IndexEngine(config);

      if (options.update) {
        // TODO: 實作增量更新
        console.log('📝 執行增量索引更新...');
      } else {
        await this.indexEngine.indexProject(options.path);
      }

      const stats = await this.indexEngine.getStats();
      console.log('✅ 索引完成!');
      console.log(`📊 統計: ${stats.totalFiles} 檔案, ${stats.totalSymbols} 符號`);

    } catch (error) {
      console.error('❌ 索引失敗:', error instanceof Error ? error.message : error);
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
  }

  private async handleRenameCommand(options: any): Promise<void> {
    // 支援多種參數名稱
    const from = options.symbol || options.from;
    const to = options.newName || options.to;

    if (!from || !to) {
      console.error('❌ 必須指定符號名稱和新名稱');
      console.error('   使用方式: agent-ide rename --symbol <name> --new-name <name>');
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      return;
    }

    console.log(`🔄 重新命名 ${from} → ${to}`);

    try {
      const workspacePath = options.path || process.cwd();

      // 初始化索引引擎（每次都重新索引以確保資料是最新的）
      const config = createIndexConfig(workspacePath, {
        includeExtensions: ['.ts', '.tsx', '.js', '.jsx'],
        excludePatterns: ['node_modules/**', '*.test.*']
      });
      this.indexEngine = new IndexEngine(config);
      await this.indexEngine.indexProject(workspacePath);

      // 初始化重新命名引擎
      if (!this.renameEngine) {
        this.renameEngine = new RenameEngine();
      }

      // 1. 查找符號
      console.log(`🔍 查找符號 "${from}"...`);
      const searchResults = await this.indexEngine.findSymbol(from);

      if (searchResults.length === 0) {
        console.log(`❌ 找不到符號 "${from}"`);
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        return;
      }

      if (searchResults.length > 1) {
        console.log('⚠️  找到多個符號，使用第一個:');
        searchResults.forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.symbol.name} 在 ${result.symbol.location.filePath}:${result.symbol.location.range.start.line}`);
        });
      }

      const targetSymbol = searchResults[0].symbol;

      // 2. 預覽變更
      if (options.preview) {
        console.log('🔍 預覽變更...');
        try {
          // 取得所有專案檔案以進行跨檔案引用查找
          const allProjectFiles = await this.getAllProjectFiles(options.path || workspacePath);

          const preview = await this.renameEngine.previewRename({
            symbol: targetSymbol,
            newName: to,
            filePaths: allProjectFiles
          });

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
          return;
        } catch (previewError) {
          console.error('❌ 預覽失敗:', previewError instanceof Error ? previewError.message : previewError);
          if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        }
      }

      // 3. 執行重新命名（處理跨檔案引用）
      console.log('✏️  執行重新命名...');

      // 取得 ParserRegistry 單例
      const parserRegistry = ParserRegistry.getInstance();

      // 確保 parsers 已註冊（如果尚未註冊）
      if (!parserRegistry.getParserByName('typescript')) {
        parserRegistry.register(new TypeScriptParser());
      }
      if (!parserRegistry.getParserByName('javascript')) {
        parserRegistry.register(new JavaScriptParser());
      }

      // 使用 ReferenceUpdater 來處理跨檔案引用
      const referenceUpdater = new ReferenceUpdater(parserRegistry);
      const allProjectFiles = await this.getAllProjectFiles(options.path);

      const updateResult = await referenceUpdater.updateCrossFileReferences(
        targetSymbol,
        to,
        allProjectFiles
      );

      if (updateResult.success) {
        console.log('✅ 重新命名成功!');
        console.log(`📊 統計: ${updateResult.updatedFiles.length} 檔案, ${updateResult.updatedFiles.reduce((sum, f) => sum + f.changes.length, 0)} 變更`);

        updateResult.updatedFiles.forEach(file => {
          file.changes.forEach(change => {
            console.log(`   ✓ ${file.filePath}: "${change.oldText}" → "${change.newText}"`);
          });
        });
      } else {
        console.error('❌ 重新命名失敗:');
        updateResult.errors?.forEach(error => {
          console.error(`   - ${error}`);
        });
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      }

    } catch (error) {
      console.error('❌ 重新命名失敗:', error instanceof Error ? error.message : error);
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
  }

  private async handleRefactorCommand(action: string, options: any): Promise<void> {
    if (!options.file) {
      console.error('❌ 必須指定 --file 參數');
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      return;
    }

    console.log(`🔧 重構: ${action}`);

    try {
      const filePath = path.resolve(options.file);

      if (action === 'extract-function') {
        if (!options.startLine || !options.endLine || !options.functionName) {
          console.error('❌ extract-function 需要 --start-line, --end-line 和 --function-name 參數');
          if (process.env.NODE_ENV !== 'test') { process.exit(1); }
          return;
        }

        // 讀取檔案內容
        const fs = await import('fs/promises');
        const code = await fs.readFile(filePath, 'utf-8');

        // 建立範圍
        const range = {
          start: { line: parseInt(options.startLine), column: 0 },
          end: { line: parseInt(options.endLine), column: 0 }
        };

        // 初始化 FunctionExtractor
        const { FunctionExtractor } = await import('../../core/refactor/extract-function.js');
        const extractor = new FunctionExtractor();

        // 執行提取
        const result = await extractor.extract(code, range, {
          functionName: options.functionName,
          generateComments: true,
          preserveFormatting: true,
          validateExtraction: true
        });

        if (result.success) {
          // 套用編輯
          let modifiedCode = code;
          result.edits.forEach(edit => {
            modifiedCode = this.applyCodeEdit(modifiedCode, edit);
          });

          // 提取函式簽名（從修改後的程式碼中）
          const functionSignatureMatch = modifiedCode.match(new RegExp(`(async\\s+)?function\\s+${result.functionName}\\s*\\([^)]*\\)`));
          const functionSignature = functionSignatureMatch ? functionSignatureMatch[0] : `function ${result.functionName}`;

          console.log('✅ 重構完成');
          console.log(`📝 提取的函式: ${functionSignature}`);
          console.log(functionSignature);

          if (!options.preview) {
            // 寫入檔案
            await fs.writeFile(filePath, modifiedCode, 'utf-8');
            console.log(`✓ 已更新 ${filePath}`);
          } else {
            console.log('\n🔍 預覽模式 - 未寫入檔案');
            console.log(`📊 參數: ${result.parameters.map(p => p.name).join(', ')}`);
          }
        } else {
          console.error('❌ 重構失敗:', result.errors.join(', '));
          if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        }

      } else if (action === 'inline-function') {
        console.error('❌ inline-function 尚未實作');
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      } else {
        console.error(`❌ 未知的重構操作: ${action}`);
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      }

    } catch (error) {
      console.error('❌ 重構失敗:', error instanceof Error ? error.message : error);
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
  }

  private async handleMoveCommand(source: string, target: string, options: any): Promise<void> {
    console.log(`📦 移動 ${source} → ${target}`);

    try {
      // 檢查源檔案是否存在
      const sourceExists = await this.fileExists(source);
      if (!sourceExists) {
        console.log(`❌ 移動失敗: 源檔案不存在 "${source}"`);
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      }

      // 初始化移動服務
      if (!this.moveService) {
        this.moveService = new MoveService({
          pathAliases: {},
          supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.vue'],
          includeNodeModules: false
        });
      }

      const moveOperation = {
        source: path.resolve(source),
        target: path.resolve(target),
        updateImports: options.updateImports
      };

      const moveOptions = {
        preview: options.preview,
        projectRoot: process.cwd()
      };

      // 執行移動操作
      const result = await this.moveService.moveFile(moveOperation, moveOptions);

      if (result.success) {
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
      } else {
        console.error('❌ 移動失敗:', result.error);
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      }

    } catch (error) {
      console.error('❌ 移動失敗:', error instanceof Error ? error.message : error);
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
      const searchOptions = this.buildSearchOptions(options);

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
      this.formatSearchResults(result, options);

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
   * 建構搜尋選項
   */
  private buildSearchOptions(options: any) {
    const includeFiles = options.include ? options.include.split(',') : undefined;
    const excludeFiles = options.exclude ? options.exclude.split(',') : undefined;

    return {
      scope: {
        type: 'directory' as const,
        path: path.resolve(options.path),
        recursive: true
      },
      maxResults: parseInt(options.limit),
      caseSensitive: options.caseSensitive || false,
      wholeWord: options.wholeWord || false,
      regex: options.type === 'regex',
      fuzzy: options.type === 'fuzzy',
      multiline: options.multiline || false,
      showContext: options.context > 0,
      contextLines: parseInt(options.context),
      includeFiles,
      excludeFiles,
      timeout: 30000
    };
  }

  /**
   * 格式化搜尋結果輸出
   */
  private formatSearchResults(result: any, options: any): void {
    switch (options.format) {
    case 'json':
      // 測試期望的格式是 { results: [...] } 而不是 { matches: [...] }
      // 將絕對路徑轉換為相對路徑
      const resultsWithRelativePaths = result.matches.map((match: any) => ({
        ...match,
        file: this.formatFilePath(match.file)
      }));
      console.log(JSON.stringify({ results: resultsWithRelativePaths }, null, 2));
      break;

    case 'minimal':
      // AI Agent 友善的最小輸出
      result.matches.forEach((match: any) => {
        console.log(`${match.file}:${match.line}:${match.column}:${match.content.trim()}`);
      });
      break;

    case 'list':
    default:
      result.matches.forEach((match: any, index: number) => {
        console.log(`\n${index + 1}. ${this.formatFilePath(match.file)}:${match.line}:${match.column}`);
        console.log(`   ${this.highlightMatch(match.content, options.query)}`);

        // 顯示上下文
        if (options.context > 0 && match.context) {
          if (match.context.before.length > 0) {
            match.context.before.forEach((line: string, i: number) => {
              const lineNum = match.line - match.context.before.length + i;
              console.log(`   ${lineNum.toString().padStart(3, ' ')}: ${line}`);
            });
          }

          console.log(`>> ${match.line.toString().padStart(3, ' ')}: ${this.highlightMatch(match.content, options.query)}`);

          if (match.context.after.length > 0) {
            match.context.after.forEach((line: string, i: number) => {
              const lineNum = match.line + i + 1;
              console.log(`   ${lineNum.toString().padStart(3, ' ')}: ${line}`);
            });
          }
        }
      });
      break;
    }
  }

  /**
   * 格式化檔案路徑（顯示相對路徑）
   */
  private formatFilePath(filePath: string): string {
    const cwd = process.cwd();
    const relativePath = path.relative(cwd, filePath);
    return relativePath.startsWith('..') ? filePath : relativePath;
  }

  /**
   * 高亮匹配內容
   */
  private highlightMatch(text: string, query: string): string {
    if (!text || !query) {return text;}

    // 簡單的高亮實作
    try {
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      return text.replace(regex, `[${query}]`);
    } catch {
      return text;
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
        const analyzer = new ComplexityAnalyzer();

        // 獲取需要分析的檔案列表
        const files = await this.getAllProjectFiles(analyzePath);
        const results = await analyzer.analyzeFiles(files);

        // 計算統計資訊
        const complexities = results.map(r => r.complexity.cyclomaticComplexity);
        const averageComplexity = complexities.length > 0
          ? complexities.reduce((sum, c) => sum + c, 0) / complexities.length
          : 0;
        const maxComplexity = complexities.length > 0
          ? Math.max(...complexities)
          : 0;

        if (options.format === 'json') {
          console.log(JSON.stringify({
            files: results.map(r => ({
              path: r.file,
              complexity: r.complexity.cyclomaticComplexity,
              cognitiveComplexity: r.complexity.cognitiveComplexity,
              evaluation: r.complexity.evaluation
            })),
            summary: {
              averageComplexity,
              maxComplexity,
              totalFiles: results.length
            }
          }, null, 2));
        } else {
          console.log('✅ 複雜度分析完成!');
          console.log(`📊 統計: ${results.length} 個檔案`);
          console.log(`   平均複雜度: ${averageComplexity.toFixed(2)}`);
          console.log(`   最高複雜度: ${maxComplexity}`);
        }
      } else if (analyzeType === 'dead-code') {
        const detector = new DeadCodeDetector();

        // 獲取需要分析的檔案列表
        const files = await this.getAllProjectFiles(analyzePath);
        const results = await detector.detectInFiles(files);

        // 統計結果
        const allDeadCode = results.flatMap(r => r.deadCode);
        const deadFunctions = allDeadCode.filter(d => d.type === 'function');
        const deadVariables = allDeadCode.filter(d => d.type === 'variable');

        if (options.format === 'json') {
          console.log(JSON.stringify({
            files: results.map(r => ({
              path: r.file,
              deadCode: r.deadCode
            })),
            deadFunctions: allDeadCode.filter(d => d.type === 'function'),
            deadVariables: allDeadCode.filter(d => d.type === 'variable'),
            summary: {
              totalDeadFunctions: deadFunctions.length,
              totalDeadVariables: deadVariables.length,
              totalDeadCode: allDeadCode.length
            }
          }, null, 2));
        } else {
          console.log('✅ 死代碼檢測完成!');
          console.log('📊 發現:');
          console.log(`   未使用函式: ${deadFunctions.length} 個`);
          console.log(`   未使用變數: ${deadVariables.length} 個`);
        }
      } else if (analyzeType === 'best-practices') {
        // 檢查最佳實踐
        const files = await this.getAllProjectFiles(analyzePath);
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
        const files = await this.getAllProjectFiles(analyzePath);
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
      } else {
        throw new Error(`不支援的分析類型: ${analyzeType}`);
      }
    } catch (error) {
      if (options.format === 'json') {
        console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      } else {
        console.error('❌ 分析失敗:', error instanceof Error ? error.message : error);
      }
      if (process.env.NODE_ENV !== 'test') {
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      }
    }
  }

  private async handleDepsCommand(options: any): Promise<void> {
    if (options.format !== 'json') {
      console.log('🕸️ 分析依賴關係...');
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
      const graph = await this.buildGraphFromProjectDeps(projectDeps);
      const cycles = cycleDetector.detectCycles(graph);

      // 輸出結果
      if (options.format === 'json') {
        // 建立 nodes 和 edges 格式（為了符合測試期望）
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

        // 根據 --file 選項決定輸出格式
        if (options.file) {
          // 單檔案依賴查詢模式
          const targetFile = path.resolve(options.file);
          const dependencies: Record<string, string[]> = {};
          dependencies[options.file] = graph.getDependencies(targetFile);

          console.log(JSON.stringify({
            dependencies
          }, null, 2));
        } else {
          // 專案依賴圖模式
          console.log(JSON.stringify({
            nodes,
            edges,
            cycles: cycles.map(c => ({
              cycle: c.cycle,
              length: c.length,
              severity: c.severity
            })),
            stats: {
              totalFiles: stats.totalFiles,
              totalDependencies: stats.totalDependencies,
              averageDependenciesPerFile: stats.averageDependenciesPerFile,
              maxDependenciesInFile: stats.maxDependenciesInFile,
              circularDependencies: cycles.length,
              orphanedFiles: stats.orphanedFiles
            }
          }, null, 2));
        }
      } else {
        console.log('✅ 依賴分析完成!');
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
  private async buildGraphFromProjectDeps(projectDeps: any): Promise<any> {
    const { DependencyGraph } = await import('../../core/dependency/dependency-graph.js');
    const graph = new DependencyGraph();

    // 新增所有檔案節點及其依賴關係
    for (const fileDep of projectDeps.fileDependencies) {
      graph.addNode(fileDep.filePath);

      for (const dep of fileDep.dependencies) {
        graph.addDependency(fileDep.filePath, dep.path);
      }
    }

    return graph;
  }

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


  /**
   * 檢查檔案是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 套用程式碼編輯
   */
  private applyCodeEdit(code: string, edit: { range: { start: { line: number; column: number }; end: { line: number; column: number } }; newText: string }): string {
    const lines = code.split('\n');
    const startLine = edit.range.start.line - 1; // 轉為 0-based
    const endLine = edit.range.end.line - 1;

    // 取得編輯範圍前後的內容
    const before = lines.slice(0, startLine);
    const after = lines.slice(endLine + 1);

    // 組合新的內容
    return [...before, edit.newText, ...after].join('\n');
  }

  /**
   * 獲取專案中的所有檔案
   */
  private async getAllProjectFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    const allowedExtensions = ['.ts', '.tsx', '.js', '.jsx'];
    const excludePatterns = ['node_modules', 'dist', '.git', 'coverage'];

    async function walkDir(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // 跳過排除的目錄
            if (excludePatterns.some(pattern => entry.name.includes(pattern))) {
              continue;
            }
            await walkDir(fullPath);
          } else if (entry.isFile()) {
            // 只包含支援的副檔名
            if (allowedExtensions.some(ext => entry.name.endsWith(ext))) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // 忽略無法存取的目錄
      }
    }

    await walkDir(projectPath);
    return files;
  }
}