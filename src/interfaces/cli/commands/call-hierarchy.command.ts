/**
 * call-hierarchy 命令
 * 顯示函數的呼叫者（incoming）和被呼叫者（outgoing）
 */

import type { Command } from 'commander';
import * as path from 'path';
import { CLI_INDEX_DEFAULTS } from '@core/foundations/indexing/index.js';
import { createAndIndexWithCache } from '@interfaces/cli/cached-index-engine.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import {
  createCallHierarchyAnalyzer,
  type CallHierarchyData,
  type CallHierarchyOptions
} from '@core/call-hierarchy/index.js';
import {
  QueryCommand,
  type CallHierarchyResult,
  type CallHierarchyDirection,
  type IncomingCallItem,
  type OutgoingCallItem,
  type FunctionDefinitionInfo,
  type SymbolIdentity
} from '@infrastructure/formatters/index.js';
import {
  createUnifiedOutputHandler,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';
import { ensureDirectoryPath, tryParseOutputFormat, parseStrictInt } from '@interfaces/cli/command-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { getErrorMessage } from '@shared/errors/index.js';
import { resolveSymbolTarget } from '@interfaces/cli/commands/symbol-target-resolver.js';
import { createSelectedSymbolLocationFilter } from '@interfaces/cli/commands/symbol-reference-filter.js';
import {
  ParserCapabilityName,
  getUnsupportedParserCapabilityMessage
} from '@interfaces/cli/parser-capability-guard.js';

/** call-hierarchy 命令選項 */
interface CallHierarchyCommandOptions {
  path: string;
  direction: string;
  depth: string;
  format: string;
  at?: string;
}

/**
 * 設定 call-hierarchy 命令
 */
export function setupCallHierarchyCommand(program: Command, context: CommandContext): void {
  program
    .command('call-hierarchy <function>')
    .description('顯示函數的呼叫者（incoming）和被呼叫者（outgoing）')
    .option('-p, --path <path>', '專案路徑', '.')
    .option('-d, --direction <direction>', '分析方向: incoming, outgoing, both', 'both')
    .option('--depth <n>', '遞迴深度（1-10）', '1')
    .option('-a, --at <location>', '指定函數位置 (file:line:column)，用於區分同名函數或方法')
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .action(async (functionName: string, options: CallHierarchyCommandOptions, command: Command) => {
      await handleCallHierarchyCommand(functionName, options, context, command);
    });
}

/**
 * 處理 call-hierarchy 命令
 */
async function handleCallHierarchyCommand(
  functionName: string,
  options: CallHierarchyCommandOptions,
  context: CommandContext,
  command: Command
): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();

  // 解析輸出格式
  const formatResult = tryParseOutputFormat(options.format, false, outputHandler);
  if (!formatResult.success) {return;}
  const format = formatResult.format;

  // 驗證 direction 參數
  const direction = validateDirection(options.direction);
  if (!direction) {
    outputHandler.outputError('無效的 direction 參數。可用值: incoming, outgoing, both', format);
    process.exitCode = 1;
    return;
  }

  // 驗證 depth 參數
  const depth = parseStrictInt(options.depth);
  if (depth === null || depth < 1 || depth > 10) {
    outputHandler.outputError('depth 必須在 1-10 之間', format);
    process.exitCode = 1;
    return;
  }

  if (format !== OutputFormat.Json) {
    console.log(`📞 分析呼叫層次: ${functionName}...`);
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

    const indexedFiles = indexEngine.getAllIndexedFiles();
    const filePaths = indexedFiles.map(f => f.filePath);

    // 使用 IndexEngine 查找函數定義（與 find-references 相同的方式）
    const symbolResults = await indexEngine.findSymbol(functionName);

    // 過濾出可呼叫符號（variable/constant 用於 arrow function）
    const functionSymbols = symbolResults.filter(
      r => r.symbol.type === 'function' || r.symbol.type === 'variable' || r.symbol.type === 'constant'
    );

    // 優先選取 function 類型（排除 import specifier 等 variable 型別），
    // 若無 function 類型則以 variable 為後備（arrow function 場景）
    const purelyFunctionSymbols = functionSymbols.filter(r => r.symbol.type === 'function');
    const preferredSymbols = purelyFunctionSymbols.length > 0 ? purelyFunctionSymbols : functionSymbols;

    // --at 需要看到所有可呼叫候選，避免 function declaration 壓掉同名 arrow function。
    const matchedSymbols = options.at
      ? (functionSymbols.length > 0 ? functionSymbols : symbolResults)
      : (preferredSymbols.length > 0 ? preferredSymbols : symbolResults);

    // 函數找不到的情況
    if (matchedSymbols.length === 0) {
      const errorMessage = `找不到函數 "${functionName}"`;
      const errorResult: CallHierarchyResult = {
        command: QueryCommand.CallHierarchy,
        success: false,
        function: functionName,
        file: '',
        direction,
        depth,
        incoming: [],
        outgoing: [],
        summary: {
          incomingCount: 0,
          outgoingCount: 0,
          uniqueFiles: 0
        },
        error: errorMessage,
        errors: [errorMessage]
      };
      outputHandler.outputQuery(errorResult, format);
      process.exitCode = 1;
      return;
    }

    const targetResult = resolveSymbolTarget(functionName, matchedSymbols, projectPath, options.at);
    if (!targetResult.success) {
      outputHandler.outputError(targetResult.error, format);
      process.exitCode = 1;
      return;
    }

    const selectedSymbols = targetResult.resolution.selectedResults;
    const symbolIdentities: SymbolIdentity[] = targetResult.resolution.symbols;
    const parserRegistry = ParserRegistry.getInstance();

    for (const selectedSymbol of selectedSymbols) {
      const unsupportedCapability = getUnsupportedParserCapabilityMessage(
        selectedSymbol.symbol.location.filePath,
        parserRegistry,
        ParserCapabilityName.CallHierarchy
      );
      if (unsupportedCapability) {
        outputHandler.outputError(unsupportedCapability, format);
        process.exitCode = 1;
        return;
      }
    }

    // 收集所有定義位置（用於多定義場景）
    const allDefinitions: FunctionDefinitionInfo[] = selectedSymbols.map(sym => ({
      file: sym.symbol.location.filePath,
      line: sym.symbol.location.range.start.line,
      className: sym.symbol.scope?.name
    }));

    // 使用第一個定義進行分析（向後相容）
    const functionSymbol = selectedSymbols[0];
    const definitionFile = functionSymbol.symbol.location.filePath;
    const definitionLine = functionSymbol.symbol.location.range.start.line;

    // 建立分析器並執行分析
    const analyzer = createCallHierarchyAnalyzer(parserRegistry, context.fileSystem);

    const selectedSymbol = selectedSymbols[0]?.symbol;
    const targetLocationFilter = options.at && targetResult.resolution.targetSymbol && selectedSymbol
      ? await createSelectedSymbolLocationFilter(selectedSymbol, projectPath, context.fileSystem)
      : undefined;

    const analysisOptions: CallHierarchyOptions = {
      direction,
      depth,
      ...(targetLocationFilter
        ? {
          targetCallSiteFilter: async callSite => await targetLocationFilter({
            file: callSite.location.filePath,
            line: callSite.location.range.start.line,
            column: callSite.location.range.start.column
          })
        }
        : {})
    };

    const analysisResults: CallHierarchyData[] = [];
    for (const matchedSymbol of selectedSymbols) {
      const symbolDefinitionFile = matchedSymbol.symbol.location.filePath;
      const symbolDefinitionRange = matchedSymbol.symbol.location.range;
      analysisResults.push(await analyzer.analyzeWithDefinition(
        functionName,
        symbolDefinitionFile,
        symbolDefinitionRange,
        filePaths,
        analysisOptions
      ));
    }

    // 轉換為輸出格式
    const incoming: IncomingCallItem[] = dedupeIncomingCalls(
      analysisResults.flatMap(result => result.incoming.map(call => ({
        caller: call.caller,
        file: call.location.filePath,
        line: call.location.range.start.line,
        column: call.location.range.start.column,
        context: call.context
      })))
    );

    const outgoing: OutgoingCallItem[] = dedupeOutgoingCalls(
      analysisResults.flatMap(result => result.outgoing.map(call => ({
        callee: call.callee,
        file: call.location.filePath,
        line: call.location.range.start.line,
        column: call.location.range.start.column,
        context: call.context
      })))
    );

    // 計算涉及的檔案數
    const uniqueFiles = new Set([
      ...incoming.map(i => i.file),
      ...outgoing.map(o => o.file)
    ]).size;

    const result: CallHierarchyResult = {
      command: QueryCommand.CallHierarchy,
      success: true,
      function: functionName,
      file: definitionFile,
      definitionLine,
      definitions: allDefinitions.length > 1 ? allDefinitions : undefined,
      symbols: symbolIdentities,
      targetSymbol: targetResult.resolution.targetSymbol,
      direction,
      depth,
      incoming,
      outgoing,
      summary: {
        incomingCount: incoming.length,
        outgoingCount: outgoing.length,
        uniqueFiles,
        definitionCount: allDefinitions.length
      }
    };

    outputHandler.outputQuery(result, format);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    outputHandler.outputError(`呼叫層次分析失敗: ${errorMessage}`, format);
    process.exitCode = 1;
  } finally {
    await indexEngine?.disposeAsync();
  }
}

/**
 * 驗證 direction 參數
 */
function validateDirection(dir: string): CallHierarchyDirection | null {
  const normalized = dir.toLowerCase();
  if (normalized === 'incoming' || normalized === 'outgoing' || normalized === 'both') {
    return normalized as CallHierarchyDirection;
  }
  return null;
}

function dedupeIncomingCalls(calls: readonly IncomingCallItem[]): IncomingCallItem[] {
  const seen = new Set<string>();
  const uniqueCalls: IncomingCallItem[] = [];

  for (const call of calls) {
    const key = `${call.caller}:${call.file}:${call.line}:${call.column ?? ''}:${call.context ?? ''}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueCalls.push(call);
  }

  return uniqueCalls;
}

function dedupeOutgoingCalls(calls: readonly OutgoingCallItem[]): OutgoingCallItem[] {
  const seen = new Set<string>();
  const uniqueCalls: OutgoingCallItem[] = [];

  for (const call of calls) {
    const key = `${call.callee}:${call.file}:${call.line}:${call.column ?? ''}:${call.context ?? ''}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueCalls.push(call);
  }

  return uniqueCalls;
}
