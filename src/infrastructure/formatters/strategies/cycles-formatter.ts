/**
 * Cycles query formatting strategy.
 */

import { type CyclesResult } from '../query-types.js';
import { BaseFormatter, Colors } from './base-formatter.js';

/**
 * Cycles 結果格式化器
 */
export class CyclesFormatter extends BaseFormatter<CyclesResult> {
  /**
   * 格式化 cycles 摘要
   */
  formatSummary(result: CyclesResult): string {
    const lines: string[] = [];
    const basePath = result.basePath;

    if (result.cycles.length > 0) {
      lines.push(this.colorize(`發現 ${result.cycles.length} 個循環依賴`, Colors.red));
      lines.push('');
      result.cycles.forEach((cycle, index) => {
        const formattedCycle = cycle.cycle.map(p => this.toRelativePath(p, basePath));
        lines.push(`${index + 1}. ${formattedCycle.join(' → ')} → ${formattedCycle[0]}`);
      });
    } else {
      lines.push(this.colorize('未發現循環依賴', Colors.green));
    }

    return lines.join('\n');
  }
}
