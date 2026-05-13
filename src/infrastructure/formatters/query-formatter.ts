/**
 * 唯讀命令格式化器
 * 使用策略模式路由到對應的格式化策略
 */

import {
  QueryCommand,
  type QueryResult,
  type SearchResult,
  type CyclesResult,
  type ImpactResult,
  type FindReferencesResult,
  type CallHierarchyResult
} from './query-types.js';
import {
  type IQueryStrategy,
  SearchFormatter,
  CyclesFormatter,
  ImpactFormatter,
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
    // 延遲初始化：建構時不建立策略實例
    this.strategies = new Map();
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
      case QueryCommand.Cycles:
        return this.getStrategy<CyclesResult>(QueryCommand.Cycles).formatSummary(result as CyclesResult);
      case QueryCommand.Impact:
        return this.getStrategy<ImpactResult>(QueryCommand.Impact).formatSummary(result as ImpactResult);
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
   * 取得策略（延遲初始化）
   */
  private getStrategy<T extends QueryResult>(command: QueryCommand): IQueryStrategy<T> {
    // 檢查快取
    let strategy = this.strategies.get(command);
    if (strategy) {
      return strategy as IQueryStrategy<T>;
    }

    // 首次使用時才建立對應的策略實例
    switch (command) {
      case QueryCommand.Search:
        strategy = new SearchFormatter(this.color);
        break;
      case QueryCommand.Cycles:
        strategy = new CyclesFormatter(this.color);
        break;
      case QueryCommand.Impact:
        strategy = new ImpactFormatter(this.color);
        break;
      case QueryCommand.FindReferences:
        strategy = new FindReferencesFormatter(this.color);
        break;
      case QueryCommand.CallHierarchy:
        strategy = new CallHierarchyFormatter(this.color);
        break;
      default: {
        // Exhaustive check
        const _exhaustiveCheck: never = command;
        throw new Error(`Unknown command: ${_exhaustiveCheck}`);
      }
    }

    this.strategies.set(command, strategy);
    return strategy as IQueryStrategy<T>;
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
