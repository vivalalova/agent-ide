/**
 * CLI Preview 輸出處理器
 * 統一處理所有支援 dry-run 命令的輸出
 */

import {
  createPreviewFormatter,
  PreviewFormat,
  type PreviewResult,
  type PreviewInput
} from '../../infrastructure/formatters/index.js';

/** CLI 輸出格式選項 */
export enum OutputFormatOption {
  Diff = 'diff',
  Json = 'json',
  Summary = 'summary'
}

/** 輸出選項 */
export interface PreviewOutputOptions {
  /** 輸出格式 */
  format: OutputFormatOption;
  /** 是否啟用顏色 */
  color?: boolean;
  /** 上下文行數 */
  contextLines?: number;
}

/**
 * Preview 輸出處理器
 * 統一處理 dry-run 和實際執行的輸出
 */
export class PreviewOutputHandler {
  private readonly formatter;

  constructor(options: Partial<PreviewOutputOptions> = {}) {
    this.formatter = createPreviewFormatter({
      contextLines: options.contextLines ?? 3,
      color: options.color ?? (process.stdout.isTTY ?? false)
    });
  }

  /**
   * 從 PreviewInput 生成並輸出 PreviewResult
   */
  output(input: PreviewInput, format: OutputFormatOption): void {
    const result = this.formatter.createPreview(input);
    this.outputResult(result, format);
  }

  /**
   * 直接輸出 PreviewResult
   */
  outputResult(result: PreviewResult, format: OutputFormatOption): void {
    const outputFormat = this.mapFormat(format);
    console.log(this.formatter.format(result, outputFormat));
  }

  /**
   * 取得 PreviewResult（不輸出）
   */
  createResult(input: PreviewInput): PreviewResult {
    return this.formatter.createPreview(input);
  }

  /**
   * 格式化為字串（不輸出）
   */
  formatResult(result: PreviewResult, format: OutputFormatOption): string {
    const outputFormat = this.mapFormat(format);
    return this.formatter.format(result, outputFormat);
  }

  /**
   * CLI format 選項映射到 PreviewFormat
   */
  private mapFormat(format: OutputFormatOption): PreviewFormat {
    switch (format) {
      case OutputFormatOption.Json:
        return PreviewFormat.Json;
      case OutputFormatOption.Summary:
        return PreviewFormat.Summary;
      case OutputFormatOption.Diff:
      default:
        return PreviewFormat.Diff;
    }
  }
}

/**
 * 建立 PreviewOutputHandler 的工廠函數
 */
export function createOutputHandler(options?: Partial<PreviewOutputOptions>): PreviewOutputHandler {
  return new PreviewOutputHandler(options);
}
