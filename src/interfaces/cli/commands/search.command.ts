/**
 * search 命令
 * 在專案中搜尋符號，支援模糊匹配和型別過濾
 */

import type { Command } from 'commander';
import { CLI_INDEX_DEFAULTS, createSearchOptions } from '@core/foundations/indexing/index.js';
import { createAndIndexWithCache } from '@interfaces/cli/cached-index-engine.js';
import {
  QueryCommand,
  type SearchResult,
  type SearchMatch
} from '@infrastructure/formatters/index.js';
import {
  createUnifiedOutputHandler,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';
import { ensureDirectoryPath, tryParseOutputFormat, parseStrictInt } from '@interfaces/cli/command-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { getErrorMessage } from '@shared/errors/index.js';
import { SymbolType } from '@shared/types/index.js';

/** search 命令選項 */
interface SearchOptions {
  path: string;
  format: string;
  fuzzy: boolean;
  maxResults: number;
  type?: string;
}

const VALID_SYMBOL_TYPES = new Set<string>(Object.values(SymbolType));

/**
 * 設定 search 命令
 */
export function setupSearchCommand(program: Command, context: CommandContext): void {
  program
    .command('search <symbol>')
    .description('在專案中搜尋符號（支援模糊匹配）')
    .option('-p, --path <path>', '專案路徑', '.')
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .option('--no-fuzzy', '使用精確匹配（預設為模糊匹配）')
    .option('--max-results <n>', '最大結果數', '100')
    .option('--type <type>', '過濾符號類型 (class|function|interface|variable|constant|type|enum)')
    .action(async (symbol: string, options: SearchOptions, command: Command) => {
      await handleSearchCommand(symbol, options, context, command);
    });
}

/**
 * 處理 search 命令
 */
async function handleSearchCommand(
  symbolName: string,
  options: SearchOptions,
  context: CommandContext,
  command: Command
): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();

  const formatResult = tryParseOutputFormat(options.format, false, outputHandler);
  if (!formatResult.success) {return;}
  const format = formatResult.format;

  if (format !== OutputFormat.Json) {
    process.stderr.write(`🔍 搜尋符號: ${symbolName}...\n`);
  }

  // 驗證 --type 參數
  if (options.type !== undefined && !VALID_SYMBOL_TYPES.has(options.type)) {
    outputHandler.outputError(`無效的符號類型: ${options.type}。可用類型: ${[...VALID_SYMBOL_TYPES].join('|')}`, format);
    process.exitCode = 1;
    return;
  }

  const parsedMax = parseStrictInt(String(options.maxResults));
  if (parsedMax === null || parsedMax <= 0) {
    outputHandler.outputError(`--max-results 須為正整數，收到: ${options.maxResults}`, format);
    process.exitCode = 1;
    return;
  }
  const maxResults = parsedMax;

  const projectPath = options.path;
  const pathIsDirectory = await ensureDirectoryPath(projectPath, context.fileSystem, outputHandler, format);
  if (!pathIsDirectory) {
    return;
  }

  const globalOpts = command.optsWithGlobals() as { cache?: boolean; cacheDir?: string };
  const noCache = globalOpts.cache === false;

  let indexEngine: Awaited<ReturnType<typeof createAndIndexWithCache>> | undefined;

  try {
    indexEngine = await createAndIndexWithCache(
      projectPath,
      context.fileSystem,
      CLI_INDEX_DEFAULTS,
      { noCache, cacheDir: globalOpts.cacheDir }
    );

    const startTime = Date.now();

    const fetchOpts = createSearchOptions({
      fuzzy: options.fuzzy,
      maxResults: maxResults + 1,
      caseSensitive: false,
      includeFileInfo: true,
      ...(options.type ? { symbolTypes: [options.type as SymbolType] } : {}),
    });

    // 使用 searchSymbols（fuzzy）或 findSymbol（exact）
    const symbolResults = options.fuzzy
      ? await indexEngine.searchSymbols(symbolName, fetchOpts)
      : await indexEngine.findSymbol(symbolName, fetchOpts);

    const searchTime = Date.now() - startTime;

    const truncated = symbolResults.length > maxResults;
    const limitedResults = truncated ? symbolResults.slice(0, maxResults) : symbolResults;

    // 映射為 SearchMatch
    const matches: SearchMatch[] = limitedResults.map(sr => {
      const sym = sr.symbol;
      return {
        filePath: sym.location.filePath,
        line: sym.location.range.start.line,
        column: sym.location.range.start.column,
        content: `[${sym.type}] ${sym.name}`,
      };
    });

    const result: SearchResult = {
      command: QueryCommand.Search,
      success: true,
      results: matches,
      truncated,
      searchTime,
      summary: {
        matchCount: matches.length,
      },
    };

    outputHandler.outputQuery(result, format);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    outputHandler.outputError(`搜尋符號失敗: ${errorMessage}`, format);
    process.exitCode = 1;
  } finally {
    await indexEngine?.disposeAsync();
  }
}
