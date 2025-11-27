/**
 * Shit 命令
 * 分析程式碼垃圾度
 */

import type { Command } from 'commander';
import * as fs from 'fs/promises';
import { ParserRegistry } from '../../../infrastructure/parser/registry.js';
import { ShitScoreAnalyzer } from '../../../core/shit-score/shit-score-analyzer.js';
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
  if (options.format !== 'json') {
    console.log('💩 分析程式碼垃圾度...');
  }

  try {
    const analyzePath = options.path || process.cwd();
    const topCount = parseInt(options.top) || 10;
    const maxAllowed = options.maxAllowed ? parseFloat(options.maxAllowed) : undefined;

    const registry = ParserRegistry.getInstance();
    const analyzer = new ShitScoreAnalyzer(registry, context.fileSystem);
    const result = await analyzer.analyze(analyzePath, {
      detailed: options.detailed,
      topCount,
      maxAllowed,
      showFiles: options.showFiles
    });

    if (options.format === 'json') {
      const output = JSON.stringify(result, null, 2);
      if (options.output) {
        await fs.writeFile(options.output, output, 'utf-8');
        console.log(`✅ 結果已儲存至 ${options.output}`);
      } else {
        console.log(output);
      }
    } else {
      printSummaryReport(result, options);
    }
  } catch (error) {
    handleError(error, options.format);
  }
}

/**
 * 印出 summary 報告
 */
function printSummaryReport(result: any, options: ShitOptions): void {
  console.log('\n' + '='.repeat(50));
  console.log(`垃圾度評分報告 ${result.gradeInfo.emoji}`);
  console.log('='.repeat(50));
  console.log(`\n總分: ${result.shitScore} / 100  [${result.gradeInfo.emoji} ${result.grade}級]`);
  console.log(`評語: ${result.gradeInfo.message}\n`);

  console.log('維度分析:');
  console.log(`  複雜度垃圾:   ${result.dimensions.complexity.score.toFixed(1)} (${(result.dimensions.complexity.weight * 100).toFixed(0)}%) → 貢獻 ${result.dimensions.complexity.weightedScore.toFixed(1)} 分`);
  console.log(`  維護性垃圾:   ${result.dimensions.maintainability.score.toFixed(1)} (${(result.dimensions.maintainability.weight * 100).toFixed(0)}%) → 貢獻 ${result.dimensions.maintainability.weightedScore.toFixed(1)} 分`);
  console.log(`  架構垃圾:     ${result.dimensions.architecture.score.toFixed(1)} (${(result.dimensions.architecture.weight * 100).toFixed(0)}%) → 貢獻 ${result.dimensions.architecture.weightedScore.toFixed(1)} 分\n`);

  const criticalCount = result.topShit?.filter((s: any) => s.severity === 'critical').length ?? 0;
  const highCount = result.topShit?.filter((s: any) => s.severity === 'high').length ?? 0;
  const mediumCount = result.topShit?.filter((s: any) => s.severity === 'medium').length ?? 0;
  const lowCount = result.topShit?.filter((s: any) => s.severity === 'low').length ?? 0;

  console.log('問題統計:');
  console.log(`  🔴 嚴重問題:   ${criticalCount} 個`);
  console.log(`  🟠 高優先級:  ${highCount} 個`);
  console.log(`  🟡 中優先級:  ${mediumCount} 個`);
  console.log(`  🟢 低優先級:  ${lowCount} 個\n`);

  console.log(`掃描檔案: ${result.summary.analyzedFiles} 個（共 ${result.summary.totalFiles} 個）`);
  console.log(`總問題數: ${result.summary.totalShit} 個`);

  if (options.detailed && result.topShit?.length > 0) {
    printDetailedReport(result);
  }

  console.log('\n' + '='.repeat(50));
}

/**
 * 印出詳細報告
 */
function printDetailedReport(result: any): void {
  console.log('\n' + '='.repeat(50));
  console.log(`最糟的 ${result.topShit.length} 個項目:`);
  console.log('='.repeat(50));

  result.topShit.forEach((item: any, index: number) => {
    console.log(`\n${index + 1}. [${item.severity.toUpperCase()}] ${item.type}`);
    console.log(`   檔案: ${item.filePath}${item.location ? `:${item.location.line}` : ''}`);
    console.log(`   分數: ${item.score.toFixed(1)}`);
    console.log(`   描述: ${item.description}`);
  });

  if (result.recommendations?.length > 0) {
    console.log('\n' + '='.repeat(50));
    console.log('修復建議:');
    console.log('='.repeat(50));

    result.recommendations.forEach((rec: any, index: number) => {
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
