/**
 * call-hierarchy 命令
 * 顯示函數的呼叫者（incoming）和被呼叫者（outgoing）
 */

import type { Command } from 'commander';
import { IndexEngine, createIndexConfig, CLI_INDEX_DEFAULTS } from '@core/foundations/indexing/index.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import {
  createCallHierarchyAnalyzer,
  type CallHierarchyOptions
} from '@core/call-hierarchy/index.js';
import {
  QueryCommand,
  type CallHierarchyResult,
  type CallHierarchyDirection,
  type IncomingCallItem,
  type OutgoingCallItem,
  type FunctionDefinitionInfo
} from '@infrastructure/formatters/index.js';
import {
  createUnifiedOutputHandler,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';
import { tryParseOutputFormat } from '@interfaces/cli/command-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { getErrorMessage } from '@shared/errors/index.js';

/** call-hierarchy 命令選項 */
interface CallHierarchyCommandOptions {
  path: string;
  direction: string;
  depth: string;
  format: string;
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
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .action(async (functionName: string, options: CallHierarchyCommandOptions) => {
      await handleCallHierarchyCommand(functionName, options, context);
    });
}

/**
 * 處理 call-hierarchy 命令
 */
async function handleCallHierarchyCommand(
  functionName: string,
  options: CallHierarchyCommandOptions,
  context: CommandContext
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
  const depth = parseInt(options.depth, 10);
  if (isNaN(depth) || depth < 1 || depth > 10) {
    outputHandler.outputError('depth 必須在 1-10 之間', format);
    process.exitCode = 1;
    return;
  }

  if (format !== OutputFormat.Json) {
    console.log(`📞 分析呼叫層次: ${functionName}...`);
  }

  const projectPath = options.path || process.cwd();

  // 建立索引引擎
  const indexConfig = createIndexConfig(projectPath, CLI_INDEX_DEFAULTS);

  const indexEngine = new IndexEngine(indexConfig, context.fileSystem);

  try {
    await indexEngine.indexProject(projectPath);

    const indexedFiles = indexEngine.getAllIndexedFiles();
    const filePaths = indexedFiles.map(f => f.filePath);

    // 使用 IndexEngine 查找函數定義（與 find-references 相同的方式）
    const symbolResults = await indexEngine.findSymbol(functionName);

    // 過濾出函數類型的符號（function 或 variable 用於 arrow function）
    const functionSymbols = symbolResults.filter(
      r => r.symbol.type === 'function' || r.symbol.type === 'variable'
    );

    // 優先選取 function 類型（排除 import specifier 等 variable 型別），
    // 若無 function 類型則以 variable 為後備（arrow function 場景）
    const purelyFunctionSymbols = functionSymbols.filter(r => r.symbol.type === 'function');
    const preferredSymbols = purelyFunctionSymbols.length > 0 ? purelyFunctionSymbols : functionSymbols;

    // 若無函數類型，回退到所有結果
    const matchedSymbols = preferredSymbols.length > 0 ? preferredSymbols : symbolResults;

    // 函數找不到的情況
    if (matchedSymbols.length === 0) {
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
        errors: [`找不到函數 "${functionName}"`]
      };
      outputHandler.outputQuery(errorResult, format);
      process.exitCode = 1;
      return;
    }

    // 收集所有定義位置（用於多定義場景）
    const allDefinitions: FunctionDefinitionInfo[] = matchedSymbols.map(sym => ({
      file: sym.symbol.location.filePath,
      line: sym.symbol.location.range.start.line,
      className: sym.symbol.scope?.name
    }));

    // 使用第一個定義進行分析（向後相容）
    const functionSymbol = matchedSymbols[0];
    const definitionFile = functionSymbol.symbol.location.filePath;
    const definitionLine = functionSymbol.symbol.location.range.start.line;
    const definitionRange = functionSymbol.symbol.location.range;

    // 建立分析器並執行分析
    const parserRegistry = ParserRegistry.getInstance();
    const analyzer = createCallHierarchyAnalyzer(parserRegistry, context.fileSystem);

    const analysisOptions: CallHierarchyOptions = {
      direction,
      depth
    };

    const analysisResult = await analyzer.analyzeWithDefinition(
      functionName,
      definitionFile,
      definitionRange,
      filePaths,
      analysisOptions
    );

    // 轉換為輸出格式
    const incoming: IncomingCallItem[] = analysisResult.incoming.map(call => ({
      caller: call.caller,
      file: call.location.filePath,
      line: call.location.range.start.line,
      column: call.location.range.start.column,
      context: call.context
    }));

    const outgoing: OutgoingCallItem[] = analysisResult.outgoing.map(call => ({
      callee: call.callee,
      file: call.location.filePath,
      line: call.location.range.start.line,
      column: call.location.range.start.column,
      context: call.context
    }));

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
    indexEngine.dispose();
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

