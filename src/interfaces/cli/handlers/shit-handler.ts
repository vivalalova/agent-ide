/**
 * Shit 命令處理器
 * 處理垃圾度評分相關的命令操作
 */

import * as fs from 'fs/promises';
import { ParserRegistry } from '../../../infrastructure/parser/registry.js';
import { ShitScoreAnalyzer } from '../../../core/shit-score/shit-score-analyzer.js';
import { DEFAULT_VALUES, FORMAT, createSeparator } from '../constants.js';

/**
 * 處理 ShitScore 命令
 */
export async function handleShitCommand(options: any): Promise<void> {
  if (options.format !== 'json') {
    console.log('💩 分析程式碼垃圾度...');
  }

  try {
    const analyzePath = options.path || process.cwd();
    const topCount = parseInt(options.top) || DEFAULT_VALUES.TOP_SHIT_COUNT;
    const maxAllowed = options.maxAllowed ? parseFloat(options.maxAllowed) : undefined;

    const registry = ParserRegistry.getInstance();
    const analyzer = new ShitScoreAnalyzer(registry);
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
      console.log('\n' + createSeparator());
      console.log(`垃圾度評分報告 ${result.gradeInfo.emoji}`);
      console.log(createSeparator());
      console.log(`\n總分: ${result.shitScore} / ${FORMAT.MAX_SCORE}  [${result.gradeInfo.emoji} ${result.grade}級]`);
      console.log(`評語: ${result.gradeInfo.message}\n`);

      console.log('維度分析:');
      console.log(`  複雜度垃圾:   ${result.dimensions.complexity.score.toFixed(1)} (${(result.dimensions.complexity.weight * FORMAT.PERCENTAGE_MULTIPLIER).toFixed(0)}%) → 貢獻 ${result.dimensions.complexity.weightedScore.toFixed(1)} 分`);
      console.log(`  維護性垃圾:   ${result.dimensions.maintainability.score.toFixed(1)} (${(result.dimensions.maintainability.weight * FORMAT.PERCENTAGE_MULTIPLIER).toFixed(0)}%) → 貢獻 ${result.dimensions.maintainability.weightedScore.toFixed(1)} 分`);
      console.log(`  架構垃圾:     ${result.dimensions.architecture.score.toFixed(1)} (${(result.dimensions.architecture.weight * FORMAT.PERCENTAGE_MULTIPLIER).toFixed(0)}%) → 貢獻 ${result.dimensions.architecture.weightedScore.toFixed(1)} 分\n`);

      const criticalCount = result.topShit ? result.topShit.filter(s => s.severity === 'critical').length : 0;
      const highCount = result.topShit ? result.topShit.filter(s => s.severity === 'high').length : 0;
      const mediumCount = result.topShit ? result.topShit.filter(s => s.severity === 'medium').length : 0;
      const lowCount = result.topShit ? result.topShit.filter(s => s.severity === 'low').length : 0;

      console.log('問題統計:');
      console.log(`  🔴 嚴重問題:   ${criticalCount} 個`);
      console.log(`  🟠 高優先級:  ${highCount} 個`);
      console.log(`  🟡 中優先級:  ${mediumCount} 個`);
      console.log(`  🟢 低優先級:  ${lowCount} 個\n`);

      console.log(`掃描檔案: ${result.summary.analyzedFiles} 個（共 ${result.summary.totalFiles} 個）`);
      console.log(`總問題數: ${result.summary.totalShit} 個`);

      if (options.detailed && result.topShit && result.topShit.length > 0) {
        console.log('\n' + createSeparator());
        console.log(`最糟的 ${result.topShit.length} 個項目:`);
        console.log(createSeparator());
        result.topShit.forEach((item, index) => {
          console.log(`\n${index + 1}. [${item.severity.toUpperCase()}] ${item.type}`);
          console.log(`   檔案: ${item.filePath}${item.location ? `:${item.location.line}` : ''}`);
          console.log(`   分數: ${item.score.toFixed(1)}`);
          console.log(`   描述: ${item.description}`);
        });

        if (result.recommendations && result.recommendations.length > 0) {
          console.log('\n' + createSeparator());
          console.log('修復建議:');
          console.log(createSeparator());
          result.recommendations.forEach((rec, index) => {
            console.log(`\n${index + 1}. [優先級 ${rec.priority}] ${rec.category}`);
            console.log(`   建議: ${rec.suggestion}`);
            console.log(`   預期改善: ${rec.estimatedImpact.toFixed(1)} 分`);
            console.log(`   影響檔案: ${rec.affectedFiles.length} 個`);
          });
        }
      }

      console.log('\n' + createSeparator());
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (options.format === 'json') {
      console.error(JSON.stringify({ error: errorMessage }));
    } else {
      console.error('\n❌ 垃圾度分析失敗:', errorMessage);
    }

    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}
