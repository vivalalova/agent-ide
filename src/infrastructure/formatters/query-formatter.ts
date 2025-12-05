/**
 * 唯讀命令格式化器
 * 提供 json 和 summary 兩種輸出格式
 */

import {
  QueryCommand,
  IssueSeverity,
  type QueryResult,
  type SearchResult,
  type DepsResult,
  type AnalyzeResult,
  type SnapshotResult,
  type FindReferencesResult,
  type ReferenceItem,
  type ModuleSnapshotData,
  type ProjectSnapshotData
} from './query-types.js';

/** ANSI 顏色碼 */
const Colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m'
} as const;

/** 嚴重度對應的顏色和 emoji */
const SeverityStyle = {
  [IssueSeverity.Critical]: { color: Colors.red, emoji: '🔴' },
  [IssueSeverity.High]: { color: Colors.red, emoji: '🟠' },
  [IssueSeverity.Medium]: { color: Colors.yellow, emoji: '🟡' },
  [IssueSeverity.Low]: { color: Colors.green, emoji: '🟢' }
} as const;

/** QueryFormatter 選項 */
export interface QueryFormatterOptions {
  /** 是否啟用顏色輸出 */
  color: boolean;
}

/** 輸出格式 */
export enum QueryFormat {
  Json = 'json',
  Summary = 'summary'
}

/**
 * 唯讀命令格式化器
 */
export class QueryFormatter {
  private readonly color: boolean;

  constructor(options: Partial<QueryFormatterOptions> = {}) {
    this.color = options.color ?? false;
  }

  /**
   * 格式化結果
   */
  format(result: QueryResult, outputFormat: QueryFormat): string {
    if (outputFormat === QueryFormat.Json) {
      return this.toJson(result);
    }
    return this.toSummary(result);
  }

  /**
   * 轉換為 JSON 格式
   */
  toJson(result: QueryResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * 轉換為 summary 格式
   */
  toSummary(result: QueryResult): string {
    switch (result.command) {
      case QueryCommand.Search:
        return this.formatSearchSummary(result as SearchResult);
      case QueryCommand.Deps:
        return this.formatDepsSummary(result as DepsResult);
      case QueryCommand.Analyze:
        return this.formatAnalyzeSummary(result as AnalyzeResult);
      case QueryCommand.Snapshot:
        return this.formatSnapshotSummary(result as SnapshotResult);
      case QueryCommand.FindReferences:
        return this.formatFindReferencesSummary(result as FindReferencesResult);
      default:
        return this.formatDefaultSummary(result);
    }
  }

  /**
   * 格式化 Search 摘要
   */
  private formatSearchSummary(result: SearchResult): string {
    const lines: string[] = [];

    lines.push(`找到 ${result.results.length} 個結果`);
    if (result.searchTime) {
      lines.push(`搜尋耗時: ${result.searchTime}ms`);
    }
    if (result.truncated) {
      lines.push(this.colorize('(結果已截斷)', Colors.yellow));
    }

    lines.push('');

    // 列出結果
    result.results.forEach(match => {
      const location = match.column
        ? `${match.filePath}:${match.line}:${match.column}`
        : `${match.filePath}:${match.line}`;
      lines.push(this.colorize(location, Colors.cyan));
      lines.push(`  ${match.content}`);
    });

    return lines.join('\n');
  }

  /**
   * 格式化 Deps 摘要
   */
  private formatDepsSummary(result: DepsResult): string {
    const lines: string[] = [];

    // 循環依賴
    if (result.cycles && result.cycles.length > 0) {
      lines.push(this.colorize(`發現 ${result.cycles.length} 個循環依賴`, Colors.red));
      lines.push('');
      result.cycles.forEach((cycle, index) => {
        lines.push(`${index + 1}. ${cycle.cycle.join(' → ')} → ${cycle.cycle[0]}`);
      });
    } else {
      lines.push(this.colorize('未發現循環依賴', Colors.green));
    }

    // 影響分析
    if (result.impact) {
      lines.push('');
      lines.push(`📊 影響分析: ${result.impact.targetFile}`);
      lines.push(`   依賴此檔案: ${result.impact.dependents.length} 個`);
      lines.push(`   被此檔案依賴: ${result.impact.dependencies.length} 個`);
      if (result.impact.dependents.length > 0) {
        lines.push('   依賴者:');
        result.impact.dependents.slice(0, 5).forEach(dep => {
          lines.push(`     - ${dep}`);
        });
        if (result.impact.dependents.length > 5) {
          lines.push(`     ... 還有 ${result.impact.dependents.length - 5} 個`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 格式化 Analyze 摘要
   */
  private formatAnalyzeSummary(result: AnalyzeResult): string {
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
   * 格式化 Snapshot 摘要
   */
  private formatSnapshotSummary(result: SnapshotResult): string {
    const lines: string[] = [];

    if (result.snapshotType === 'project') {
      const snapshot = result.snapshot as ProjectSnapshotData;
      lines.push(`📦 專案: ${snapshot.project}`);
      lines.push(`📁 模組數: ${Object.keys(snapshot.modules).length}`);

      for (const [modulePath, moduleSnapshot] of Object.entries(snapshot.modules)) {
        lines.push('');
        lines.push(`  📂 ${modulePath}`);
        lines.push(`     API: ${Object.keys(moduleSnapshot.api).length} classes`);
        lines.push(`     Factories: ${Object.keys(moduleSnapshot.factories).length}`);
        lines.push(`     Types: ${Object.keys(moduleSnapshot.types).length}`);
      }
    } else {
      const snapshot = result.snapshot as ModuleSnapshotData;
      lines.push(`📦 模組: ${snapshot.module}`);
      lines.push(`📊 API: ${Object.keys(snapshot.api).length} classes`);
      lines.push(`🏭 Factories: ${Object.keys(snapshot.factories).length}`);
      lines.push(`📝 Types: ${Object.keys(snapshot.types).length}`);
      lines.push(`🔒 Private: ${Object.keys(snapshot.private).length} classes`);
    }

    return lines.join('\n');
  }

  /**
   * 格式化 FindReferences 摘要
   */
  private formatFindReferencesSummary(result: FindReferencesResult): string {
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

  /**
   * 格式化預設摘要（fallback）
   */
  private formatDefaultSummary(result: QueryResult): string {
    const lines: string[] = [];

    lines.push(`命令: ${result.command}`);
    lines.push(`成功: ${result.success ? '是' : '否'}`);

    if (result.summary) {
      lines.push('');
      lines.push('摘要:');
      Object.entries(result.summary).forEach(([key, value]) => {
        lines.push(`  ${key}: ${value}`);
      });
    }

    if (result.issues && result.issues.length > 0) {
      lines.push('');
      lines.push(`問題數: ${result.issues.length}`);
    }

    return lines.join('\n');
  }

  /**
   * 套用顏色（如果啟用）
   */
  private colorize(text: string, color: string): string {
    if (!this.color) {return text;}
    return `${color}${text}${Colors.reset}`;
  }
}

/**
 * 建立 QueryFormatter 的工廠函數
 */
export function createQueryFormatter(options: Partial<QueryFormatterOptions> = {}): QueryFormatter {
  const finalOptions: Partial<QueryFormatterOptions> = {
    color: options.color ?? (process.stdout.isTTY ?? false)
  };
  return new QueryFormatter(finalOptions);
}
