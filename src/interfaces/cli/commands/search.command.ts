/**
 * Search 命令
 * 搜尋程式碼
 */

import type { Command } from 'commander';
import * as path from 'path';
import { IndexEngine } from '../../../core/indexing/index-engine.js';
import { SearchService } from '../../../core/search/service.js';
import { createIndexConfig } from '../../../core/indexing/types.js';
import type { CommandContext } from './types.js';

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
    .option('--format <format>', '輸出格式 (list|json|minimal|summary)', 'list')
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
  // 檢查空字串或未提供
  if (!queryOrSubcommand || queryOrSubcommand.trim() === '') {
    console.error('   請提供搜尋查詢或子命令');
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
      await handleSymbolSearchCommand(options, context);
    } else if (queryOrSubcommand === 'text') {
      await handleTextSearchCommand(options, context);
    } else if (queryOrSubcommand === 'structural') {
      await handleStructuralSearchCommand(options, context);
    }
  } else {
    // 簡化語法：直接使用查詢字串
    await handleSearchCommand(queryOrSubcommand, options, context);
  }
}

/**
 * 處理搜尋命令
 */
async function handleSearchCommand(
  query: string,
  options: SearchOptions,
  context: CommandContext
): Promise<void> {
  const isMinimalOrJson = options.format === 'minimal' || options.format === 'json';

  if (!isMinimalOrJson) {
    console.log(`   搜尋: "${query}"`);
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
    const result = await searchService.searchText(searchQuery);
    const searchTime = Date.now() - startTime;

    // 顯示結果
    if (result.matches.length === 0) {
      if (!isMinimalOrJson) {
        console.log('   沒有找到匹配結果');
      } else if (options.format === 'json') {
        console.log(JSON.stringify({ results: [] }, null, 2));
      }
      return;
    }

    if (!isMinimalOrJson) {
      console.log(`   找到 ${result.matches.length} 個結果 (${searchTime}ms)`);

      if (result.truncated) {
        console.log(`   結果已截斷，顯示前 ${options.limit} 個結果`);
      }
    }

    // 格式化輸出
    formatSearchResults(result, options);

  } catch (error) {
    if (isMinimalOrJson) {
      if (options.format === 'json') {
        console.log(JSON.stringify({ matches: [], error: error instanceof Error ? error.message : String(error) }));
      } else {
        console.error(`Error: ${error instanceof Error ? error.message : error}`);
      }
    } else {
      console.error('   搜尋失敗:', error instanceof Error ? error.message : error);
    }
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
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
 * 格式化搜尋結果輸出
 */
function formatSearchResults(result: any, options: SearchOptions): void {
  switch (options.format) {
  case 'json':
    // 測試期望的格式是 { results: [...] } 而不是 { matches: [...] }
    const resultsWithRelativePaths = result.matches.map((match: any) => {
      const formatted: any = {
        ...match,
        filePath: formatFilePath(match.file)
      };

      delete formatted.file;

      if (match.context) {
        formatted.contextBefore = match.context.before || [];
        formatted.contextAfter = match.context.after || [];
      }

      return formatted;
    });
    console.log(JSON.stringify({ results: resultsWithRelativePaths }, null, 2));
    break;

  case 'minimal':
    result.matches.forEach((match: any) => {
      console.log(`${match.file}:${match.line}:${match.column}:${match.content.trim()}`);
    });
    break;

  case 'list':
  default:
    result.matches.forEach((match: any, index: number) => {
      console.log(`\n${index + 1}. ${formatFilePath(match.file)}:${match.line}:${match.column}`);
      console.log(`   ${highlightMatch(match.content, options.query)}`);

      if (parseInt(options.context) > 0 && match.context) {
        if (match.context.before.length > 0) {
          match.context.before.forEach((line: string, i: number) => {
            const lineNum = match.line - match.context.before.length + i;
            console.log(`   ${lineNum.toString().padStart(3, ' ')}: ${line}`);
          });
        }

        console.log(`>> ${match.line.toString().padStart(3, ' ')}: ${highlightMatch(match.content, options.query)}`);

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
function formatFilePath(filePath: string): string {
  const cwd = process.cwd();
  const relativePath = path.relative(cwd, filePath);
  return relativePath.startsWith('..') ? filePath : relativePath;
}

/**
 * 高亮匹配內容
 */
function highlightMatch(text: string, query: string | undefined): string {
  if (!text || !query) { return text; }

  try {
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return text.replace(regex, `[${query}]`);
  } catch {
    return text;
  }
}

/**
 * 處理文字搜尋命令
 */
async function handleTextSearchCommand(options: SearchOptions, context: CommandContext): Promise<void> {
  const query = options.query;

  if (!query) {
    console.error('   文字搜尋需要指定 --query 參數');
    console.error('   使用方式: agent-ide search text --query <text>');
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  await handleSearchCommand(query, options, context);
}

/**
 * 處理結構化搜尋命令
 */
async function handleStructuralSearchCommand(options: SearchOptions, context: CommandContext): Promise<void> {
  const pattern = options.pattern;
  const type = options.type;

  if (!type) {
    console.error('   結構化搜尋需要指定 --type 參數');
    console.error('   使用方式: agent-ide search structural --type <class|protocol|function|...> [--pattern <pattern>]');
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  const isMinimalOrJson = options.format === 'minimal' || options.format === 'json';

  if (!isMinimalOrJson) {
    console.log(`   結構化搜尋: ${type}${pattern ? ` (pattern: ${pattern})` : ''}`);
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
    if (!isMinimalOrJson) {
      console.log('   正在建立索引...');
    }
    await indexEngine.indexProject(searchPath);

    // 獲取所有符號
    const allSymbols = await indexEngine.getAllSymbols();

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
        console.log('   沒有找到符合條件的符號');
      }
      return;
    }

    if (!isMinimalOrJson && options.format !== 'summary') {
      console.log(`   找到 ${filteredSymbols.length} 個符號`);
    }

    // 格式化輸出
    formatSymbolSearchResults(filteredSymbols, options);

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
      console.error('   結構化搜尋失敗:', error instanceof Error ? error.message : error);
    }
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}

/**
 * 處理符號搜尋命令
 */
async function handleSymbolSearchCommand(options: SearchOptions, context: CommandContext): Promise<void> {
  const symbolName = options.query;

  if (!symbolName) {
    console.error('   符號搜尋需要指定 --query 參數');
    console.error('   使用方式: agent-ide search symbol --query <name>');
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  const isMinimalOrJson = options.format === 'minimal' || options.format === 'json';

  if (!isMinimalOrJson) {
    console.log(`   搜尋符號: "${symbolName}"`);
  }

  try {
    const searchPath = path.resolve(options.path || process.cwd());

    // 初始化索引引擎（每次都重新建立以確保索引是最新的）
    const config = createIndexConfig(searchPath, {
      includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.swift'],
      excludePatterns: ['node_modules/**', '*.test.*', 'dist/**']
    });
    const indexEngine = new IndexEngine(config, context.fileSystem);

    // 建立索引
    if (!isMinimalOrJson) {
      console.log('   正在建立索引...');
    }
    await indexEngine.indexProject(searchPath);

    // 搜尋符號：如果包含 wildcard，使用模式搜尋
    let results: any[];
    if (symbolName.includes('*') || symbolName.includes('?')) {
      // Wildcard 模式搜尋
      const allSymbols = await indexEngine.getAllSymbols();
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
      results = await indexEngine.findSymbol(symbolName);
    }

    if (results.length === 0) {
      if (options.format === 'json') {
        console.log(JSON.stringify({ results: [] }, null, 2));
      } else if (!isMinimalOrJson) {
        console.log(`   找不到符號 "${symbolName}"`);
      }
      return;
    }

    if (!isMinimalOrJson) {
      console.log(`   找到 ${results.length} 個符號`);
    }

    // 格式化輸出
    formatSymbolSearchResults(results, options);

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
      console.error('   符號搜尋失敗:', error instanceof Error ? error.message : error);
    }
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}

/**
 * 格式化符號搜尋結果輸出
 */
function formatSymbolSearchResults(results: any[], options: SearchOptions): void {
  switch (options.format) {
  case 'json':
    const formattedResults = results.map(result => {
      const formatted: any = {
        name: result.symbol.name,
        type: result.symbol.type,
        filePath: formatFilePath(result.symbol.location.filePath),
        line: result.symbol.location.range.start.line,
        column: result.symbol.location.range.start.column
      };

      if ((result.symbol as any).attributes && (result.symbol as any).attributes.length > 0) {
        formatted.attributes = (result.symbol as any).attributes;
      }
      if ((result.symbol as any).modifiers && (result.symbol as any).modifiers.length > 0) {
        formatted.modifiers = (result.symbol as any).modifiers;
      }
      if ((result.symbol as any).superclass) {
        formatted.superclass = (result.symbol as any).superclass;
      }
      if ((result.symbol as any).implements && (result.symbol as any).implements.length > 0) {
        formatted.implements = (result.symbol as any).implements;
      }

      return formatted;
    });
    console.log(JSON.stringify({ results: formattedResults }, null, 2));
    break;

  case 'minimal':
    results.forEach(result => {
      const symbol = result.symbol;
      console.log(
        `${symbol.location.filePath}:${symbol.location.range.start.line}:${symbol.location.range.start.column}:${symbol.type}:${symbol.name}`
      );
    });
    break;

  case 'list':
  default:
    results.forEach((result, index) => {
      const symbol = result.symbol;
      console.log(`\n${index + 1}. ${symbol.name} (${symbol.type})`);
      console.log(`   ${formatFilePath(symbol.location.filePath)}:${symbol.location.range.start.line}:${symbol.location.range.start.column}`);

      if ((symbol as any).attributes && (symbol as any).attributes.length > 0) {
        console.log(`   屬性: ${(symbol as any).attributes.join(', ')}`);
      }
      if ((symbol as any).modifiers && (symbol as any).modifiers.length > 0) {
        console.log(`   修飾符: ${(symbol as any).modifiers.join(', ')}`);
      }
    });
    break;
  }
}
