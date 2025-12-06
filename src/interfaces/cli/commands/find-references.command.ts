/**
 * find-references 命令
 * 語義級引用搜尋，精確找出符號的定義和所有引用位置
 */

import type { Command } from 'commander';
import { IndexEngine, createIndexConfig, CLI_INDEX_DEFAULTS } from '@core/indexing/index.js';
import { createSymbolFinder, SymbolReferenceType } from '@core/shared/symbol-finder.js';
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
  parseOutputFormat,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

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
    .action(async (symbol: string, options: FindReferencesOptions) => {
      await handleFindReferencesCommand(symbol, options, context);
    });
}

/**
 * 處理 find-references 命令
 */
async function handleFindReferencesCommand(
  symbolName: string,
  options: FindReferencesOptions,
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

  if (format !== OutputFormat.Json) {
    console.log(`🔍 查找符號引用: ${symbolName}...`);
  }

  const projectPath = options.path || process.cwd();

  // 建立索引引擎
  const indexConfig = createIndexConfig(projectPath, CLI_INDEX_DEFAULTS);

  const indexEngine = new IndexEngine(indexConfig, context.fileSystem);

  try {
    // 索引專案
    await indexEngine.indexProject(projectPath);

    // 取得所有已索引檔案路徑
    const indexedFiles = indexEngine.getAllIndexedFiles();
    const filePaths = indexedFiles.map(f => f.filePath);

    // 查找符號定義
    const symbolResults = await indexEngine.findSymbol(symbolName);
    let definition: DefinitionLocation | null = null;
    let symbolType = 'unknown';

    if (symbolResults.length > 0) {
      const firstResult = symbolResults[0];
      definition = {
        file: firstResult.symbol.location.filePath,
        line: firstResult.symbol.location.range.start.line,
        column: firstResult.symbol.location.range.start.column
      };
      symbolType = firstResult.symbol.type;
    }

    // 建立 SymbolFinder 查找所有引用
    const parserRegistry = ParserRegistry.getInstance();
    const symbolFinder = createSymbolFinder(parserRegistry, context.fileSystem);
    const refs = await symbolFinder.findReferences(symbolName, filePaths);

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
      references,
      summary: {
        totalReferences: references.length,
        filesAffected
      }
    };

    outputHandler.outputQuery(result, format);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

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

