/**
 * Shit 命令
 * 分析程式碼垃圾度
 */

import type { Command } from 'commander';
import * as fs from 'fs/promises';
import { ParserRegistry } from '../../../infrastructure/parser/registry.js';
import { ShitScoreAnalyzer } from '../../../core/shit-score/shit-score-analyzer.js';
import type { ShitScoreResult } from '../../../core/shit-score/types.js';
import { QueryCommand, type ShitResult, type ShitItem, type Recommendation } from '../../../infrastructure/formatters/index.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '../unified-output-handler.js';
import type { CommandContext } from './types.js';

/** Shit 命令選項 */
interface ShitOptions {
  path: string;
  detailed: boolean;
  top: string;
  maxAllowed?: string;
  format: string;
  showFiles: boolean;
  output?: string;
}

/**
 * 設定 shit 命令
 */
export function setupShitCommand(program: Command, context: CommandContext): void {
  program
    .command('shit')
    .description('分析程式碼垃圾度（分數越高越糟糕）')
    .option('-p, --path <path>', '分析路徑', '.')
    .option('-d, --detailed', '顯示詳細資訊（topShit + recommendations）', false)
    .option('-t, --top <num>', '顯示前 N 個最糟項目', '10')
    .option('-m, --max-allowed <score>', '最大允許分數（超過則 exit 1）')
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .option('--show-files', '顯示問題檔案列表（detailedFiles）', false)
    .option('-o, --output <file>', '輸出到檔案')
    .action(async (options: ShitOptions) => {
      await handleShitCommand(options, context);
    });
}

/**
 * 處理 shit 命令
 */
async function handleShitCommand(options: ShitOptions, context: CommandContext): Promise<void> {
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
    console.log('💩 分析程式碼垃圾度...');
  }

  try {
    const analyzePath = options.path || process.cwd();
    const topCount = parseInt(options.top) || 10;
    const maxAllowed = options.maxAllowed ? parseFloat(options.maxAllowed) : undefined;

    const registry = ParserRegistry.getInstance();
    const analyzer = new ShitScoreAnalyzer(registry, context.fileSystem);
    const coreResult = await analyzer.analyze(analyzePath, {
      detailed: options.detailed,
      topCount,
      maxAllowed,
      showFiles: options.showFiles
    });

    // 轉換為統一的 ShitResult
    const shitResult = convertToShitResult(coreResult);

    if (format === OutputFormat.Json) {
      const output = JSON.stringify(shitResult, null, 2);
      if (options.output) {
        await fs.writeFile(options.output, output, 'utf-8');
        console.log(`✅ 結果已儲存至 ${options.output}`);
      } else {
        console.log(output);
      }
    } else {
      outputHandler.outputQuery(shitResult, format);

      // 詳細報告（topShit + recommendations）
      if (options.detailed && coreResult.topShit && coreResult.topShit.length > 0) {
        printDetailedReport(coreResult);
      }
    }
  } catch (error) {
    handleError(error, options.format);
  }
}

/**
 * 將 ShitScoreResult 轉換為統一的 ShitResult
 */
function convertToShitResult(coreResult: ShitScoreResult): ShitResult {
  // 轉換 topShit
  const topShit: ShitItem[] | undefined = coreResult.topShit?.map(item => ({
    type: item.type,
    severity: item.severity,
    score: item.score,
    filePath: item.filePath,
    description: item.description,
    location: item.location
      ? { line: item.location.line, column: item.location.column }
      : undefined
  }));

  // 轉換 recommendations
  const recommendations: Recommendation[] | undefined = coreResult.recommendations?.map(rec => ({
    priority: typeof rec.priority === 'number' ? rec.priority : 0,
    category: rec.category,
    suggestion: rec.suggestion,
    estimatedImpact: rec.estimatedImpact,
    affectedFiles: [...rec.affectedFiles]
  }));

  return {
    command: QueryCommand.Shit,
    success: true,
    shitScore: coreResult.shitScore,
    grade: coreResult.grade,
    gradeInfo: {
      emoji: coreResult.gradeInfo.emoji,
      message: coreResult.gradeInfo.message
    },
    dimensions: {
      complexity: { ...coreResult.dimensions.complexity },
      maintainability: { ...coreResult.dimensions.maintainability },
      architecture: { ...coreResult.dimensions.architecture },
      qualityAssurance: coreResult.dimensions.qualityAssurance
        ? { ...coreResult.dimensions.qualityAssurance }
        : undefined
    },
    summary: {
      totalScanned: coreResult.summary.analyzedFiles,
      issuesFound: coreResult.summary.totalShit,
      totalFiles: coreResult.summary.totalFiles,
      analyzedFiles: coreResult.summary.analyzedFiles,
      totalShit: coreResult.summary.totalShit
    },
    topShit,
    recommendations,
    analyzedAt: coreResult.analyzedAt
  };
}

/**
 * 印出詳細報告
 */
function printDetailedReport(result: ShitScoreResult): void {
  if (!result.topShit || result.topShit.length === 0) {return;}

  console.log('\n' + '='.repeat(50));
  console.log(`最糟的 ${result.topShit.length} 個項目:`);
  console.log('='.repeat(50));

  result.topShit.forEach((item, index) => {
    console.log(`\n${index + 1}. [${item.severity.toUpperCase()}] ${item.type}`);
    console.log(`   檔案: ${item.filePath}${item.location ? `:${item.location.line}` : ''}`);
    console.log(`   分數: ${item.score.toFixed(1)}`);
    console.log(`   描述: ${item.description}`);
  });

  if (result.recommendations && result.recommendations.length > 0) {
    console.log('\n' + '='.repeat(50));
    console.log('修復建議:');
    console.log('='.repeat(50));

    result.recommendations.forEach((rec, index) => {
      console.log(`\n${index + 1}. [優先級 ${rec.priority}] ${rec.category}`);
      console.log(`   建議: ${rec.suggestion}`);
      console.log(`   預期改善: ${rec.estimatedImpact.toFixed(1)} 分`);
      console.log(`   影響檔案: ${rec.affectedFiles.length} 個`);
    });
  }
}

/**
 * 處理錯誤
 */
function handleError(error: unknown, format: string): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (format === 'json') {
    console.error(JSON.stringify({ error: errorMessage }));
  } else {
    console.error('\n❌ 垃圾度分析失敗:', errorMessage);
  }

  process.exitCode = 1;
  if (process.env.NODE_ENV !== 'test') { process.exit(1); }
}
