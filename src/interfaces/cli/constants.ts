/**
 * CLI 常量定義
 * 集中管理 CLI 相關的魔術數字和常量
 */

/**
 * 默認值常量
 */
export const DEFAULT_VALUES = {
  /** 搜尋結果數量限制 */
  SEARCH_LIMIT: 50,
  /** ShitScore 顯示的最糟項目數量 */
  TOP_SHIT_COUNT: 10,
  /** 高複雜度閾值 */
  HIGH_COMPLEXITY_THRESHOLD: 10,
} as const;

/**
 * 格式化常量
 */
export const FORMAT = {
  /** 分隔線長度 */
  SEPARATOR_LENGTH: 50,
  /** 最大評分 */
  MAX_SCORE: 100,
  /** 百分比轉換係數 */
  PERCENTAGE_MULTIPLIER: 100,
} as const;

/**
 * 輸出格式類型
 */
export const OUTPUT_FORMATS = {
  JSON: 'json',
  MINIMAL: 'minimal',
  SUMMARY: 'summary',
} as const;

/**
 * 創建分隔線
 */
export function createSeparator(char: string = '='): string {
  return char.repeat(FORMAT.SEPARATOR_LENGTH);
}
