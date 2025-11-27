/**
 * 統一輸出處理器
 * 整合變更類（PreviewFormatter）和唯讀類（QueryFormatter）的輸出處理
 */

import {
  createPreviewFormatter,
  PreviewFormat,
  type PreviewResult,
  type PreviewInput
} from '../../infrastructure/formatters/index.js';
import {
  createQueryFormatter,
  QueryFormat
} from '../../infrastructure/formatters/query-formatter.js';
import type { QueryResult } from '../../infrastructure/formatters/query-types.js';

/** 統一輸出格式 */
export enum OutputFormat {
  /** JSON 格式（機器可讀） */
  Json = 'json',
  /** 摘要格式（人類可讀） */
  Summary = 'summary',
  /** Diff 格式（僅變更類命令） */
  Diff = 'diff'
}

/** 輸出處理器選項 */
export interface UnifiedOutputOptions {
  /** 是否啟用顏色 */
  color?: boolean;
  /** 上下文行數（僅變更類命令） */
  contextLines?: number;
}

/**
 * 統一輸出處理器
 * 處理所有 CLI 命令的輸出
 */
export class UnifiedOutputHandler {
  private readonly previewFormatter;
  private readonly queryFormatter;

  constructor(options: UnifiedOutputOptions = {}) {
    const color = options.color ?? (process.stdout.isTTY ?? false);

    this.previewFormatter = createPreviewFormatter({
      contextLines: options.contextLines ?? 3,
      color
    });

    this.queryFormatter = createQueryFormatter({ color });
  }

  // ========== 變更類命令（Mutation）方法 ==========

  /**
   * 從 PreviewInput 生成並輸出變更類結果
   */
  outputMutation(input: PreviewInput, format: OutputFormat): void {
    const result = this.previewFormatter.createPreview(input);
    this.outputMutationResult(result, format);
  }

  /**
   * 直接輸出變更類結果
   */
  outputMutationResult(result: PreviewResult, format: OutputFormat): void {
    console.log(this.formatMutationResult(result, format));
  }

  /**
   * 格式化變更類結果（不輸出）
   */
  formatMutationResult(result: PreviewResult, format: OutputFormat): string {
    const previewFormat = this.mapToPreviewFormat(format);
    return this.previewFormatter.format(result, previewFormat);
  }

  /**
   * 建立變更類結果（不輸出）
   */
  createMutationResult(input: PreviewInput): PreviewResult {
    return this.previewFormatter.createPreview(input);
  }

  // ========== 唯讀類命令（Query）方法 ==========

  /**
   * 輸出唯讀類結果
   */
  outputQuery(result: QueryResult, format: OutputFormat): void {
    console.log(this.formatQueryResult(result, format));
  }

  /**
   * 格式化唯讀類結果（不輸出）
   */
  formatQueryResult(result: QueryResult, format: OutputFormat): string {
    const queryFormat = this.mapToQueryFormat(format);
    return this.queryFormatter.format(result, queryFormat);
  }

  // ========== 通用方法 ==========

  /**
   * 輸出錯誤
   */
  outputError(error: Error | string, format: OutputFormat): void {
    const message = error instanceof Error ? error.message : error;

    if (format === OutputFormat.Json) {
      console.error(JSON.stringify({ success: false, error: message }));
    } else {
      console.error(`\n❌ 錯誤: ${message}`);
    }
  }

  // ========== Private 方法 ==========

  /**
   * 映射 OutputFormat 到 PreviewFormat
   */
  private mapToPreviewFormat(format: OutputFormat): PreviewFormat {
    switch (format) {
      case OutputFormat.Json:
        return PreviewFormat.Json;
      case OutputFormat.Summary:
        return PreviewFormat.Summary;
      case OutputFormat.Diff:
      default:
        return PreviewFormat.Diff;
    }
  }

  /**
   * 映射 OutputFormat 到 QueryFormat
   */
  private mapToQueryFormat(format: OutputFormat): QueryFormat {
    switch (format) {
      case OutputFormat.Json:
        return QueryFormat.Json;
      case OutputFormat.Summary:
      case OutputFormat.Diff:  // 唯讀命令不支援 diff，fallback 到 summary
      default:
        return QueryFormat.Summary;
    }
  }
}

/**
 * 建立 UnifiedOutputHandler 的工廠函數
 */
export function createUnifiedOutputHandler(options?: UnifiedOutputOptions): UnifiedOutputHandler {
  return new UnifiedOutputHandler(options);
}

/**
 * 解析 format 字串為 OutputFormat
 * @throws Error 如果格式無效
 */
export function parseOutputFormat(format: string, allowDiff = true): OutputFormat {
  switch (format.toLowerCase()) {
    case 'json':
      return OutputFormat.Json;
    case 'summary':
      return OutputFormat.Summary;
    case 'diff':
      if (!allowDiff) {
        throw new Error(`不支援的輸出格式: ${format}。可用格式: json, summary`);
      }
      return OutputFormat.Diff;
    default:
      throw new Error(`不支援的輸出格式: ${format}。可用格式: json, summary${allowDiff ? ', diff' : ''}`);
  }
}
