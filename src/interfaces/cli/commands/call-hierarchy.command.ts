/**
 * call-hierarchy 命令
 * 顯示函數的呼叫者（incoming）和被呼叫者（outgoing）
 */

import type { Command } from 'commander';
import { IndexEngine } from '@core/indexing/index-engine.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import {
  createCallHierarchyAnalyzer,
  type CallHierarchyOptions
} from '@core/shared/call-hierarchy-analyzer.js';
import {
  QueryCommand,
  type CallHierarchyResult,
  type CallHierarchyDirection,
  type IncomingCallItem,
  type OutgoingCallItem
} from '@infrastructure/formatters/index.js';
import {
  createUnifiedOutputHandler,
  parseOutputFormat,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

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
  let format: OutputFormat;

  try {
    format = parseOutputFormat(options.format, false);
  } catch {
    outputHandler.outputError('不支援的輸出格式。可用格式: json, summary', OutputFormat.Summary);
    process.exitCode = 1;
    return;
  }

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

  try {
    const projectPath = options.path || process.cwd();

    // 建立索引引擎並索引專案
    const indexConfig = {
      workspacePath: projectPath,
      includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.swift', '.py'],
      excludePatterns: ['node_modules', 'dist', '.git', 'build', 'coverage'],
      maxFileSize: 1024 * 1024,
      enablePersistence: false,
      persistencePath: undefined,
      maxConcurrency: 4
    };

    const indexEngine = new IndexEngine(indexConfig, context.fileSystem);

    try {
      await indexEngine.indexProject(projectPath);

      const indexedFiles = indexEngine.getAllIndexedFiles();
      const filePaths = indexedFiles.map(f => f.filePath);

      // 使用 IndexEngine 查找函數定義（與 find-references 相同的方式）
      const symbolResults = await indexEngine.findSymbol(functionName);

      // 優先找 function，但也接受其他類型（如 variable 用於 arrow function）
      const functionSymbol = symbolResults.find(r => r.symbol.type === 'function')
        || symbolResults.find(r => r.symbol.type === 'variable')
        || symbolResults[0];

      // 函數找不到的情況
      if (!functionSymbol) {
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

      // 取得函數定義位置
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
        direction,
        depth,
        incoming,
        outgoing,
        summary: {
          incomingCount: incoming.length,
          outgoingCount: outgoing.length,
          uniqueFiles
        }
      };

      outputHandler.outputQuery(result, format);
    } finally {
      indexEngine.dispose();
    }
  } catch (error) {
    handleError(error, format);
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

/**
 * 處理錯誤
 */
function handleError(error: unknown, format: OutputFormat): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (format === OutputFormat.Json) {
    console.error(JSON.stringify({ error: errorMessage }));
  } else {
    console.error('\n❌ 呼叫層次分析失敗:', errorMessage);
  }

  process.exitCode = 1;
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}
