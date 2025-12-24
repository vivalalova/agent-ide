/**
 * CallHierarchy 命令格式化策略
 */

import {
  type CallHierarchyResult,
  type IncomingCallItem,
  type OutgoingCallItem
} from '../query-types.js';
import { BaseFormatter, Colors } from './base-formatter.js';

/**
 * CallHierarchy 結果格式化器
 */
export class CallHierarchyFormatter extends BaseFormatter<CallHierarchyResult> {
  /**
   * 格式化 CallHierarchy 摘要
   */
  formatSummary(result: CallHierarchyResult): string {
    const lines: string[] = [];

    // 標題與定義位置
    lines.push(`📞 函數呼叫層次: ${result.function}`);
    const defLoc = result.definitionLine
      ? `${result.file}:${result.definitionLine}`
      : result.file;
    lines.push(`📍 定義位置: ${this.colorize(defLoc, Colors.cyan)}`);
    lines.push(`🔍 分析方向: ${result.direction}, 深度: ${result.depth}`);
    lines.push('');

    // Incoming（誰呼叫我）
    if (result.direction === 'incoming' || result.direction === 'both') {
      lines.push(`📥 呼叫者 (Incoming): ${result.incoming.length} 個`);
      if (result.incoming.length > 0) {
        const grouped = this.groupCallsByFile(result.incoming);
        for (const [file, items] of grouped) {
          lines.push(`  ${this.colorize(file, Colors.cyan)}`);
          (items as IncomingCallItem[]).slice(0, 10).forEach(item => {
            lines.push(`    ⬅️  ${item.caller} (L${item.line})`);
          });
          if (items.length > 10) {
            lines.push(`    ... 還有 ${items.length - 10} 個呼叫者`);
          }
        }
      }
      lines.push('');
    }

    // Outgoing（我呼叫誰）
    if (result.direction === 'outgoing' || result.direction === 'both') {
      lines.push(`📤 被呼叫者 (Outgoing): ${result.outgoing.length} 個`);
      if (result.outgoing.length > 0) {
        const grouped = this.groupCallsByFile(result.outgoing);
        for (const [file, items] of grouped) {
          lines.push(`  ${this.colorize(file, Colors.cyan)}`);
          (items as OutgoingCallItem[]).slice(0, 10).forEach(item => {
            lines.push(`    ➡️  ${item.callee} (L${item.line})`);
          });
          if (items.length > 10) {
            lines.push(`    ... 還有 ${items.length - 10} 個被呼叫者`);
          }
        }
      }
      lines.push('');
    }

    // 統計
    const uniqueFiles = new Set([
      ...result.incoming.map(i => i.file),
      ...result.outgoing.map(o => o.file)
    ]).size;
    lines.push(`📊 統計: ${result.incoming.length} incoming, ${result.outgoing.length} outgoing, ${uniqueFiles} 個檔案`);

    return lines.join('\n');
  }

  /**
   * 按檔案分組呼叫項目
   */
  private groupCallsByFile<T extends { file: string }>(items: T[]): Map<string, T[]> {
    const byFile = new Map<string, T[]>();
    items.forEach(item => {
      const list = byFile.get(item.file) || [];
      list.push(item);
      byFile.set(item.file, list);
    });
    return byFile;
  }
}
