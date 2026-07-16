/**
 * find-references 命令
 * 語義級引用搜尋，精確找出符號的定義和所有引用位置
 */

import type { Command } from 'commander';
import * as path from 'path';
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
  type DefinitionLocation,
  type SymbolIdentity
} from '@infrastructure/formatters/index.js';
import {
  createUnifiedOutputHandler,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';
import { ensureDirectoryPath, tryParseOutputFormat } from '@interfaces/cli/command-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { getErrorMessage } from '@shared/errors/index.js';
import { createAndIndexWithCache } from '@interfaces/cli/cached-index-engine.js';
import { resolveSymbolTarget } from '@interfaces/cli/commands/symbol-target-resolver.js';
import {
  filterReferencesToSelectedSymbol,
  findReExportAliasReferences
} from '@interfaces/cli/commands/symbol-reference-filter.js';
import { findDefaultImportAliasReferences } from '@interfaces/cli/commands/default-import-alias-references.js';

/** find-references 命令選項 */
interface FindReferencesOptions {
  path: string;
  format: string;
  at?: string;
}

/**
 * 設定 find-references 命令
 */
export function setupFindReferencesCommand(program: Command, context: CommandContext): void {
  program
    .command('find-references <symbol>')
    .description('查找符號的定義和所有引用')
    .option('-p, --path <path>', '專案路徑', '.')
    .option('-a, --at <location>', '指定符號位置 (file:line:column)，用於區分同名符號')
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

  // 與 rename/impact/move 對齊：相對 --path 一律 resolve 成絕對路徑（F27）
  const projectPath = path.resolve(options.path || process.cwd());
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

    // 取得所有已索引檔案路徑
    const indexedFiles = indexEngine.getAllIndexedFiles();
    const filePaths = indexedFiles.map(f => f.filePath);

    // 查找符號定義
    const symbolResults = await indexEngine.findSymbol(symbolName);
    const targetResult = resolveSymbolTarget(symbolName, symbolResults, projectPath, options.at);
    if (!targetResult.success) {
      outputHandler.outputError(targetResult.error, format);
      process.exitCode = 1;
      return;
    }

    const selectedSymbolResults = targetResult.resolution.selectedResults;
    const symbolIdentities: SymbolIdentity[] = targetResult.resolution.symbols;
    let definition: DefinitionLocation | null = null;
    let definitions: DefinitionLocation[] = [];
    let symbolType = 'unknown';

    if (selectedSymbolResults.length > 0) {
      // 收集所有定義位置
      definitions = selectedSymbolResults.map(result => ({
        file: result.symbol.location.filePath,
        line: result.symbol.location.range.start.line,
        column: result.symbol.location.range.start.column
      }));

      // 第一個定義（向後相容）
      definition = definitions[0];
      symbolType = selectedSymbolResults[0].symbol.type;
    }

    // 建立 SymbolFinder 查找所有引用
    const parserRegistry = ParserRegistry.getInstance();
    const symbolFinder = createSymbolFinder(parserRegistry, context.fileSystem);

    // 收集所有引用（包括所有同名符號的定義）
    let refs: SymbolReference[] = [];

    if (selectedSymbolResults.length > 0) {
      // 有找到定義：使用完整 Symbol 資訊查找引用
      const symbols = selectedSymbolResults.map(r => r.symbol);
      const refsMap = await symbolFinder.findReferencesMultiple(symbols, filePaths);

      // 合併所有同名符號的引用
      for (const symbol of symbols) {
        const key = serializeSymbolKey(symbolToKey(symbol));
        const symbolRefs = refsMap.get(key) ?? [];
        refs.push(...symbolRefs);
      }

      if (options.at && targetResult.resolution.targetSymbol && selectedSymbolResults[0]) {
        refs = await filterReferencesToSelectedSymbol(
          refs,
          selectedSymbolResults[0].symbol,
          projectPath,
          context.fileSystem
        );
      }

      // 補上單層 re-export 別名引用：索引與 SymbolFinder 都以名稱比對，
      // 故 `export { X as Y }` 改名 re-export 後、下游 `import { Y }; Y()` 的引用會漏抓。
      const aliasSourceSymbols = (options.at && targetResult.resolution.targetSymbol && selectedSymbolResults[0])
        ? [selectedSymbolResults[0].symbol]
        : symbols;
      for (const symbol of aliasSourceSymbols) {
        const aliasRefs = await findReExportAliasReferences(
          symbol,
          projectPath,
          context.fileSystem,
          filePaths,
          (filePath, bindingSymbol) => symbolFinder.findReferencesInFileWithSymbol(filePath, bindingSymbol)
        );
        refs.push(...aliasRefs);
      }

      if (options.at && targetResult.resolution.targetSymbol && selectedSymbolResults[0]) {
        // 補上 default import 別名引用：錨定到模組 default export 時，本地名稱可能不同，
        // 名稱搜尋會漏掉 import binding 與其使用點；結果沿用命令末端的統一 dedupe。
        const defaultImportAliasRefs = await findDefaultImportAliasReferences(
          selectedSymbolResults[0].symbol,
          projectPath,
          context.fileSystem,
          filePaths,
          (filePath, bindingSymbol) => symbolFinder.findReferencesInFileWithSymbol(filePath, bindingSymbol)
        );
        refs.push(...defaultImportAliasRefs);
      }
    } else {
      // 無定義：使用作用域感知查找（fallback）
      refs = await symbolFinder.findScopedReferences(symbolName, filePaths);
    }

    const uniqueRefs = dedupeSymbolReferences(refs);

    // 轉換為輸出格式
    const references: ReferenceItem[] = uniqueRefs.map(ref => ({
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
      symbols: symbolIdentities,
      targetSymbol: targetResult.resolution.targetSymbol,
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
    await indexEngine?.disposeAsync();
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

function dedupeSymbolReferences(refs: readonly SymbolReference[]): SymbolReference[] {
  const seen = new Set<string>();
  const uniqueRefs: SymbolReference[] = [];

  for (const ref of refs) {
    const key = [
      ref.location.filePath,
      ref.location.range.start.line,
      ref.location.range.start.column,
      ref.location.range.end.line,
      ref.location.range.end.column,
      ref.type
    ].join(':');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueRefs.push(ref);
  }

  return uniqueRefs;
}
