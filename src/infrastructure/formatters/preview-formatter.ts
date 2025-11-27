/**
 * Preview 格式化器
 * 將 PreviewResult 轉換為 diff 或 json 格式輸出
 */

import {
  ChangeLineType,
  PreviewFormat,
  type PreviewFormatterOptions,
  type PreviewResult,
  type FileChange,
  type DiffHunk,
  type ChangeLine,
  type PreviewInput
} from './types.js';
import { generatePreviewResult } from './diff-generator.js';

/** ANSI 顏色碼 */
const Colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
} as const;

/**
 * Preview 格式化器
 * 統一處理所有命令的 dry-run 輸出
 */
export class PreviewFormatter {
  private readonly contextLines: number;
  private readonly color: boolean;

  constructor(options: Partial<PreviewFormatterOptions> = {}) {
    this.contextLines = options.contextLines ?? 3;
    this.color = options.color ?? false;
  }

  /**
   * 從原始輸入資料生成 PreviewResult
   */
  createPreview(input: PreviewInput): PreviewResult {
    return generatePreviewResult(input, this.contextLines);
  }

  /**
   * 格式化 PreviewResult 為指定格式
   */
  format(result: PreviewResult, outputFormat: PreviewFormat = PreviewFormat.Diff): string {
    switch (outputFormat) {
      case PreviewFormat.Diff:
        return this.toDiff(result);
      case PreviewFormat.Json:
        return this.toJson(result);
      default:
        return this.toDiff(result);
    }
  }

  /**
   * 轉換為 unified diff 格式
   */
  toDiff(result: PreviewResult): string {
    const lines: string[] = [];

    // 檔案變更
    result.files.forEach(file => {
      lines.push(...this.formatFileDiff(file));
      lines.push(''); // 檔案之間空行
    });

    // 摘要
    lines.push(this.formatSummary(result));

    // 衝突警告
    if (result.conflicts && result.conflicts.length > 0) {
      lines.push('');
      lines.push(this.colorize('Conflicts:', Colors.red));
      result.conflicts.forEach(conflict => {
        lines.push(this.colorize(`  - ${conflict.message}`, Colors.red));
      });
    }

    // 錯誤訊息
    if (result.errors && result.errors.length > 0) {
      lines.push('');
      lines.push(this.colorize('Errors:', Colors.red));
      result.errors.forEach(error => {
        lines.push(this.colorize(`  - ${error}`, Colors.red));
      });
    }

    return lines.join('\n');
  }

  /**
   * 轉換為 JSON 格式（含上下文）
   */
  toJson(result: PreviewResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * 格式化單一檔案的 diff
   */
  private formatFileDiff(file: FileChange): string[] {
    const lines: string[] = [];

    // 檔案 header
    lines.push(this.colorize(`--- a/${file.filePath}`, Colors.dim));
    lines.push(this.colorize(`+++ b/${file.filePath}`, Colors.dim));

    // Hunks
    file.hunks.forEach(hunk => {
      lines.push(...this.formatHunk(hunk));
    });

    return lines;
  }

  /**
   * 格式化單一 hunk
   */
  private formatHunk(hunk: DiffHunk): string[] {
    const lines: string[] = [];

    // Hunk header
    lines.push(this.colorize(hunk.header, Colors.cyan));

    // 變更行
    hunk.lines.forEach(line => {
      lines.push(this.formatChangeLine(line));
    });

    return lines;
  }

  /**
   * 格式化單一變更行
   */
  private formatChangeLine(line: ChangeLine): string {
    switch (line.type) {
      case ChangeLineType.Add:
        return this.colorize(`+${line.content}`, Colors.green);
      case ChangeLineType.Delete:
        return this.colorize(`-${line.content}`, Colors.red);
      case ChangeLineType.Context:
        return ` ${line.content}`;
      default:
        return ` ${line.content}`;
    }
  }

  /**
   * 格式化摘要行
   */
  private formatSummary(result: PreviewResult): string {
    const { summary } = result;
    const parts = [
      `${summary.totalFiles} file${summary.totalFiles !== 1 ? 's' : ''}`,
      `${summary.totalChanges} change${summary.totalChanges !== 1 ? 's' : ''}`
    ];

    if (summary.additions > 0 || summary.deletions > 0) {
      const addPart = this.colorize(`+${summary.additions}`, Colors.green);
      const delPart = this.colorize(`-${summary.deletions}`, Colors.red);
      parts.push(`(${addPart} ${delPart})`);
    }

    return `Summary: ${parts.join(', ')}`;
  }

  /**
   * 套用顏色（如果啟用）
   */
  private colorize(text: string, color: string): string {
    if (!this.color) {
      return text;
    }
    return `${color}${text}${Colors.reset}`;
  }
}

/**
 * 建立 PreviewFormatter 的工廠函數
 * 根據終端機環境自動決定是否啟用顏色
 */
export function createPreviewFormatter(options: Partial<PreviewFormatterOptions> = {}): PreviewFormatter {
  const finalOptions: Partial<PreviewFormatterOptions> = {
    contextLines: options.contextLines ?? 3,
    color: options.color ?? (process.stdout.isTTY ?? false)
  };
  return new PreviewFormatter(finalOptions);
}
