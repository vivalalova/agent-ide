/**
 * Search 命令格式化策略
 */

import { type SearchResult } from '../query-types.js';
import { BaseFormatter, Colors } from './base-formatter.js';

/**
 * Search 結果格式化器
 */
export class SearchFormatter extends BaseFormatter<SearchResult> {
  /**
   * 格式化 Search 摘要
   */
  formatSummary(result: SearchResult): string {
    const lines: string[] = [];

    lines.push(`找到 ${result.results.length} 個結果`);
    if (result.searchTime) {
      lines.push(`搜尋耗時: ${result.searchTime}ms`);
    }
    if (result.truncated) {
      lines.push(this.colorize('(結果已截斷)', Colors.yellow));
    }

    lines.push('');

    result.results.forEach(match => {
      const location = match.column
        ? `${match.filePath}:${match.line}:${match.column}`
        : `${match.filePath}:${match.line}`;
      lines.push(this.colorize(location, Colors.cyan));
      lines.push(`  ${match.content}`);
    });

    return lines.join('\n');
  }
}
