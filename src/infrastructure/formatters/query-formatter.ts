/**
 * 唯讀命令格式化器
 * 使用策略模式路由到對應的格式化策略
 */

import {
  QueryCommand,
  type QueryResult,
  type SearchResult,
  type DepsResult,
  type AnalyzeResult,
  type SnapshotResult,
  type FindReferencesResult,
  type CallHierarchyResult
} from './query-types.js';
import {
  type IQueryStrategy,
  SearchFormatter,
  DepsFormatter,
  AnalyzeFormatter,
  SnapshotFormatter,
  FindReferencesFormatter,
  CallHierarchyFormatter
} from './strategies/index.js';

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
  private readonly strategies: Map<QueryCommand, IQueryStrategy>;

  constructor(options: Partial<QueryFormatterOptions> = {}) {
    this.color = options.color ?? false;
    this.strategies = this.initializeStrategies();
  }

  /**
   * 初始化策略 Map
   */
  private initializeStrategies(): Map<QueryCommand, IQueryStrategy> {
    return new Map<QueryCommand, IQueryStrategy>([
      [QueryCommand.Search, new SearchFormatter(this.color)],
      [QueryCommand.Deps, new DepsFormatter(this.color)],
      [QueryCommand.Analyze, new AnalyzeFormatter(this.color)],
      [QueryCommand.Snapshot, new SnapshotFormatter(this.color)],
      [QueryCommand.FindReferences, new FindReferencesFormatter(this.color)],
      [QueryCommand.CallHierarchy, new CallHierarchyFormatter(this.color)]
    ]);
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
        return this.getStrategy<SearchResult>(QueryCommand.Search).formatSummary(result as SearchResult);
      case QueryCommand.Deps:
        return this.getStrategy<DepsResult>(QueryCommand.Deps).formatSummary(result as DepsResult);
      case QueryCommand.Analyze:
        return this.getStrategy<AnalyzeResult>(QueryCommand.Analyze).formatSummary(result as AnalyzeResult);
      case QueryCommand.Snapshot:
        return this.getStrategy<SnapshotResult>(QueryCommand.Snapshot).formatSummary(result as SnapshotResult);
      case QueryCommand.FindReferences:
        return this.getStrategy<FindReferencesResult>(QueryCommand.FindReferences)
          .formatSummary(result as FindReferencesResult);
      case QueryCommand.CallHierarchy:
        return this.getStrategy<CallHierarchyResult>(QueryCommand.CallHierarchy)
          .formatSummary(result as CallHierarchyResult);
    }
    // Exhaustive check: 編譯時確保所有 QueryCommand 都被處理
    const _exhaustiveCheck: never = result.command;
    return this.formatDefaultSummary({ ...result, command: _exhaustiveCheck });
  }

  /**
   * 取得策略（型別安全）
   */
  private getStrategy<T extends QueryResult>(command: QueryCommand): IQueryStrategy<T> {
    return this.strategies.get(command) as IQueryStrategy<T>;
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
