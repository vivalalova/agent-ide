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
import { SwiftParser } from '../../plugins/swift/parser.js';
import * as fs from 'fs/promises';
import * as path from 'path';

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

  private async initializeParsers(): Promise<void> {
    try {
      const registry = ParserRegistry.getInstance();

      // 在測試環境中，檢查是否已經有測試 Parser 註冊
      if (process.env.NODE_ENV === 'test') {
        // 如果測試 Parser 已經註冊，就不需要註冊生產 Parser
        if (registry.getParserByName('typescript') || registry.getParserByName('javascript')) {
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
        const swiftParser = new SwiftParser();
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
      .version('0.1.0');

    this.setupIndexCommand();
    this.setupRenameCommand();
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
      .option('-f, --from <name>', '原始名稱')
      .option('-o, --to <name>', '新名稱')
      .option('-p, --path <path>', '檔案或目錄路徑', '.')
      .option('--preview', '預覽變更而不執行')
      .action(async (options) => {
        await this.handleRenameCommand(options);
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
      .command('analyze')
      .description('分析程式碼品質')
      .option('-p, --path <path>', '分析路徑', '.')
      .option('-t, --type <type>', '分析類型 (complexity|dependencies|quality)')
      .option('--format <format>', '輸出格式 (json|table|summary)', 'summary')
      .action(async (options) => {
        await this.handleAnalyzeCommand(options);
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
      process.exit(1);
    }
  }

  private async handleRenameCommand(options: any): Promise<void> {
    if (!options.from || !options.to) {
      console.error('❌ 必須指定 --from 和 --to 參數');
      process.exit(1);
    }

    console.log(`🔄 重新命名 ${options.from} → ${options.to}`);

    try {
      // 初始化索引引擎（如果還沒有）
      if (!this.indexEngine) {
        const config = createIndexConfig(options.path || process.cwd(), {
          includeExtensions: ['.ts', '.tsx', '.js', '.jsx'],
          excludePatterns: ['node_modules/**', '*.test.*']
        });
        this.indexEngine = new IndexEngine(config);
        await this.indexEngine.indexProject(options.path || process.cwd());
      }

      // 初始化重新命名引擎
      if (!this.renameEngine) {
        this.renameEngine = new RenameEngine();
      }

      // 1. 查找符號
      console.log(`🔍 查找符號 "${options.from}"...`);
      const searchResults = await this.indexEngine.findSymbol(options.from);

      if (searchResults.length === 0) {
        console.log(`❌ 找不到符號 "${options.from}"`);
        process.exit(1);
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
          // 確保有有效的檔案路徑
          let filePaths: string[];
          if (targetSymbol.location && targetSymbol.location.filePath) {
            filePaths = [targetSymbol.location.filePath];
          } else {
            // 如果沒有 location，使用所有已索引的檔案
            const allFiles = this.indexEngine.getAllIndexedFiles();
            filePaths = allFiles.map(f => f.filePath);

            if (filePaths.length === 0) {
              filePaths = [options.path || process.cwd()];
            }
          }

          const preview = await this.renameEngine.previewRename({
            symbol: targetSymbol,
            newName: options.to,
            filePaths
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
          process.exit(1);
        }
      }

      // 3. 執行重新命名（處理跨檔案引用）
      console.log('✏️  執行重新命名...');

      // 使用 ReferenceUpdater 來處理跨檔案引用
      const referenceUpdater = new ReferenceUpdater();
      const allProjectFiles = await this.getAllProjectFiles(options.path);

      const updateResult = await referenceUpdater.updateCrossFileReferences(
        targetSymbol,
        options.to,
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
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ 重新命名失敗:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  private async handleMoveCommand(source: string, target: string, options: any): Promise<void> {
    console.log(`📦 移動 ${source} → ${target}`);

    try {
      // 檢查源檔案是否存在
      const sourceExists = await this.fileExists(source);
      if (!sourceExists) {
        console.log(`❌ 移動失敗: 源檔案不存在 "${source}"`);
        process.exit(1);
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
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ 移動失敗:', error instanceof Error ? error.message : error);
      process.exit(1);
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
        // 對於 minimal 和 json 格式，只輸出錯誤訊息而不使用圖示
        console.error(`Error: ${error instanceof Error ? error.message : error}`);
      } else {
        console.error('❌ 搜尋失敗:', error instanceof Error ? error.message : error);
      }
      process.exit(1);
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
      console.log(JSON.stringify(result, null, 2));
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

  private async handleAnalyzeCommand(options: any): Promise<void> {
    console.log('📊 分析程式碼品質...');

    // TODO: 實作分析功能
    console.log('🚧 程式碼分析功能開發中...');
  }

  private async handleDepsCommand(options: any): Promise<void> {
    console.log('🕸️ 分析依賴關係...');

    try {
      // TODO: 初始化 DependencyAnalyzer
      console.log('🚧 依賴分析功能開發中...');
    } catch (error) {
      console.error('❌ 依賴分析失敗:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
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
      process.exit(1);
    }

    const plugin = registry.getParserByName(pluginName);

    if (!plugin) {
      console.error(`❌ 找不到插件: ${pluginName}`);
      process.exit(1);
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