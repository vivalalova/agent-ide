/**
 * FindReferences 命令格式化策略
 */

import { type FindReferencesResult, type ReferenceItem } from '../query-types.js';
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

      const byFile = this.groupReferencesByFile(result.references);

      for (const [file, refs] of byFile) {
        lines.push(`  ${this.colorize(file, Colors.cyan)}`);
        refs.slice(0, 10).forEach(ref => {
          const typeIcon = this.getReferenceTypeIcon(ref.type);
          lines.push(`    ${typeIcon} L${ref.line}: ${ref.context.trim()}`);
        });
        if (refs.length > 10) {
          lines.push(`    ... 還有 ${refs.length - 10} 個引用`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 按檔案分組引用
   */
  private groupReferencesByFile(references: ReferenceItem[]): Map<string, ReferenceItem[]> {
    const byFile = new Map<string, ReferenceItem[]>();
    references.forEach(ref => {
      const list = byFile.get(ref.file) || [];
      list.push(ref);
      byFile.set(ref.file, list);
    });
    return byFile;
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
