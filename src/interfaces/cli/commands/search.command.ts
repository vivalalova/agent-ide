/**
 * Search 命令
 * 搜尋程式碼
 */

import type { Command } from 'commander';
import * as path from 'path';
import { IndexEngine } from '@core/indexing/index-engine.js';
import { SearchService } from '@core/search/service.js';
import { createIndexConfig } from '@core/indexing/types.js';
import { QueryCommand, type SearchResult, type SearchMatch } from '@infrastructure/formatters/index.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

/** Search 命令選項 */
interface SearchOptions {
  type: string;
  path: string;
  extensions: string;
  limit: string;
  context: string;
  caseSensitive?: boolean;
  caseInsensitive?: boolean;
  wholeWord?: boolean;
  multiline?: boolean;
  include?: string;
  exclude: string;
  format: string;
  query?: string;
  pattern?: string;
  regex?: boolean;
  filePattern?: string;
  withAttribute?: string;
  withModifier?: string;
  implements?: string;
  extends?: string;
}

/**
 * 設定 search 命令
 */
export function setupSearchCommand(program: Command, context: CommandContext): void {
  program
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
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .option('-q, --query <name>', '搜尋查詢字串')
    .option('--pattern <pattern>', '符號名稱模式（用於 structural 搜尋）')
    .option('--regex', '使用正則表達式')
    .option('--file-pattern <pattern>', '檔案模式過濾')
    .option('--with-attribute <attr>', '過濾帶有特定屬性的符號')
    .option('--with-modifier <mod>', '過濾帶有特定修飾符的符號')
    .option('--implements <protocol>', '過濾實作特定協定的類別')
    .option('--extends <class>', '過濾繼承特定類別的子類別')
    .action(async (queryOrSubcommand: string | undefined, options: SearchOptions) => {
      await handleSearchAction(queryOrSubcommand, options, context);
    });
}

/**
 * 處理 search 動作
 */
async function handleSearchAction(
  queryOrSubcommand: string | undefined,
  options: SearchOptions,
  context: CommandContext
): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();
  let format: OutputFormat;

  try {
    format = parseOutputFormat(options.format, false);
  } catch {
    outputHandler.outputError('不支援的輸出格式。可用格式: json, summary', OutputFormat.Summary);
    process.exitCode = 1;
    return;
  }

  // 檢查空字串或未提供
  if (!queryOrSubcommand || queryOrSubcommand.trim() === '') {
    const errorResult: SearchResult = {
      command: QueryCommand.Search,
      success: false,
      results: [],
      summary: { totalScanned: 0, issuesFound: 0 },
      errors: ['請提供搜尋查詢或子命令。使用方式: agent-ide search <query>']
    };
    outputHandler.outputQuery(errorResult, format);
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
      await handleSymbolSearchCommand(options, context, format, outputHandler);
    } else if (queryOrSubcommand === 'text') {
      await handleTextSearchCommand(options, context, format, outputHandler);
    } else if (queryOrSubcommand === 'structural') {
      await handleStructuralSearchCommand(options, context, format, outputHandler);
    }
  } else {
    // 簡化語法：直接使用查詢字串
    await handleSearchCommand(queryOrSubcommand, options, context, format, outputHandler);
  }
}

/**
 * 處理搜尋命令
 */
async function handleSearchCommand(
  query: string,
  options: SearchOptions,
  context: CommandContext,
  format: OutputFormat,
  outputHandler: ReturnType<typeof createUnifiedOutputHandler>
): Promise<void> {
  if (format !== OutputFormat.Json) {
    console.log(`🔍 搜尋: "${query}"`);
  }

  try {
    // 初始化搜尋服務
    const searchService = new SearchService(context.fileSystem);

    // 建構搜尋選項
    const searchOptions = buildSearchOptions(options);

    // 根據搜尋類型建立查詢
    const searchQuery = {
      type: 'text' as const,
      query,
      options: searchOptions
    };

    // 執行搜尋
    const startTime = Date.now();
    const coreResult = await searchService.searchText(searchQuery);
    const searchTime = Date.now() - startTime;

    // 轉換為 SearchResult
    const matches: SearchMatch[] = coreResult.matches.map((m: { file: string; line: number; column?: number; content: string; context?: { before?: string[]; after?: string[] } }) => ({
      filePath: formatFilePath(m.file),
      line: m.line,
      column: m.column,
      content: m.content,
      context: m.context ? [...(m.context.before ?? []), ...(m.context.after ?? [])] : undefined
    }));

    const result: SearchResult = {
      command: QueryCommand.Search,
      success: true,
      results: matches,
      truncated: coreResult.truncated,
      searchTime,
      summary: {
        totalScanned: matches.length,
        issuesFound: matches.length
      }
    };

    outputHandler.outputQuery(result, format);
  } catch (error) {
    handleError(error, format);
  }
}

/**
 * 建構搜尋選項
 */
function buildSearchOptions(options: SearchOptions) {
  let includeFiles = options.include ? options.include.split(',') : undefined;
  const excludeFiles = options.exclude ? options.exclude.split(',') : undefined;

  // --file-pattern 參數轉換為 includeFiles
  if (options.filePattern) {
    includeFiles = [options.filePattern];
  }

  return {
    scope: {
      type: 'directory' as const,
      path: path.resolve(options.path),
      recursive: true
    },
    maxResults: parseInt(options.limit),
    caseSensitive: options.caseInsensitive ? false : (options.caseSensitive || false),
    wholeWord: options.wholeWord || false,
    regex: options.regex || options.type === 'regex',
    fuzzy: options.type === 'fuzzy',
    multiline: options.multiline || false,
    showContext: parseInt(options.context) > 0,
    contextLines: parseInt(options.context),
    includeFiles,
    excludeFiles,
    timeout: 30000
  };
}


/**
 * 格式化檔案路徑（顯示相對路徑）
 */
function formatFilePath(filePath: string): string {
  const cwd = process.cwd();
  const relativePath = path.relative(cwd, filePath);
  return relativePath.startsWith('..') ? filePath : relativePath;
}

/**
 * 處理文字搜尋命令
 */
async function handleTextSearchCommand(
  options: SearchOptions,
  context: CommandContext,
  format: OutputFormat,
  outputHandler: ReturnType<typeof createUnifiedOutputHandler>
): Promise<void> {
  const query = options.query;

  if (!query) {
    const errorResult: SearchResult = {
      command: QueryCommand.Search,
      success: false,
      results: [],
      summary: { totalScanned: 0, issuesFound: 0 },
      errors: ['文字搜尋需要指定 --query 參數']
    };
    outputHandler.outputQuery(errorResult, format);
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  await handleSearchCommand(query, options, context, format, outputHandler);
}

/**
 * 處理結構化搜尋命令
 */
async function handleStructuralSearchCommand(
  options: SearchOptions,
  context: CommandContext,
  format: OutputFormat,
  outputHandler: ReturnType<typeof createUnifiedOutputHandler>
): Promise<void> {
  const pattern = options.pattern;
  const type = options.type;

  if (!type) {
    const errorResult: SearchResult = {
      command: QueryCommand.Search,
      success: false,
      results: [],
      summary: { totalScanned: 0, issuesFound: 0 },
      errors: ['結構化搜尋需要指定 --type 參數']
    };
    outputHandler.outputQuery(errorResult, format);
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  if (format !== OutputFormat.Json) {
    console.log(`🔍 結構化搜尋: ${type}${pattern ? ` (pattern: ${pattern})` : ''}`);
  }

  try {
    const searchPath = path.resolve(options.path || process.cwd());

    // 初始化索引引擎
    const config = createIndexConfig(searchPath, {
      includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.swift'],
      excludePatterns: ['node_modules/**', '*.test.*', 'dist/**']
    });
    const indexEngine = new IndexEngine(config, context.fileSystem);

    // 建立索引
    if (format !== OutputFormat.Json) {
      console.log('   正在建立索引...');
    }
    await indexEngine.indexProject(searchPath);

    // 獲取所有符號
    const allSymbols = await indexEngine.getAllSymbols();

    // 過濾符號
    let filteredSymbols = allSymbols.filter(symbolResult => {
      const symbol = symbolResult.symbol;

      // 過濾檔案模式
      if (options.filePattern) {
        const regex = new RegExp(options.filePattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
        if (!regex.test(symbol.location.filePath)) { return false; }
      }

      // 過濾符號類型
      if (type && symbol.type !== type) { return false; }

      // 過濾符號名稱模式
      if (pattern) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
        if (!regex.test(symbol.name)) { return false; }
      }

      // 過濾屬性
      if (options.withAttribute) {
        if (!(symbol as any).attributes?.includes(options.withAttribute)) { return false; }
      }

      // 過濾修飾符
      if (options.withModifier) {
        if (!(symbol as any).modifiers?.includes(options.withModifier)) { return false; }
      }

      // 過濾實作的協定
      if (options.implements) {
        if (!(symbol as any).implements?.includes(options.implements)) { return false; }
      }

      // 過濾繼承的類別
      if (options.extends && (symbol as any).superclass !== options.extends) { return false; }

      return true;
    });

    // 應用 limit
    const limit = options.limit ? parseInt(options.limit) : 50;
    const truncated = filteredSymbols.length > limit;
    if (truncated) {
      filteredSymbols = filteredSymbols.slice(0, limit);
    }

    // 轉換為 SearchMatch
    const matches: SearchMatch[] = filteredSymbols.map(r => ({
      filePath: formatFilePath(r.symbol.location.filePath),
      line: r.symbol.location.range.start.line,
      column: r.symbol.location.range.start.column,
      content: `${r.symbol.type}: ${r.symbol.name}`
    }));

    const result: SearchResult = {
      command: QueryCommand.Search,
      success: true,
      results: matches,
      truncated,
      summary: {
        totalScanned: allSymbols.length,
        issuesFound: matches.length
      }
    };

    outputHandler.outputQuery(result, format);
  } catch (error) {
    handleError(error, format);
  }
}

/**
 * 處理符號搜尋命令
 */
async function handleSymbolSearchCommand(
  options: SearchOptions,
  context: CommandContext,
  format: OutputFormat,
  outputHandler: ReturnType<typeof createUnifiedOutputHandler>
): Promise<void> {
  const symbolName = options.query;

  if (!symbolName) {
    const errorResult: SearchResult = {
      command: QueryCommand.Search,
      success: false,
      results: [],
      summary: { totalScanned: 0, issuesFound: 0 },
      errors: ['符號搜尋需要指定 --query 參數']
    };
    outputHandler.outputQuery(errorResult, format);
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  if (format !== OutputFormat.Json) {
    console.log(`🔍 搜尋符號: "${symbolName}"`);
  }

  try {
    const searchPath = path.resolve(options.path || process.cwd());

    // 初始化索引引擎
    const config = createIndexConfig(searchPath, {
      includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.swift'],
      excludePatterns: ['node_modules/**', '*.test.*', 'dist/**']
    });
    const indexEngine = new IndexEngine(config, context.fileSystem);

    // 建立索引
    if (format !== OutputFormat.Json) {
      console.log('   正在建立索引...');
    }
    await indexEngine.indexProject(searchPath);

    // 搜尋符號
    let results: Array<{ symbol: { name: string; type: string; location: { filePath: string; range: { start: { line: number; column: number } } } } }>;
    if (symbolName.includes('*') || symbolName.includes('?')) {
      const allSymbols = await indexEngine.getAllSymbols();
      const pattern = symbolName.replace(/\*/g, '.*').replace(/\?/g, '.');
      const regex = new RegExp(`^${pattern}$`);
      results = allSymbols.filter(r => regex.test(r.symbol.name));
    } else {
      results = await indexEngine.findSymbol(symbolName);
    }

    // 應用 limit
    const limit = options.limit ? parseInt(options.limit) : 50;
    const truncated = results.length > limit;
    if (truncated) {
      results = results.slice(0, limit);
    }

    // 轉換為 SearchMatch
    const matches: SearchMatch[] = results.map(r => ({
      filePath: formatFilePath(r.symbol.location.filePath),
      line: r.symbol.location.range.start.line,
      column: r.symbol.location.range.start.column,
      content: `${r.symbol.type}: ${r.symbol.name}`
    }));

    const result: SearchResult = {
      command: QueryCommand.Search,
      success: true,
      results: matches,
      truncated,
      summary: {
        totalScanned: results.length,
        issuesFound: matches.length
      }
    };

    outputHandler.outputQuery(result, format);
  } catch (error) {
    handleError(error, format);
  }
}

/**
 * 處理錯誤
 */
function handleError(error: unknown, format: OutputFormat): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (format === OutputFormat.Json) {
    console.error(JSON.stringify({ error: errorMessage }));
  } else {
    console.error('\n❌ 搜尋失敗:', errorMessage);
  }

  process.exitCode = 1;
  if (process.env.NODE_ENV !== 'test') { process.exit(1); }
}
