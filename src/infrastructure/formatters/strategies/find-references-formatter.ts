/**
 * FindReferences 命令格式化策略
 */

import { type FindReferencesResult } from '../query-types.js';
import { groupByFile, formatLimitedList } from '../utils/index.js';
import { BaseFormatter, Colors } from './base-formatter.js';

/**
 * FindReferences 結果格式化器
 */
export class FindReferencesFormatter extends BaseFormatter<FindReferencesResult> {
  /**
   * 格式化 FindReferences 摘要
   */
  formatSummary(result: FindReferencesResult): string {
    const lines: string[] = [];

    // 標題
    lines.push(`🔍 符號: ${result.symbol} (${result.type})`);

    // 定義位置
    if (result.definition) {
      const defLoc = `${result.definition.file}:${result.definition.line}:${result.definition.column}`;
      lines.push(`📍 定義: ${this.colorize(defLoc, Colors.cyan)}`);
    } else {
      lines.push(this.colorize('⚠️  找不到定義位置', Colors.yellow));
    }

    // 統計
    const filesAffected = new Set(result.references.map(r => r.file)).size;
    lines.push('');
    lines.push(`📊 找到 ${result.references.length} 個引用（${filesAffected} 個檔案）`);

    // 引用列表（按檔案分組）
    if (result.references.length > 0) {
      lines.push('');
      lines.push('引用列表:');

      const byFile = groupByFile(result.references);

      for (const [file, refs] of byFile) {
        lines.push(`  ${this.colorize(file, Colors.cyan)}`);
        lines.push(...formatLimitedList({
          items: refs,
          formatItem: ref => {
            const typeIcon = this.getReferenceTypeIcon(ref.type);
            return `${typeIcon} L${ref.line}: ${ref.context.trim()}`;
          },
          overflowUnit: '引用'
        }));
      }
    }

    return lines.join('\n');
  }

  /**
   * 取得引用類型圖示
   */
  private getReferenceTypeIcon(type: string): string {
    switch (type) {
      case 'definition': return '📌';
      case 'import': return '📥';
      case 'export': return '📤';
      case 'usage':
      default: return '📞';
    }
  }
}
