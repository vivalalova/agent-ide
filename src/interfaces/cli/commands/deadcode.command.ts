/**
 * deadcode 命令
 * 檢測未使用的程式碼
 */

import type { Command } from 'commander';
import { IndexEngine, createIndexConfig, CLI_INDEX_DEFAULTS } from '@core/indexing/index.js';
import { createDeadCodeDetector } from '@core/dead-code/index.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import {
  QueryCommand,
  AnalyzeType,
  type DeadCodeResult,
  type DeadCodeResultItem
} from '@infrastructure/formatters/index.js';
import {
  createUnifiedOutputHandler,
  parseOutputFormat,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

/** deadcode 命令選項 */
interface DeadCodeOptions {
  path: string;
  format: string;
  includeExports: boolean;
}

/**
 * 設定 deadcode 命令
 */
export function setupDeadCodeCommand(program: Command, context: CommandContext): void {
  program
    .command('deadcode')
    .description('檢測未使用的程式碼（dead code）')
    .option('-p, --path <path>', '專案路徑', '.')
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .option('--include-exports', '包含 export 的符號（預設排除）', false)
    .action(async (options: DeadCodeOptions) => {
      await handleDeadCodeCommand(options, context);
    });
}

/**
 * 處理 deadcode 命令
 */
async function handleDeadCodeCommand(
  options: DeadCodeOptions,
  context: CommandContext
): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();
  let format: OutputFormat;

  try {
    format = parseOutputFormat(options.format, false);
  } catch {
    outputHandler.outputError('不支援的輸出格式。可用格式: json, summary', OutputFormat.Summary);
    process.exitCode = 1;
    throw new Error('不支援的輸出格式');
  }

  if (format !== OutputFormat.Json) {
    console.log('🔍 檢測 Dead Code...');
  }

  const projectPath = options.path || process.cwd();

  // 檢查路徑是否存在
  const exists = await context.fileSystem.exists(projectPath);
  if (!exists) {
    outputHandler.outputError(`路徑不存在: ${projectPath}`, format);
    process.exitCode = 1;
    throw new Error(`路徑不存在: ${projectPath}`);
  }

  // 建立索引引擎
  const indexConfig = createIndexConfig(projectPath, CLI_INDEX_DEFAULTS);
  const indexEngine = new IndexEngine(indexConfig, context.fileSystem);

  try {
    // 索引專案
    await indexEngine.indexProject(projectPath);

    // 建立 Dead Code 檢測器
    const parserRegistry = ParserRegistry.getInstance();
    const detector = createDeadCodeDetector(
      indexEngine,
      parserRegistry,
      context.fileSystem,
      {
        includeExports: options.includeExports
      }
    );

    // 執行檢測
    const detectionResult = await detector.detect();

    if (!detectionResult.success) {
      outputHandler.outputError(`檢測失敗: ${detectionResult.error}`, format);
      process.exitCode = 1;
      return;
    }

    // 轉換為輸出格式
    const items: DeadCodeResultItem[] = detectionResult.items.map(item => ({
      name: item.name,
      type: item.type,
      file: item.location.filePath,
      line: item.location.range.start.line,
      column: item.location.range.start.column,
      confidence: item.confidence,
      reason: item.reason
    }));

    // 組裝結果
    const result: DeadCodeResult = {
      command: QueryCommand.Analyze,
      analyzeType: AnalyzeType.DeadCode,
      success: true,
      items,
      byType: detectionResult.stats.byType,
      filesAffected: detectionResult.stats.filesAffected,
      scanTime: detectionResult.stats.scanTime,
      summary: {
        totalScanned: detectionResult.stats.totalSymbols,
        issuesFound: detectionResult.stats.deadCodeCount
      }
    };

    outputHandler.outputQuery(result, format);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputHandler.outputError(`檢測失敗: ${errorMessage}`, format);
    process.exitCode = 1;
  } finally {
    indexEngine.dispose();
  }
}
