/**
 * Cycles 命令
 * 循環依賴分析（從 deps cycles 攤平而來）
 */

import * as path from 'path';
import type { Command } from 'commander';
import { ImpactAnalyzer } from '@core/impact/index.js';
import { CycleDetector } from '@core/cycles/index.js';
import { QueryCommand, type DepsResult, type CycleInfo } from '@infrastructure/formatters/index.js';
import { createUnifiedOutputHandler, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import { tryParseOutputFormat } from '@interfaces/cli/command-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { getErrorMessage } from '@shared/errors/index.js';

/** Cycles 命令選項 */
interface CyclesOptions {
  path: string;
  format: string;
}

/**
 * 設定 cycles 命令
 */
export function setupCyclesCommand(program: Command, context: CommandContext): void {
  program
    .command('cycles')
    .description('分析循環依賴')
    .option('-p, --path <path>', '分析路徑', '.')
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .action(async (options: CyclesOptions) => {
      await handleCyclesCommand(options, context);
    });
}

/**
 * 處理 cycles 命令
 */
async function handleCyclesCommand(
  options: CyclesOptions,
  context: CommandContext
): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();

  // 解析輸出格式
  const formatResult = tryParseOutputFormat(options.format, false, outputHandler);
  if (!formatResult.success) {return;}
  const format = formatResult.format;

  const analyzePath = path.resolve(options.path || process.cwd());

  // 檢查路徑是否存在（在進度訊息前檢查）
  const pathExists = await context.fileSystem.exists(analyzePath);
  if (!pathExists) {
    outputHandler.outputError(`路徑不存在: ${analyzePath}`, format);
    process.exitCode = 1;
    return;
  }

  if (format !== OutputFormat.Json) {
    console.log('🔄 循環依賴分析...');
  }

  try {
    // 初始化影響分析器
    const impactAnalyzer = new ImpactAnalyzer(context.fileSystem);

    // 分析專案依賴
    await impactAnalyzer.analyzeProject(analyzePath);

    // 獲取統計資訊
    const stats = impactAnalyzer.getStats();

    // 取得 runtime-only 依賴圖（排除 type-only imports）
    const graph = impactAnalyzer.getRuntimeGraph();

    // 使用 CycleDetector 檢測循環依賴
    const cycleDetector = new CycleDetector();
    const cycles = cycleDetector.detectCycles(graph);

    // 轉換 cycles 為 CycleInfo
    const cycleInfos: CycleInfo[] = cycles.map(c => ({
      cycle: [...c.cycle],
      length: c.length
    }));

    const result: DepsResult = {
      command: QueryCommand.Deps,
      success: true,
      cycles: cycleInfos,
      summary: {
        totalScanned: stats.totalFiles,
        issuesFound: cycles.length,
        totalFiles: stats.totalFiles,
        totalDependencies: stats.totalDependencies,
        cyclesFound: cycles.length
      },
      basePath: analyzePath
    };

    outputHandler.outputQuery(result, format);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    outputHandler.outputError(`依賴分析失敗: ${errorMessage}`, format);
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}
