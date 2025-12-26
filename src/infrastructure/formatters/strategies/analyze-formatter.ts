/**
 * Analyze 命令格式化策略
 * 包含 DeadCode 子類型處理
 */

import {
  AnalyzeType,
  type AnalyzeResult,
  type DeadCodeResult
} from '../query-types.js';
import { groupByFile, formatLimitedList } from '../utils/index.js';
import { BaseFormatter, Colors, SeverityStyle } from './base-formatter.js';

/**
 * Analyze 結果格式化器
 */
export class AnalyzeFormatter extends BaseFormatter<AnalyzeResult> {
  /**
   * 格式化 Analyze 摘要
   */
  formatSummary(result: AnalyzeResult): string {
    // 特殊處理 DeadCode 類型
    if (result.analyzeType === AnalyzeType.DeadCode) {
      return this.formatDeadCodeSummary(result as DeadCodeResult);
    }

    const lines: string[] = [];

    lines.push(`分析類型: ${result.analyzeType}`);
    lines.push(`成功: ${result.success ? '是' : '否'}`);

    if (result.issues && result.issues.length > 0) {
      lines.push(`發現 ${result.issues.length} 個問題`);
      lines.push('');
      result.issues.slice(0, 10).forEach(issue => {
        const severity = issue.severity
          ? SeverityStyle[issue.severity].emoji
          : '•';
        lines.push(`${severity} ${issue.message}`);
        if (issue.filePath) {
          lines.push(`  ${this.colorize(issue.filePath, Colors.dim)}${issue.line ? `:${issue.line}` : ''}`);
        }
      });
      if (result.issues.length > 10) {
        lines.push(`... 還有 ${result.issues.length - 10} 個問題`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 格式化 DeadCode 摘要
   */
  private formatDeadCodeSummary(result: DeadCodeResult): string {
    const lines: string[] = [];

    // 標題
    lines.push('🔍 Dead Code 檢測結果');
    lines.push('');

    // 統計
    lines.push(`📊 掃描符號: ${result.summary.totalScanned || 0}`);
    lines.push(`💀 Dead Code: ${result.items.length} 個`);
    lines.push(`📁 影響檔案: ${result.filesAffected} 個`);
    lines.push(`⏱️  耗時: ${result.scanTime}ms`);
    if (result.skippedFiles > 0) {
      lines.push(this.colorize(`⚠️  跳過檔案: ${result.skippedFiles} 個（解析失敗）`, Colors.yellow));
    }
    lines.push('');

    // 按類型統計
    if (Object.keys(result.byType).length > 0) {
      lines.push('按類型統計:');
      for (const [type, count] of Object.entries(result.byType)) {
        const label = this.getTypeLabel(type);
        lines.push(`  ${label}: ${count}`);
      }
      lines.push('');
    }

    // Dead code 列表
    if (result.items.length > 0) {
      lines.push('Dead Code 列表:');

      const byFile = groupByFile(result.items);

      for (const [file, items] of byFile) {
        lines.push(`  ${this.colorize(file, Colors.cyan)}`);
        lines.push(...formatLimitedList({
          items,
          formatItem: item => {
            const icon = this.getDeadCodeIcon(item.type);
            return `${icon} L${item.line}: ${item.name} (${item.type})\n       ${this.colorize(item.reason, Colors.dim)}`;
          },
          overflowUnit: ''
        }));
      }
    } else {
      lines.push(this.colorize('✅ 未發現 Dead Code', Colors.green));
    }

    return lines.join('\n');
  }

  /**
   * 取得 Dead Code 圖示
   */
  private getDeadCodeIcon(type: string): string {
    switch (type) {
      case 'function': return '⚡';
      case 'class': return '📦';
      case 'variable': return '📌';
      case 'interface': return '📋';
      case 'type': return '🏷️';
      default: return '💀';
    }
  }
}
