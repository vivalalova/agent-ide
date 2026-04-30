/**
 * Dependency query formatting strategy.
 */

import { type DependencyResult } from '../query-types.js';
import { BaseFormatter, Colors } from './base-formatter.js';

/**
 * Dependency result formatter for cycles and impact commands.
 */
export class DependencyFormatter extends BaseFormatter<DependencyResult> {
  /**
   * 格式化 dependency 摘要
   */
  formatSummary(result: DependencyResult): string {
    const lines: string[] = [];
    const basePath = result.basePath;

    // 循環依賴
    if (result.cycles && result.cycles.length > 0) {
      lines.push(this.colorize(`發現 ${result.cycles.length} 個循環依賴`, Colors.red));
      lines.push('');
      result.cycles.forEach((cycle, index) => {
        const formattedCycle = cycle.cycle.map(p => this.toRelativePath(p, basePath));
        lines.push(`${index + 1}. ${formattedCycle.join(' → ')} → ${formattedCycle[0]}`);
      });
    } else if (!result.impact) {
      // 只有在沒有 impact 分析時才顯示「未發現循環依賴」
      lines.push(this.colorize('未發現循環依賴', Colors.green));
    }

    // 影響分析
    if (result.impact) {
      const targetFile = this.toRelativePath(result.impact.targetFile, basePath);
      lines.push(`📊 影響分析: ${targetFile}`);
      lines.push(`   依賴此檔案: ${result.impact.dependents.length} 個`);
      lines.push(`   被此檔案依賴: ${result.impact.dependencies.length} 個`);
      if (result.impact.dependents.length > 0) {
        lines.push('   依賴者:');
        result.impact.dependents.slice(0, 5).forEach(dep => {
          lines.push(`     - ${this.toRelativePath(dep, basePath)}`);
        });
        if (result.impact.dependents.length > 5) {
          lines.push(`     ... 還有 ${result.impact.dependents.length - 5} 個`);
        }
      }
    }

    return lines.join('\n');
  }
}
