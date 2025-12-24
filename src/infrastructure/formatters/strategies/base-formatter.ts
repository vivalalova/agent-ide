/**
 * 策略模式基底類別
 * 提供共用常數、方法和介面定義
 */

import * as path from 'path';
import { IssueSeverity, type QueryResult } from '../query-types.js';

/** ANSI 顏色碼 */
export const Colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m'
} as const;

/** 嚴重度對應的顏色和 emoji */
export const SeverityStyle = {
  [IssueSeverity.Critical]: { color: Colors.red, emoji: '🔴' },
  [IssueSeverity.High]: { color: Colors.red, emoji: '🟠' },
  [IssueSeverity.Medium]: { color: Colors.yellow, emoji: '🟡' },
  [IssueSeverity.Low]: { color: Colors.green, emoji: '🟢' }
} as const;

/**
 * 查詢格式化策略介面
 */
export interface IQueryStrategy<T extends QueryResult = QueryResult> {
  /** 格式化為 summary 格式 */
  formatSummary(result: T): string;
}

/**
 * 基底格式化器
 * 提供共用的格式化方法
 */
export abstract class BaseFormatter<T extends QueryResult = QueryResult> implements IQueryStrategy<T> {
  constructor(protected readonly colorEnabled: boolean) {}

  /** 格式化為 summary 格式（子類實作） */
  abstract formatSummary(result: T): string;

  /**
   * 套用顏色（如果啟用）
   */
  protected colorize(text: string, color: string): string {
    if (!this.colorEnabled) {
      return text;
    }
    return `${color}${text}${Colors.reset}`;
  }

  /**
   * 將絕對路徑轉換為相對路徑
   * @param filePath 檔案路徑
   * @param basePath 專案根目錄
   * @returns 相對路徑（若無 basePath 則返回原路徑）
   */
  protected toRelativePath(filePath: string, basePath?: string): string {
    if (!basePath) {
      return filePath;
    }
    if (!path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.relative(basePath, filePath);
  }

  /**
   * 取得類型標籤
   */
  protected getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      function: '函式',
      class: '類別',
      variable: '變數',
      interface: '介面',
      type: '型別',
      property: '屬性',
      method: '方法',
      enum: '列舉',
      constant: '常數'
    };
    return labels[type] || type;
  }
}
