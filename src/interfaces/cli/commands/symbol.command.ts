/**
 * Symbol 命令
 * 符號搜尋（從 search symbol 攤平而來）
 */

import type { Command } from 'commander';
import * as path from 'path';
import { IndexEngine } from '@core/indexing/index-engine.js';
import { createIndexConfig } from '@core/indexing/types.js';
import { QueryCommand, type SearchResult, type SearchMatch } from '@infrastructure/formatters/index.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

/** Symbol 命令選項 */
interface SymbolOptions {
  query: string;
  path: string;
  limit: string;
  format: string;
}

/**
 * 設定 symbol 命令
 */
export function setupSymbolCommand(program: Command, context: CommandContext): void {
  program
    .command('symbol')
    .description('符號搜尋')
    .requiredOption('-q, --query <name>', '搜尋查詢字串')
    .option('-p, --path <path>', '搜尋路徑', '.')
    .option('-l, --limit <num>', '結果數量限制', '50')
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .action(async (options: SymbolOptions) => {
      await handleSymbolCommand(options, context);
    });
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
 * 處理 symbol 命令
 */
async function handleSymbolCommand(
  options: SymbolOptions,
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

  const symbolName = options.query;

  if (format !== OutputFormat.Json) {
    console.log(`🔍 搜尋符號: "${symbolName}"`);
  }

  try {
    const searchPath = path.resolve(options.path || process.cwd());

    // 初始化索引引擎
    const config = createIndexConfig(searchPath, {
      includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.swift', '.py'],
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
