/**
 * find-references 命令
 * 語義級引用搜尋，精確找出符號的定義和所有引用位置
 */

import type { Command } from 'commander';
import { CLI_INDEX_DEFAULTS } from '@core/foundations/indexing/index.js';
import {
  createSymbolFinder,
  SymbolReferenceType,
  symbolToKey,
  serializeSymbolKey,
  type SymbolReference
} from '@core/foundations/symbol-finder/index.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import {
  QueryCommand,
  type FindReferencesResult,
  type ReferenceItem,
  type ReferenceType,
  type DefinitionLocation
} from '@infrastructure/formatters/index.js';
import {
  createUnifiedOutputHandler,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';
import { ensureDirectoryPath, tryParseOutputFormat } from '@interfaces/cli/command-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { getErrorMessage } from '@shared/errors/index.js';
import { createAndIndexWithCache } from '@interfaces/cli/cached-index-engine.js';

/** find-references 命令選項 */
interface FindReferencesOptions {
  path: string;
  format: string;
}

/**
 * 設定 find-references 命令
 */
export function setupFindReferencesCommand(program: Command, context: CommandContext): void {
  program
    .command('find-references <symbol>')
    .description('查找符號的定義和所有引用')
    .option('-p, --path <path>', '專案路徑', '.')
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .action(async (symbol: string, options: FindReferencesOptions, command: Command) => {
      await handleFindReferencesCommand(symbol, options, context, command);
    });
}

/**
 * 處理 find-references 命令
 */
async function handleFindReferencesCommand(
  symbolName: string,
  options: FindReferencesOptions,
  context: CommandContext,
  command: Command
): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();

  // 解析輸出格式
  const formatResult = tryParseOutputFormat(options.format, false, outputHandler);
  if (!formatResult.success) {return;}
  const format = formatResult.format;

  if (format !== OutputFormat.Json) {
    console.log(`🔍 查找符號引用: ${symbolName}...`);
  }

  const projectPath = options.path || process.cwd();
  const pathIsDirectory = await ensureDirectoryPath(projectPath, context.fileSystem, outputHandler, format);
  if (!pathIsDirectory) {
    return;
  }

  const globalOpts = command.optsWithGlobals() as { cache?: boolean; cacheDir?: string };
  const noCache = globalOpts.cache === false;

  const indexEngine = await createAndIndexWithCache(
    projectPath,
    context.fileSystem,
    CLI_INDEX_DEFAULTS,
    { noCache, cacheDir: globalOpts.cacheDir }
  );

  try {

    // 取得所有已索引檔案路徑
    const indexedFiles = indexEngine.getAllIndexedFiles();
    const filePaths = indexedFiles.map(f => f.filePath);

    // 查找符號定義
    const symbolResults = await indexEngine.findSymbol(symbolName);
    let definition: DefinitionLocation | null = null;
    let definitions: DefinitionLocation[] = [];
    let symbolType = 'unknown';

    if (symbolResults.length > 0) {
      // 收集所有定義位置
      definitions = symbolResults.map(result => ({
        file: result.symbol.location.filePath,
        line: result.symbol.location.range.start.line,
        column: result.symbol.location.range.start.column
      }));

      // 第一個定義（向後相容）
      definition = definitions[0];
      symbolType = symbolResults[0].symbol.type;
    }

    // 建立 SymbolFinder 查找所有引用
    const parserRegistry = ParserRegistry.getInstance();
    const symbolFinder = createSymbolFinder(parserRegistry, context.fileSystem);

    // 收集所有引用（包括所有同名符號的定義）
    let refs: SymbolReference[] = [];

    if (symbolResults.length > 0) {
      // 有找到定義：使用完整 Symbol 資訊查找引用
      const symbols = symbolResults.map(r => r.symbol);
      const refsMap = await symbolFinder.findReferencesMultiple(symbols, filePaths);

      // 合併所有同名符號的引用
      for (const symbol of symbols) {
        const key = serializeSymbolKey(symbolToKey(symbol));
        const symbolRefs = refsMap.get(key) ?? [];
        refs.push(...symbolRefs);
      }
    } else {
      // 無定義：使用作用域感知查找（fallback）
      refs = await symbolFinder.findScopedReferences(symbolName, filePaths);
    }

    // 轉換為輸出格式
    const references: ReferenceItem[] = refs.map(ref => ({
      file: ref.location.filePath,
      line: ref.location.range.start.line,
      column: ref.location.range.start.column,
      type: mapReferenceType(ref.type),
      context: ref.context || ''
    }));

    // 計算影響檔案數
    const filesAffected = new Set(references.map(r => r.file)).size;

    // 組裝結果
    const result: FindReferencesResult = {
      command: QueryCommand.FindReferences,
      success: true,
      symbol: symbolName,
      type: symbolType,
      definition,
      definitions: definitions.length > 1 ? definitions : undefined,
      references,
      summary: {
        totalReferences: references.length,
        filesAffected,
        definitionCount: definitions.length
      }
    };

    outputHandler.outputQuery(result, format);
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    // 區分索引錯誤和查找錯誤
    const isIndexError = errorMessage.includes('索引')
      || errorMessage.includes('index')
      || errorMessage.includes('ENOENT');
    const errorPrefix = isIndexError ? '索引專案失敗' : '查找引用失敗';

    outputHandler.outputError(`${errorPrefix}: ${errorMessage}`, format);
    process.exitCode = 1;
  } finally {
    indexEngine.dispose();
  }
}

/**
 * 映射引用類型
 */
function mapReferenceType(type: SymbolReferenceType): ReferenceType {
  switch (type) {
    case SymbolReferenceType.Definition:
      return 'definition';
    case SymbolReferenceType.Import:
      return 'import';
    case SymbolReferenceType.Export:
      return 'export';
    case SymbolReferenceType.Usage:
    default:
      return 'usage';
  }
}
