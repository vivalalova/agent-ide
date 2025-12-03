/**
 * Deps 命令
 * 分析依賴關係（循環依賴、影響分析）
 */

import type { Command } from 'commander';
import { DependencyAnalyzer } from '@core/dependency/dependency-analyzer.js';
import { QueryCommand, type DepsResult, type CycleInfo } from '@infrastructure/formatters/index.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

/** Deps 命令選項 */
interface DepsOptions {
  path: string;
  file?: string;
  format: string;
}

/**
 * 設定 deps 命令
 */
export function setupDepsCommand(program: Command, context: CommandContext): void {
  program
    .command('deps [subcommand]')
    .description('分析依賴關係 (subcommand: cycles|impact)')
    .option('-p, --path <path>', '分析路徑', '.')
    .option('-f, --file <file>', '特定檔案分析（用於 impact）')
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .action(async (subcommand: string, options: DepsOptions) => {
      await handleDepsCommand(subcommand, options, context);
    });
}

/**
 * 處理 deps 命令
 */
async function handleDepsCommand(
  subcommand: string,
  options: DepsOptions,
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

  // 驗證子命令
  const validSubcommands = ['cycles', 'impact'];
  if (!subcommand || !validSubcommands.includes(subcommand)) {
    const errorResult: DepsResult = {
      command: QueryCommand.Deps,
      success: false,
      cycles: [],
      summary: { totalScanned: 0, issuesFound: 0, totalFiles: 0, totalDependencies: 0, cyclesFound: 0 },
      errors: ['請指定子命令: cycles 或 impact']
    };
    outputHandler.outputQuery(errorResult, format);
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  if (format !== OutputFormat.Json) {
    const titles: Record<string, string> = {
      'cycles': '🔄 循環依賴分析...',
      'impact': '💥 影響分析...'
    };
    console.log(titles[subcommand] || '🔍 分析依賴關係...');
  }

  try {
    const analyzePath = options.path || process.cwd();

    // 初始化依賴分析器
    const dependencyAnalyzer = new DependencyAnalyzer(context.fileSystem);

    // 分析專案依賴
    const projectDeps = await dependencyAnalyzer.analyzeProject(analyzePath);

    // 獲取統計資訊
    const stats = dependencyAnalyzer.getStats();

    // 使用 CycleDetector 檢測循環依賴
    const cycleDetector = new (await import('../../../core/dependency/cycle-detector.js')).CycleDetector();
    const graph = await buildGraphFromProjectDeps(projectDeps);
    const cycles = cycleDetector.detectCycles(graph);

    // 建立 DepsResult
    const result = buildDepsResult(subcommand, graph, cycles, stats, options.file);

    // 輸出結果
    outputHandler.outputQuery(result, format);
  } catch (error) {
    handleError(error, format);
  }
}

/**
 * 建立 DepsResult
 */
function buildDepsResult(
  subcommand: string,
  graph: { getAllNodes: () => string[]; getDependencies: (id: string) => string[]; getDependents: (id: string) => string[] },
  cycles: Array<{ cycle: readonly string[]; length: number; severity: string }>,
  stats: { totalFiles: number; totalDependencies: number; orphanedFiles: number },
  targetFile?: string
): DepsResult {
  // 轉換 cycles 為 CycleInfo
  const cycleInfos: CycleInfo[] = cycles.map(c => ({
    cycle: [...c.cycle],
    length: c.length
  }));

  // 基本結果
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
    }
  };

  // 如果是 impact 分析且有指定檔案
  if (subcommand === 'impact' && targetFile) {
    const dependents = graph.getDependents(targetFile);
    const dependencies = graph.getDependencies(targetFile);
    result.impact = {
      targetFile,
      dependents,
      dependencies,
      totalAffected: dependents.length
    };
  }

  return result;
}

/**
 * 處理錯誤
 */
function handleError(error: unknown, format: OutputFormat): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (format === OutputFormat.Json) {
    console.error(JSON.stringify({ error: errorMessage }));
  } else {
    console.error('\n❌ 依賴分析失敗:', errorMessage);
  }

  process.exitCode = 1;
  if (process.env.NODE_ENV !== 'test') { process.exit(1); }
}

/**
 * 從專案依賴資訊建立依賴圖
 */
async function buildGraphFromProjectDeps(projectDeps: any): Promise<any> {
  const { DependencyGraph } = await import('../../../core/dependency/dependency-graph.js');
  const graph = new DependencyGraph();

  for (const fileDep of projectDeps.fileDependencies) {
    graph.addNode(fileDep.filePath);

    for (const dep of fileDep.dependencies) {
      graph.addDependency(fileDep.filePath, dep.path);
    }
  }

  return graph;
}
