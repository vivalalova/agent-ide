/**
 * 行提取器 - 負責行的提取、刪除和插入
 */

import type { LineExtractionResult, LineInsertionResult } from '@core/shift/types.js';

/**
 * 行提取器類別
 */
export class LineExtractor {
  /**
   * 從內容中提取指定範圍的行
   * @param content - 檔案內容
   * @param fromLine - 起始行號（1-based，包含）
   * @param toLine - 結束行號（1-based，包含）
   * @returns 提取結果
   */
  extractLines(content: string, fromLine: number, toLine: number): LineExtractionResult {
    const lines = content.split('\n');
    const totalLines = lines.length;

    // 驗證行號範圍
    if (fromLine < 1) {
      throw new Error(`起始行號必須 >= 1，實際值：${fromLine}`);
    }

    if (toLine < fromLine) {
      throw new Error(`結束行號 (${toLine}) 不可小於起始行號 (${fromLine})`);
    }

    if (fromLine > totalLines) {
      throw new Error(`起始行號 (${fromLine}) 超出檔案總行數 (${totalLines})`);
    }

    if (toLine > totalLines) {
      throw new Error(`結束行號 (${toLine}) 超出檔案總行數 (${totalLines})`);
    }

    // 轉換為 0-based index
    const startIndex = fromLine - 1;
    const endIndex = toLine;

    // 提取行（包含 fromLine 和 toLine）
    const extractedLines = lines.slice(startIndex, endIndex);

    // 移除提取的行
    const remainingLines = [
      ...lines.slice(0, startIndex),
      ...lines.slice(endIndex)
    ];

    return {
      extractedLines,
      remainingContent: remainingLines.join('\n'),
      linesCount: extractedLines.length
    };
  }

  /**
   * 在指定位置插入行
   * @param content - 目標檔案內容
   * @param linesToInsert - 要插入的行
   * @param position - 插入位置（1-based，插入到此行之前）
   * @returns 插入結果
   */
  insertLines(
    content: string,
    linesToInsert: readonly string[],
    position: number
  ): LineInsertionResult {
    const lines = content.split('\n');
    const totalLines = lines.length;

    // 驗證插入位置
    if (position < 1) {
      throw new Error(`插入位置必須 >= 1，實際值：${position}`);
    }

    // 允許插入到檔案末尾後（position = totalLines + 1）
    if (position > totalLines + 1) {
      throw new Error(`插入位置 (${position}) 超出有效範圍 (1-${totalLines + 1})`);
    }

    // 轉換為 0-based index
    const insertIndex = position - 1;

    // 插入行到指定位置之前
    const resultLines = [
      ...lines.slice(0, insertIndex),
      ...linesToInsert,
      ...lines.slice(insertIndex)
    ];

    return {
      content: resultLines.join('\n'),
      insertedAt: position,
      linesCount: linesToInsert.length
    };
  }

  /**
   * 從內容中移除指定範圍的行
   * @param content - 檔案內容
   * @param fromLine - 起始行號（1-based，包含）
   * @param toLine - 結束行號（1-based，包含）
   * @returns 移除後的內容
   */
  removeLines(content: string, fromLine: number, toLine: number): string {
    const result = this.extractLines(content, fromLine, toLine);
    return result.remainingContent;
  }

  /**
   * 計算檔案的總行數
   * @param content - 檔案內容
   * @returns 總行數
   */
  countLines(content: string): number {
    return content.split('\n').length;
  }

  /**
   * 驗證行號範圍是否有效
   * @param content - 檔案內容
   * @param fromLine - 起始行號
   * @param toLine - 結束行號
   * @returns 是否有效
   */
  validateLineRange(content: string, fromLine: number, toLine: number): boolean {
    const totalLines = this.countLines(content);

    return (
      fromLine >= 1 &&
      toLine >= fromLine &&
      fromLine <= totalLines &&
      toLine <= totalLines
    );
  }

  /**
   * 驗證插入位置是否有效
   * @param content - 檔案內容
   * @param position - 插入位置
   * @returns 是否有效
   */
  validatePosition(content: string, position: number): boolean {
    const totalLines = this.countLines(content);
    return position >= 1 && position <= totalLines + 1;
  }
}
