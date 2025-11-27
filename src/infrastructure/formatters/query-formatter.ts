/**
 * 唯讀命令格式化器
 * 提供 json 和 summary 兩種輸出格式
 */

import {
  QueryCommand,
  IssueSeverity,
  type QueryResult,
  type ShitResult,
  type ShitItem,
  type SearchResult,
  type DepsResult,
  type AnalyzeResult,
  type SnapshotResult
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
      case QueryCommand.Shit:
        return this.formatShitSummary(result as ShitResult);
      case QueryCommand.Search:
        return this.formatSearchSummary(result as SearchResult);
      case QueryCommand.Deps:
        return this.formatDepsSummary(result as DepsResult);
      case QueryCommand.Analyze:
        return this.formatAnalyzeSummary(result as AnalyzeResult);
      case QueryCommand.Snapshot:
        return this.formatSnapshotSummary(result as SnapshotResult);
      default:
        return this.formatDefaultSummary(result);
    }
  }

  /**
   * 格式化 ShitScore 摘要
   */
  private formatShitSummary(result: ShitResult): string {
    const lines: string[] = [];
    const sep = '='.repeat(50);

    lines.push('');
    lines.push(sep);
    lines.push(`垃圾度評分報告 ${result.gradeInfo.emoji}`);
    lines.push(sep);
    lines.push(`\n總分: ${result.shitScore} / 100  [${result.gradeInfo.emoji} ${result.grade}級]`);
    lines.push(`評語: ${result.gradeInfo.message}\n`);

    // 維度分析
    lines.push('維度分析:');
    const { dimensions } = result;
    lines.push(this.formatDimension('複雜度垃圾', dimensions.complexity));
    lines.push(this.formatDimension('維護性垃圾', dimensions.maintainability));
    lines.push(this.formatDimension('架構垃圾', dimensions.architecture));
    lines.push('');

    // 問題統計
    if (result.topShit && result.topShit.length > 0) {
      const counts = this.countShitBySeverity(result.topShit);
      lines.push('問題統計:');
      lines.push(`  ${SeverityStyle[IssueSeverity.Critical].emoji} 嚴重問題:   ${counts.critical} 個`);
      lines.push(`  ${SeverityStyle[IssueSeverity.High].emoji} 高優先級:  ${counts.high} 個`);
      lines.push(`  ${SeverityStyle[IssueSeverity.Medium].emoji} 中優先級:  ${counts.medium} 個`);
      lines.push(`  ${SeverityStyle[IssueSeverity.Low].emoji} 低優先級:  ${counts.low} 個`);
      lines.push('');
    }

    // 統計摘要
    lines.push(`掃描檔案: ${result.summary.totalScanned ?? 0} 個`);
    lines.push(`總問題數: ${result.summary.issuesFound ?? 0} 個`);

    // 錯誤訊息
    if (result.errors && result.errors.length > 0) {
      lines.push('');
      lines.push(this.colorize('Errors:', Colors.red));
      result.errors.forEach(error => {
        lines.push(this.colorize(`  - ${error}`, Colors.red));
      });
    }

    lines.push('');
    lines.push(sep);

    return lines.join('\n');
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

    // 孤立檔案
    if (result.orphans && result.orphans.length > 0) {
      lines.push('');
      lines.push(`孤立檔案: ${result.orphans.length} 個`);
      result.orphans.slice(0, 10).forEach(orphan => {
        lines.push(`  - ${orphan}`);
      });
      if (result.orphans.length > 10) {
        lines.push(`  ... 還有 ${result.orphans.length - 10} 個`);
      }
    }

    // 依賴圖統計
    if (result.graph) {
      lines.push('');
      lines.push(`節點數: ${result.graph.nodes.length}`);
      lines.push(`邊數: ${result.graph.edges.length}`);
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

    lines.push(`操作: ${result.action}`);
    lines.push(`成功: ${result.success ? '是' : '否'}`);

    if (result.snapshotPath) {
      lines.push(`路徑: ${result.snapshotPath}`);
    }

    if (result.stats) {
      lines.push('');
      lines.push('統計:');
      lines.push(`  檔案數: ${result.stats.files}`);
      lines.push(`  總行數: ${result.stats.lines}`);
      lines.push(`  總大小: ${this.formatSize(result.stats.size)}`);
    }

    return lines.join('\n');
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
   * 格式化維度分數
   */
  private formatDimension(name: string, dim: { score: number; weight: number; weightedScore: number }): string {
    const paddedName = name.padEnd(12);
    return `  ${paddedName} ${dim.score.toFixed(1)} (${(dim.weight * 100).toFixed(0)}%) → 貢獻 ${dim.weightedScore.toFixed(1)} 分`;
  }

  /**
   * 統計 QueryIssue 各嚴重度數量
   */
  private countBySeverity(issues: { severity?: IssueSeverity }[]): Record<string, number> {
    return {
      critical: issues.filter(i => i.severity === IssueSeverity.Critical).length,
      high: issues.filter(i => i.severity === IssueSeverity.High).length,
      medium: issues.filter(i => i.severity === IssueSeverity.Medium).length,
      low: issues.filter(i => i.severity === IssueSeverity.Low).length
    };
  }

  /**
   * 統計 ShitItem 各嚴重度數量
   */
  private countShitBySeverity(items: ShitItem[]): Record<string, number> {
    return {
      critical: items.filter(i => i.severity === 'critical').length,
      high: items.filter(i => i.severity === 'high').length,
      medium: items.filter(i => i.severity === 'medium').length,
      low: items.filter(i => i.severity === 'low').length
    };
  }

  /**
   * 格式化檔案大小
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) {return `${bytes} B`;}
    if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)} KB`;}
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
