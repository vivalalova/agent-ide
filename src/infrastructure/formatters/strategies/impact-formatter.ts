/**
 * Impact query formatting strategy.
 */

import { type ImpactResult } from '../query-types.js';
import { BaseFormatter } from './base-formatter.js';

/**
 * Impact 結果格式化器
 */
export class ImpactFormatter extends BaseFormatter<ImpactResult> {
  /**
   * 格式化 impact 摘要
   */
  formatSummary(result: ImpactResult): string {
    const lines: string[] = [];
    const basePath = result.basePath;
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

    return lines.join('\n');
  }
}
